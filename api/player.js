const { isValidAddress, loadProfile, saveProfile, normalizeAddress, sendJson } = require("./_lib/profile");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const address = normalizeAddress(req.query.address);
  if (!isValidAddress(address)) {
    return sendJson(res, 400, { error: "Invalid address" });
  }

  const profile = await loadProfile(address);
  const saved = await saveProfile(profile);
  return sendJson(res, 200, { profile: saved });
};
