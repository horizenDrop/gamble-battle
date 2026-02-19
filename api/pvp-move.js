const { sendJson } = require("./_lib/profile");
const {
  normalize,
  getPlayerMatchId,
  loadMatch,
  saveMatch,
  markerFor,
  winnerMarker,
  finalizeMatch,
  getAndClearLastResult,
  resolveTimeoutIfNeeded,
  canJoinAddress
} = require("./_lib/pvp");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const address = normalize(body.address);
  const index = Number(body.index);

  if (!canJoinAddress(address)) {
    return sendJson(res, 400, { error: "Invalid address" });
  }
  if (!Number.isInteger(index) || index < 0 || index > 8) {
    return sendJson(res, 400, { error: "Invalid index" });
  }

  const matchId = await getPlayerMatchId(address);
  if (!matchId) {
    return sendJson(res, 200, { status: "idle" });
  }

  const match = await loadMatch(matchId);
  if (!match) {
    return sendJson(res, 200, { status: "idle" });
  }

  const timeout = await resolveTimeoutIfNeeded(match);
  if (timeout.resolved) {
    const last = await getAndClearLastResult(address);
    return sendJson(res, 200, last ?? { status: "idle" });
  }

  const marker = markerFor(timeout.match, address);
  if (!marker) {
    return sendJson(res, 400, { error: "Not in match" });
  }

  if (timeout.match.turnAddress !== address) {
    return sendJson(res, 200, { status: "active", match: toMatchView(timeout.match, address), reason: "NOT_YOUR_TURN" });
  }

  if (timeout.match.board[index] !== null) {
    return sendJson(res, 200, { status: "active", match: toMatchView(timeout.match, address), reason: "CELL_OCCUPIED" });
  }

  timeout.match.board[index] = marker;
  const winner = winnerMarker(timeout.match.board);
  if (winner) {
    const winnerAddress = winner === "X" ? timeout.match.players.X : timeout.match.players.O;
    await finalizeMatch(timeout.match, winnerAddress, "win");
    const last = await getAndClearLastResult(address);
    return sendJson(res, 200, last ?? { status: "idle" });
  }

  const full = timeout.match.board.every((cell) => cell !== null);
  if (full) {
    timeout.match.round += 1;
    timeout.match.board = Array(9).fill(null);
    timeout.match.roundStarter = timeout.match.roundStarter === "X" ? "O" : "X";
    timeout.match.turn = timeout.match.roundStarter;
    timeout.match.turnAddress = timeout.match.roundStarter === "X" ? timeout.match.players.X : timeout.match.players.O;
    timeout.match.turnStartedAt = Date.now();
    await saveMatch(timeout.match);
    return sendJson(res, 200, { status: "active", match: toMatchView(timeout.match, address), reason: "ROUND_DRAW_RESET" });
  }

  timeout.match.turn = marker === "X" ? "O" : "X";
  timeout.match.turnAddress = timeout.match.turn === "X" ? timeout.match.players.X : timeout.match.players.O;
  timeout.match.turnStartedAt = Date.now();
  await saveMatch(timeout.match);

  return sendJson(res, 200, { status: "active", match: toMatchView(timeout.match, address) });
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
