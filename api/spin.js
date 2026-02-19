const { isValidAddress, loadProfile, parseBody, saveProfile, sendJson } = require("./_lib/profile");

const COOLDOWN_MS = 60 * 60 * 1000;

const SYMBOLS = [
  { id: "cherry", icon: "🍒", weight: 28, value: 4 },
  { id: "lemon", icon: "🍋", weight: 24, value: 5 },
  { id: "bar", icon: "🟦", weight: 20, value: 8 },
  { id: "seven", icon: "7", weight: 16, value: 14 },
  { id: "diamond", icon: "💎", weight: 12, value: 24 }
];

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

  const symbols = [drawWeighted(), drawWeighted(), drawWeighted()];
  const payout = evaluatePayout(symbols);

  profile.balance += payout.reward;
  profile.lastSpinAt = now;
  profile.lastSpinReward = payout.reward;
  profile.lastSpinSymbols = symbols.map((s) => s.id);

  const saved = await saveProfile(profile);
  return sendJson(res, 200, {
    ok: true,
    reward: payout.reward,
    tier: payout.tier,
    label: payout.label,
    symbols: symbols.map((s) => s.id),
    displaySymbols: symbols.map((s) => s.icon),
    profile: saved
  });
};

function drawWeighted() {
  const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;

  for (const symbol of SYMBOLS) {
    roll -= symbol.weight;
    if (roll <= 0) return symbol;
  }

  return SYMBOLS[0];
}

function evaluatePayout(symbols) {
  const ids = symbols.map((s) => s.id);
  const [a, b, c] = ids;

  if (a === "diamond" && b === "diamond" && c === "diamond") {
    return { reward: 500, tier: "jackpot", label: "DIAMOND JACKPOT" };
  }

  if (a === b && b === c) {
    const base = symbols[0].value;
    const reward = base * 18;
    return { reward, tier: "mega", label: "TRIPLE HIT" };
  }

  if (a === b || b === c || a === c) {
    const pairId = a === b ? a : b === c ? b : a;
    const pairSymbol = SYMBOLS.find((s) => s.id === pairId) ?? SYMBOLS[0];
    const luckyBoost = Math.random() < 0.2;
    const reward = pairSymbol.value * (luckyBoost ? 8 : 5);
    return {
      reward,
      tier: luckyBoost ? "hot" : "good",
      label: luckyBoost ? "LUCKY BOOST x8" : "PAIR x5"
    };
  }

  const baseReward = symbols.reduce((sum, s) => sum + s.value, 0);
  return { reward: Math.max(6, baseReward), tier: "base", label: "BASE REWARD" };
}
