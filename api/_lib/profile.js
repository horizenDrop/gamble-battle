const { getValue, setValue } = require("./store");

const DEFAULT_PROFILE = {
  address: "",
  balance: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  totalGames: 0,
  pveGames: 0,
  pvpGames: 0,
  pvePlayerWins: 0,
  pveBotWins: 0,
  checkins: 0,
  lastCheckinDay: "",
  lastCheckinTx: "",
  lastCheckinRef: "",
  lastSpinAt: 0,
  lastSpinReward: 0,
  lastSpinSymbols: [7, 7, 7],
  updatedAt: 0
};

function normalizeAddress(address) {
  return String(address ?? "").trim().toLowerCase();
}

function profileKey(address) {
  return `gb:profile:${normalizeAddress(address)}`;
}

function isValidAddress(address) {
  const value = normalizeAddress(address);
  return /^0x[a-f0-9]{40}$/.test(value);
}

async function loadProfile(address) {
  const normalized = normalizeAddress(address);
  const raw = await getValue(profileKey(normalized));
  if (!raw) {
    return {
      ...DEFAULT_PROFILE,
      address: normalized,
      updatedAt: Date.now()
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      address: normalized
    };
  } catch {
    return {
      ...DEFAULT_PROFILE,
      address: normalized,
      updatedAt: Date.now()
    };
  }
}

async function saveProfile(profile) {
  const next = {
    ...DEFAULT_PROFILE,
    ...profile,
    address: normalizeAddress(profile.address),
    updatedAt: Date.now()
  };

  await setValue(profileKey(next.address), JSON.stringify(next));
  return next;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

module.exports = {
  normalizeAddress,
  isValidAddress,
  loadProfile,
  saveProfile,
  todayKey,
  parseBody,
  sendJson
};
