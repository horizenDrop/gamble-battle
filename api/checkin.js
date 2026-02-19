const { isValidAddress, loadProfile, parseBody, saveProfile, sendJson, todayKey } = require("./_lib/profile");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  const address = String(body.address ?? "").toLowerCase();
  const txHash = String(body.txHash ?? "");

  if (!isValidAddress(address)) {
    return sendJson(res, 400, { error: "Invalid address" });
  }

  if (!/^0x([a-fA-F0-9]{64})$/.test(txHash)) {
    return sendJson(res, 400, { error: "Invalid tx hash" });
  }

  const profile = await loadProfile(address);
  const today = todayKey();

  if (profile.lastCheckinDay === today) {
    return sendJson(res, 200, { ok: false, reason: "ALREADY_CHECKED_IN", profile });
  }

  profile.checkins += 1;
  profile.lastCheckinDay = today;
  profile.lastCheckinTx = txHash;

  const saved = await saveProfile(profile);
  return sendJson(res, 200, { ok: true, profile: saved });
};
