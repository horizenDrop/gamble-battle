const memory = new Map();
let redisClientPromise = null;

function hasRedisConfig() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function hasRedisUrlConfig() {
  return Boolean(normalizeRedisUrl(process.env.REDIS_URL));
}

async function getRedisUrlClient() {
  if (!hasRedisUrlConfig()) return null;
  if (redisClientPromise) return redisClientPromise;

  redisClientPromise = (async () => {
    const { createClient } = require("redis");
    const client = createClient({ url: normalizeRedisUrl(process.env.REDIS_URL) });
    client.on("error", () => {
      // handled by failing read/write operations when needed
    });
    await client.connect();
    return client;
  })();

  return redisClientPromise;
}

async function redisRequest(path, options = {}) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Redis request failed: ${response.status}`);
  }

  return response.json();
}

async function getValue(key) {
  if (hasRedisUrlConfig()) {
    const client = await getRedisUrlClient();
    const value = await client.get(key);
    return value == null ? null : String(value);
  }

  if (hasRedisConfig()) {
    const payload = await redisRequest(`/get/${encodeURIComponent(key)}`);
    if (payload.result == null) return null;
    return String(payload.result);
  }

  return memory.get(key) ?? null;
}

async function setValue(key, value) {
  if (hasRedisUrlConfig()) {
    const client = await getRedisUrlClient();
    await client.set(key, value);
    return;
  }

  if (hasRedisConfig()) {
    await redisRequest(`/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`);
    return;
  }

  memory.set(key, value);
}

async function deleteValue(key) {
  if (hasRedisUrlConfig()) {
    const client = await getRedisUrlClient();
    await client.del(key);
    return;
  }

  if (hasRedisConfig()) {
    await redisRequest(`/del/${encodeURIComponent(key)}`);
    return;
  }

  memory.delete(key);
}

function getStoreMode() {
  if (hasRedisUrlConfig()) return "redis_url";
  return hasRedisConfig() ? "redis" : "memory";
}

async function pingStore() {
  const key = `gb:ping:${Date.now()}`;
  const value = String(Date.now());
  await setValue(key, value);
  const loaded = await getValue(key);
  return loaded === value;
}

module.exports = {
  getValue,
  setValue,
  deleteValue,
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
