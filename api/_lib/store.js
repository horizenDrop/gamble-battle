const memory = new Map();
const memoryExpiry = new Map();
let redisClientPromise = null;

function hasRedisConfig() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function hasRedisUrlConfig() {
  return Boolean(normalizeRedisUrl(process.env.REDIS_URL));
}

async function getRedisUrlClient() {
  if (!hasRedisUrlConfig()) return null;

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const { createClient } = require("redis");
      const client = createClient({
        url: normalizeRedisUrl(process.env.REDIS_URL),
        socket: { connectTimeout: 5000 }
      });
      client.on("error", () => {
        // handled by failing read/write operations when needed
      });
      await client.connect();
      return client;
    })();

    // A rejected promise must not stay cached, otherwise one bad connect
    // permanently breaks every later request in this warm instance.
    redisClientPromise.catch(() => {
      redisClientPromise = null;
    });
  }

  const client = await redisClientPromise;
  if (client && client.isOpen === false) {
    redisClientPromise = null;
    return getRedisUrlClient();
  }
  return client;
}

// Upstash REST accepts a command array in the POST body. The older
// `/set/<key>/<value>` path form breaks as soon as a value (a profile, the
// leaderboard index) grows past the URL length limit.
async function upstashCommand(command) {
  const base = String(process.env.UPSTASH_REDIS_REST_URL).replace(/\/$/, "");
  const response = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command.map((part) => String(part)))
  });

  if (!response.ok) {
    throw new Error(`Redis request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload && payload.error) {
    throw new Error(`Redis error: ${payload.error}`);
  }
  return payload?.result ?? null;
}

function memoryGet(key) {
  const expiresAt = memoryExpiry.get(key);
  if (expiresAt && expiresAt <= Date.now()) {
    memory.delete(key);
    memoryExpiry.delete(key);
    return null;
  }
  return memory.get(key) ?? null;
}

async function getValue(key) {
  if (hasRedisUrlConfig()) {
    const client = await getRedisUrlClient();
    const value = await client.get(key);
    return value == null ? null : String(value);
  }

  if (hasRedisConfig()) {
    const result = await upstashCommand(["GET", key]);
    return result == null ? null : String(result);
  }

  return memoryGet(key);
}

async function setValue(key, value, ttlMs = 0) {
  if (hasRedisUrlConfig()) {
    const client = await getRedisUrlClient();
    if (ttlMs > 0) {
      await client.set(key, value, { PX: ttlMs });
    } else {
      await client.set(key, value);
    }
    return;
  }

  if (hasRedisConfig()) {
    const command = ttlMs > 0 ? ["SET", key, value, "PX", Math.ceil(ttlMs)] : ["SET", key, value];
    await upstashCommand(command);
    return;
  }

  memory.set(key, String(value));
  if (ttlMs > 0) {
    memoryExpiry.set(key, Date.now() + ttlMs);
  } else {
    memoryExpiry.delete(key);
  }
}

// Atomic "claim this key" primitive. Used for locks and for one-shot guards
// (a check-in tx reference, finalizing a match exactly once).
async function setIfAbsent(key, value, ttlMs) {
  if (hasRedisUrlConfig()) {
    const client = await getRedisUrlClient();
    const result = await client.set(key, value, { NX: true, PX: Math.ceil(ttlMs) });
    return result === "OK";
  }

  if (hasRedisConfig()) {
    const result = await upstashCommand(["SET", key, value, "NX", "PX", Math.ceil(ttlMs)]);
    return result === "OK";
  }

  if (memoryGet(key) !== null) return false;
  memory.set(key, String(value));
  memoryExpiry.set(key, Date.now() + ttlMs);
  return true;
}

async function deleteValue(key) {
  if (hasRedisUrlConfig()) {
    const client = await getRedisUrlClient();
    await client.del(key);
    return;
  }

  if (hasRedisConfig()) {
    await upstashCommand(["DEL", key]);
    return;
  }

  memory.delete(key);
  memoryExpiry.delete(key);
}

async function withLock(name, ttlMs, fn) {
  const key = `gb:lock:${name}`;
  const token = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const deadline = Date.now() + ttlMs;

  while (Date.now() < deadline) {
    if (await setIfAbsent(key, token, ttlMs)) {
      try {
        return await fn();
      } finally {
        await deleteValue(key).catch(() => {});
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  // Lock never became available: run anyway rather than failing the request.
  return fn();
}

function getStoreMode() {
  if (hasRedisUrlConfig()) return "redis_url";
  return hasRedisConfig() ? "redis" : "memory";
}

async function pingStore() {
  const key = `gb:ping:${Date.now()}`;
  const value = String(Date.now());
  await setValue(key, value, 60_000);
  const loaded = await getValue(key);
  await deleteValue(key).catch(() => {});
  return loaded === value;
}

module.exports = {
  getValue,
  setValue,
  setIfAbsent,
  deleteValue,
  withLock,
  hasRedisConfig,
  hasRedisUrlConfig,
  getStoreMode,
  pingStore
};

function normalizeRedisUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}
