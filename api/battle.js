const { isValidAddress, loadProfile, parseBody, saveProfile, sendJson } = require("./_lib/profile");
const { withLock } = require("./_lib/store");

// PvP is settled by the authoritative /api/pvp-* endpoints, which hold the
// match state and the pot. This endpoint only records the local PvE bot games,
// so it must never move coins - accepting a client-declared "pvp win" here was
// an unauthenticated way to mint PVP_ENTRY_COST * 2 coins per request.
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  const address = String(body.address ?? "").toLowerCase();
  const mode = String(body.mode ?? "pve");
  const stage = String(body.stage ?? "");
  const outcome = String(body.outcome ?? "");

  if (!isValidAddress(address)) {
    return sendJson(res, 400, { error: "Invalid address" });
  }

  if (mode !== "pve") {
    return sendJson(res, 400, { error: "PvP results are settled by /api/pvp-move" });
  }

  if (stage === "start") {
    const profile = await loadProfile(address);
    const saved = await saveProfile(profile);
    return sendJson(res, 200, { ok: true, profile: saved, entryCost: 0 });
  }

  if (stage === "finish") {
    if (!["win", "loss", "draw"].includes(outcome)) {
      return sendJson(res, 400, { error: "Invalid outcome" });
    }

    const saved = await withLock(`battle:${address}`, 3_000, async () => {
      const profile = await loadProfile(address);
      profile.totalGames += 1;
      profile.pveGames += 1;

      if (outcome === "win") {
        profile.wins += 1;
        profile.pvePlayerWins += 1;
      }
      if (outcome === "loss") {
        profile.losses += 1;
        profile.pveBotWins += 1;
      }
      if (outcome === "draw") {
        profile.draws += 1;
      }

      return saveProfile(profile);
    });

    return sendJson(res, 200, { ok: true, profile: saved });
  }

  return sendJson(res, 400, { error: "Invalid stage" });
};
