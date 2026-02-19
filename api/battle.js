const { isValidAddress, loadProfile, parseBody, saveProfile, sendJson } = require("./_lib/profile");

const PVP_ENTRY_COST = 10;

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

  if (!["pve", "pvp"].includes(mode)) {
    return sendJson(res, 400, { error: "Invalid mode" });
  }

  const profile = await loadProfile(address);

  if (stage === "start") {
    if (mode === "pvp") {
      if (profile.balance < PVP_ENTRY_COST) {
        return sendJson(res, 200, { ok: false, reason: "NOT_ENOUGH_COINS", profile });
      }
      profile.balance -= PVP_ENTRY_COST;
    }

    const saved = await saveProfile(profile);
    return sendJson(res, 200, { ok: true, profile: saved, entryCost: mode === "pvp" ? PVP_ENTRY_COST : 0 });
  }

  if (stage === "finish") {
    if (!["win", "loss", "draw"].includes(outcome)) {
      return sendJson(res, 400, { error: "Invalid outcome" });
    }

    profile.totalGames += 1;
    if (mode === "pve") profile.pveGames += 1;
    if (mode === "pvp") profile.pvpGames += 1;

    if (outcome === "win") profile.wins += 1;
    if (outcome === "loss") profile.losses += 1;
    if (outcome === "draw") profile.draws += 1;

    if (mode === "pve") {
      if (outcome === "win") profile.pvePlayerWins += 1;
      if (outcome === "loss") profile.pveBotWins += 1;
    }

    if (mode === "pvp") {
      if (outcome === "win") profile.balance += PVP_ENTRY_COST * 2;
      if (outcome === "draw") profile.balance += PVP_ENTRY_COST;
    }

    const saved = await saveProfile(profile);
    return sendJson(res, 200, { ok: true, profile: saved });
  }

  return sendJson(res, 400, { error: "Invalid stage" });
};
