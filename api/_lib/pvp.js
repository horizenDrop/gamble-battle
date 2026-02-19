const { getValue, setValue, deleteValue } = require("./store");
const { isValidAddress, loadProfile, saveProfile } = require("./profile");

const PVP_ENTRY_COST = 10;
const TURN_TIMEOUT_MS = 60_000;
const QUEUE_KEY = "gb:pvp:queue";
const MATCH_KEY_PREFIX = "gb:pvp:match:";
const PLAYER_MATCH_PREFIX = "gb:pvp:player:";
const LAST_RESULT_PREFIX = "gb:pvp:last:";

function normalize(address) {
  return String(address ?? "").trim().toLowerCase();
}

function matchKey(matchId) {
  return `${MATCH_KEY_PREFIX}${matchId}`;
}

function playerMatchKey(address) {
  return `${PLAYER_MATCH_PREFIX}${normalize(address)}`;
}

function lastResultKey(address) {
  return `${LAST_RESULT_PREFIX}${normalize(address)}`;
}

async function getQueue() {
  const raw = await getValue(QUEUE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setQueue(queue) {
  await setValue(QUEUE_KEY, JSON.stringify(queue));
}

async function clearQueue() {
  await deleteValue(QUEUE_KEY);
}

async function getPlayerMatchId(address) {
  const raw = await getValue(playerMatchKey(address));
  return raw ? String(raw) : null;
}

async function setPlayerMatchId(address, matchId) {
  await setValue(playerMatchKey(address), String(matchId));
}

async function clearPlayerMatchId(address) {
  await deleteValue(playerMatchKey(address));
}

async function loadMatch(matchId) {
  const raw = await getValue(matchKey(matchId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveMatch(match) {
  await setValue(matchKey(match.id), JSON.stringify(match));
}

async function clearMatch(matchId) {
  await deleteValue(matchKey(matchId));
}

function createInitialMatch(playerA, playerB) {
  const players = [normalize(playerA), normalize(playerB)];
  const starter = Math.random() < 0.5 ? "X" : "O";
  return {
    id: createId(),
    players: {
      X: players[0],
      O: players[1]
    },
    board: Array(9).fill(null),
    status: "active",
    turn: starter,
    turnAddress: starter === "X" ? players[0] : players[1],
    turnStartedAt: Date.now(),
    round: 1,
    roundStarter: starter,
    pot: PVP_ENTRY_COST * 2,
    entryCost: PVP_ENTRY_COST,
    winner: null,
    reason: ""
  };
}

function markerFor(match, address) {
  const normalized = normalize(address);
  if (match.players.X === normalized) return "X";
  if (match.players.O === normalized) return "O";
  return null;
}

function winnerMarker(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

async function ensurePlayersCanEnter(playerA, playerB) {
  const profileA = await loadProfile(playerA);
  const profileB = await loadProfile(playerB);
  if (profileA.balance < PVP_ENTRY_COST) return { ok: false, who: normalize(playerA) };
  if (profileB.balance < PVP_ENTRY_COST) return { ok: false, who: normalize(playerB) };
  return { ok: true, profileA, profileB };
}

async function chargeEntry(profileA, profileB) {
  profileA.balance -= PVP_ENTRY_COST;
  profileB.balance -= PVP_ENTRY_COST;
  const savedA = await saveProfile(profileA);
  const savedB = await saveProfile(profileB);
  return { savedA, savedB };
}

async function finalizeMatch(match, winnerAddress, reason) {
  const loserAddress = winnerAddress === match.players.X ? match.players.O : match.players.X;
  const winner = await loadProfile(winnerAddress);
  const loser = await loadProfile(loserAddress);

  winner.balance += match.pot;
  winner.totalGames += 1;
  loser.totalGames += 1;
  winner.pvpGames += 1;
  loser.pvpGames += 1;
  winner.wins += 1;
  loser.losses += 1;
  winner.pvpWins += 1;
  loser.pvpLosses += 1;

  const savedWinner = await saveProfile(winner);
  const savedLoser = await saveProfile(loser);

  const resultWinner = {
    status: "finished",
    outcome: "win",
    reason,
    winner: normalize(winnerAddress),
    reward: match.pot,
    matchId: match.id
  };
  const resultLoser = {
    status: "finished",
    outcome: "loss",
    reason,
    winner: normalize(winnerAddress),
    reward: 0,
    matchId: match.id
  };

  await setValue(lastResultKey(winnerAddress), JSON.stringify({ ...resultWinner, profile: savedWinner }));
  await setValue(lastResultKey(loserAddress), JSON.stringify({ ...resultLoser, profile: savedLoser }));

  await clearPlayerMatchId(winnerAddress);
  await clearPlayerMatchId(loserAddress);
  await clearMatch(match.id);
}

async function getAndClearLastResult(address) {
  const key = lastResultKey(address);
  const raw = await getValue(key);
  if (!raw) return null;
  await deleteValue(key);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function resolveTimeoutIfNeeded(match) {
  if (!match || match.status !== "active") return { resolved: false, match };
  if (Date.now() - Number(match.turnStartedAt ?? 0) <= TURN_TIMEOUT_MS) {
    return { resolved: false, match };
  }

  const winner = normalize(match.turnAddress) === match.players.X ? match.players.O : match.players.X;
  await finalizeMatch(match, winner, "timeout");
  return { resolved: true, match: null };
}

function canJoinAddress(address) {
  return isValidAddress(normalize(address));
}

function createId() {
  return `pvp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  PVP_ENTRY_COST,
  TURN_TIMEOUT_MS,
  normalize,
  getQueue,
  setQueue,
  clearQueue,
  getPlayerMatchId,
  setPlayerMatchId,
  clearPlayerMatchId,
  loadMatch,
  saveMatch,
  createInitialMatch,
  markerFor,
  winnerMarker,
  ensurePlayersCanEnter,
  chargeEntry,
  finalizeMatch,
  getAndClearLastResult,
  resolveTimeoutIfNeeded,
  canJoinAddress
};
