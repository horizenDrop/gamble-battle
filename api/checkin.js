const { isValidAddress, loadProfile, parseBody, saveProfile, sendJson, todayKey } = require("./_lib/profile");
const { setIfAbsent, withLock } = require("./_lib/store");

const TX_REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  const address = String(body.address ?? "").toLowerCase();
  const txHash = String(body.txHash ?? "");
  const txRef = String(body.txRef ?? txHash).trim();
  const chainId = String(body.chainId ?? "");

  if (!isValidAddress(address)) {
    return sendJson(res, 400, { error: "Invalid address" });
  }

  if (!txRef || txRef.length > 200) {
    return sendJson(res, 400, { error: "Invalid tx reference" });
  }

  const reference = chainId ? `${chainId}:${txRef}` : txRef;

  // One transaction reference counts once. Without this the endpoint happily
  // re-counts the same check-in on every retry (and on a replayed request).
  const fresh = await setIfAbsent(`gb:checkin:ref:${reference.toLowerCase()}`, address, TX_REF_TTL_MS);
  if (!fresh) {
    const profile = await loadProfile(address);
    return sendJson(res, 200, { ok: false, reason: "ALREADY_CHECKED_IN", profile });
  }

  const saved = await withLock(`checkin:${address}`, 3_000, async () => {
    const profile = await loadProfile(address);
    profile.checkins += 1;
    profile.lastCheckinDay = todayKey();
    profile.lastCheckinTx = txHash;
    profile.lastCheckinRef = reference;
    return saveProfile(profile);
  });

  return sendJson(res, 200, { ok: true, profile: saved });
};
