const { isValidAddress, loadProfile, saveProfile, normalizeAddress, parseBody, sendJson, sanitizeNickname, findProfileByNickname } = require("./_lib/profile");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const address = normalizeAddress(req.query.address);
    if (!isValidAddress(address)) {
      return sendJson(res, 400, { error: "Invalid address" });
    }

    const profile = await loadProfile(address);
    const saved = await saveProfile(profile);
    return sendJson(res, 200, { profile: saved });
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    const address = normalizeAddress(body.address);
    const nickname = sanitizeNickname(body.nickname);

    if (!isValidAddress(address)) {
      return sendJson(res, 400, { error: "Invalid address" });
    }

    if (!nickname || nickname.length < 2) {
      return sendJson(res, 400, { error: "Nickname must be at least 2 chars" });
    }

    const profile = await loadProfile(address);
    if (profile.nickname) {
      return sendJson(res, 200, { ok: false, reason: "NICKNAME_LOCKED", profile });
    }

    const existing = await findProfileByNickname(nickname);
    if (existing && normalizeAddress(existing.address) !== address) {
      return sendJson(res, 200, { ok: false, reason: "NICKNAME_TAKEN" });
    }

    profile.nickname = nickname;
    const saved = await saveProfile(profile);
    return sendJson(res, 200, { ok: true, profile: saved });
  }

  return sendJson(res, 405, { error: "Method not allowed" });
};
