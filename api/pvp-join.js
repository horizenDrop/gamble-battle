const { loadProfile, parseBody, sendJson } = require("./_lib/profile");
const {
  PVP_ENTRY_COST,
  normalize,
  getQueue,
  setQueue,
  clearQueue,
  getPlayerMatchId,
  setPlayerMatchId,
  loadMatch,
  saveMatch,
  createInitialMatch,
  ensurePlayersCanEnter,
  chargeEntry,
  withMatchmakingLock,
  canJoinAddress
} = require("./_lib/pvp");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  const address = normalize(body.address);
  if (!canJoinAddress(address)) {
    return sendJson(res, 400, { error: "Invalid address" });
  }

  const existingMatchId = await getPlayerMatchId(address);
  if (existingMatchId) {
    const existingMatch = await loadMatch(existingMatchId);
    if (existingMatch) {
      return sendJson(res, 200, { status: "active", match: toMatchView(existingMatch, address) });
    }
  }

  const profile = await loadProfile(address);
  if (profile.balance < PVP_ENTRY_COST) {
    return sendJson(res, 200, { status: "insufficient", required: PVP_ENTRY_COST, balance: profile.balance });
  }

  // Reading the queue and creating the match must be one critical section,
  // otherwise two joins can pair with the same queued player and charge them
  // twice.
  const outcome = await withMatchmakingLock(async () => {
    const queue = await getQueue();
    if (!queue) {
      await setQueue({ address, createdAt: Date.now() });
      return { status: "waiting", required: PVP_ENTRY_COST };
    }

    if (normalize(queue.address) === address) {
      return { status: "waiting", required: PVP_ENTRY_COST };
    }

    const check = await ensurePlayersCanEnter(queue.address, address);
    if (!check.ok) {
      await clearQueue();
      if (check.who === address) {
        return { status: "insufficient", required: PVP_ENTRY_COST, balance: profile.balance };
      }
      await setQueue({ address, createdAt: Date.now() });
      return { status: "waiting", required: PVP_ENTRY_COST };
    }

    await chargeEntry(check.profileA, check.profileB);
    const match = createInitialMatch(queue.address, address);
    await saveMatch(match);
    await setPlayerMatchId(match.players.X, match.id);
    await setPlayerMatchId(match.players.O, match.id);
    await clearQueue();

    return { status: "active", match: toMatchView(match, address) };
  });

  return sendJson(res, 200, outcome);
};

function toMatchView(match, address) {
  const normalized = normalize(address);
  const myMarker = match.players.X === normalized ? "X" : "O";
  return {
    id: match.id,
    board: match.board,
    round: match.round,
    status: match.status,
    myMarker,
    yourTurn: match.turnAddress === normalized,
    turnAddress: match.turnAddress,
    turnStartedAt: match.turnStartedAt,
    timeoutMs: 60_000,
    opponent: myMarker === "X" ? match.players.O : match.players.X
  };
}
