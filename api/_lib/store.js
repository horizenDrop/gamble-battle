const memory = new Map();

function hasRedisConfig() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
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
  if (hasRedisConfig()) {
    const payload = await redisRequest(`/get/${encodeURIComponent(key)}`);
    if (payload.result == null) return null;
    return String(payload.result);
  }

  return memory.get(key) ?? null;
}

async function setValue(key, value) {
  if (hasRedisConfig()) {
    await redisRequest(`/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`);
    return;
  }

  memory.set(key, value);
}

module.exports = {
  getValue,
  setValue,
  hasRedisConfig
};
