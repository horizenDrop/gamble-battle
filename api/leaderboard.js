const { listProfiles, sendJson } = require("./_lib/profile");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const limit = Number(req.query.limit ?? 20);
  const rows = await listProfiles(limit);
  return sendJson(res, 200, { rows });
};
