const { getStoreMode, pingStore, hasRedisConfig } = require("./_lib/store");
const { sendJson } = require("./_lib/profile");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const ok = await pingStore();
    return sendJson(res, 200, {
      ok,
      mode: getStoreMode(),
      redisConfigured: hasRedisConfig()
    });
  } catch (error) {
    return sendJson(res, 200, {
      ok: false,
      mode: getStoreMode(),
      redisConfigured: hasRedisConfig(),
      error: error?.message ?? "unknown"
    });
  }
};
