const { isValidAddress, loadProfile, parseBody, saveProfile, sendJson } = require("./_lib/profile");

const SPIN_VALUES = [1, 2, 3, 5, 8, 13];
const COOLDOWN_MS = 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  const address = String(body.address ?? "").toLowerCase();

  if (!isValidAddress(address)) {
    return sendJson(res, 400, { error: "Invalid address" });
  }

  const profile = await loadProfile(address);
  const now = Date.now();
  const elapsed = now - profile.lastSpinAt;

  if (profile.lastSpinAt > 0 && elapsed < COOLDOWN_MS) {
    return sendJson(res, 200, {
      ok: false,
      cooldownActive: true,
      waitMs: COOLDOWN_MS - elapsed,
      profile
    });
  }

  const symbols = [randSymbol(), randSymbol(), randSymbol()];
  const reward = symbols.reduce((sum, n) => sum + n, 0);

  profile.balance += reward;
  profile.lastSpinAt = now;
  profile.lastSpinReward = reward;
  profile.lastSpinSymbols = symbols;

  const saved = await saveProfile(profile);
  return sendJson(res, 200, {
    ok: true,
    reward,
    symbols,
    profile: saved
  });
};

function randSymbol() {
  return SPIN_VALUES[Math.floor(Math.random() * SPIN_VALUES.length)];
}
