const { loadProfile, sendJson } = require("./_lib/profile");
const {
  normalize,
  getQueue,
  getPlayerMatchId,
  loadMatch,
  markerFor,
  getAndClearLastResult,
  resolveTimeoutIfNeeded,
  canJoinAddress
} = require("./_lib/pvp");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const address = normalize(req.query.address);
  if (!canJoinAddress(address)) {
    return sendJson(res, 400, { error: "Invalid address" });
  }

  const last = await getAndClearLastResult(address);
  if (last) {
    return sendJson(res, 200, last);
  }

  const matchId = await getPlayerMatchId(address);
  if (!matchId) {
    const queue = await getQueue();
    if (queue && normalize(queue.address) === address) {
      return sendJson(res, 200, { status: "waiting" });
    }

    const profile = await loadProfile(address);
    return sendJson(res, 200, { status: "idle", profile });
  }

  const match = await loadMatch(matchId);
  if (!match) {
    const profile = await loadProfile(address);
    return sendJson(res, 200, { status: "idle", profile });
  }

  const timeout = await resolveTimeoutIfNeeded(match);
  if (timeout.resolved) {
    const timeoutResult = await getAndClearLastResult(address);
    return sendJson(res, 200, timeoutResult ?? { status: "idle" });
  }

  return sendJson(res, 200, {
    status: "active",
    match: toMatchView(timeout.match, address)
  });
};

function toMatchView(match, address) {
  const normalized = normalize(address);
  const myMarker = markerFor(match, normalized);
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
