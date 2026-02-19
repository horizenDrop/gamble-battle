const { getValue, setValue } = require("./store");

const DEFAULT_PROFILE = {
  address: "",
  evmAddress: "",
  nickname: "",
  balance: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  totalGames: 0,
  pveGames: 0,
  pvpGames: 0,
  pvePlayerWins: 0,
  pveBotWins: 0,
  pvpWins: 0,
  pvpLosses: 0,
  pvpDraws: 0,
  pveWinRate: 0,
  pvpWinRate: 0,
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
const PROFILE_INDEX_KEY = "gb:profiles:index";

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
  const pveGames = Number(profile.pveGames ?? 0);
  const pvpGames = Number(profile.pvpGames ?? 0);
  const pvePlayerWins = Number(profile.pvePlayerWins ?? 0);
  const pvpWins = Number(profile.pvpWins ?? 0);

  const next = {
    ...DEFAULT_PROFILE,
    ...profile,
    address: normalizeAddress(profile.address),
    evmAddress: normalizeAddress(profile.address),
    nickname: sanitizeNickname(profile.nickname),
    pveWinRate: pveGames > 0 ? round2((pvePlayerWins / pveGames) * 100) : 0,
    pvpWinRate: pvpGames > 0 ? round2((pvpWins / pvpGames) * 100) : 0,
    updatedAt: Date.now()
  };

  await setValue(profileKey(next.address), JSON.stringify(next));
  await upsertProfileIndex(next);
  return next;
}

async function listProfiles(limit = 20) {
  const raw = await getValue(PROFILE_INDEX_KEY);
  if (!raw) return [];

  let index;
  try {
    index = JSON.parse(raw);
  } catch {
    return [];
  }

  const entries = Object.values(index ?? {}).filter(Boolean);
  entries.sort((a, b) => {
    if ((b.balance ?? 0) !== (a.balance ?? 0)) return (b.balance ?? 0) - (a.balance ?? 0);
    if ((b.pvpWinRate ?? 0) !== (a.pvpWinRate ?? 0)) return (b.pvpWinRate ?? 0) - (a.pvpWinRate ?? 0);
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });

  return entries.slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
}

async function findProfileByNickname(nickname) {
  const target = sanitizeNickname(nickname).toLowerCase();
  if (!target) return null;

  const raw = await getValue(PROFILE_INDEX_KEY);
  if (!raw) return null;

  let index;
  try {
    index = JSON.parse(raw);
  } catch {
    return null;
  }

  for (const row of Object.values(index ?? {})) {
    const current = sanitizeNickname(row?.nickname ?? "").toLowerCase();
    if (current && current === target) {
      return row;
    }
  }

  return null;
}

async function upsertProfileIndex(profile) {
  let index = {};
  const raw = await getValue(PROFILE_INDEX_KEY);
  if (raw) {
    try {
      index = JSON.parse(raw) ?? {};
    } catch {
      index = {};
    }
  }

  index[profile.address] = {
    address: profile.address,
    evmAddress: profile.evmAddress,
    nickname: profile.nickname,
    balance: profile.balance,
    checkins: profile.checkins,
    pveWinRate: profile.pveWinRate,
    pvpWinRate: profile.pvpWinRate,
    wins: profile.wins,
    losses: profile.losses,
    draws: profile.draws,
    updatedAt: profile.updatedAt
  };

  await setValue(PROFILE_INDEX_KEY, JSON.stringify(index));
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
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.status(status).json(payload);
}

function sanitizeNickname(value) {
  const clean = String(value ?? "").trim().slice(0, 24);
  return clean.replace(/[^\p{L}\p{N}_\- ]/gu, "");
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  normalizeAddress,
  isValidAddress,
  loadProfile,
  saveProfile,
  listProfiles,
  findProfileByNickname,
  todayKey,
  parseBody,
  sendJson,
  sanitizeNickname
};
