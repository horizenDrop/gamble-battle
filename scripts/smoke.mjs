import battle from "../api/battle.js";
import checkin from "../api/checkin.js";
import dbStatus from "../api/db-status.js";
import leaderboard from "../api/leaderboard.js";
import player from "../api/player.js";
import pvpJoin from "../api/pvp-join.js";
import pvpMove from "../api/pvp-move.js";
import pvpState from "../api/pvp-state.js";
import spin from "../api/spin.js";
import track from "../api/track.js";

function call(handler, { method = "GET", body = {}, query = {}, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, body, query, headers };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(key, value) {
        this.headers[key] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode, payload });
      }
    };

    Promise.resolve()
      .then(() => handler(req, res))
      .catch(reject);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ADDRESS = "0x1111111111111111111111111111111111111111";

async function main() {
  const status = await call(dbStatus);
  assert(status.payload.ok === true, "db-status should report a working store");

  const created = await call(player, { method: "GET", query: { address: ADDRESS } });
  assert(created.payload.profile.address === ADDRESS, "profile should be created on first read");
  assert(created.payload.profile.balance === 0, "new profile should start at 0 coins");

  const named = await call(player, {
    method: "POST",
    body: { address: ADDRESS, nickname: "smoke" }
  });
  assert(named.payload.ok === true, "nickname should be accepted");

  const relocked = await call(player, {
    method: "POST",
    body: { address: ADDRESS, nickname: "another" }
  });
  assert(relocked.payload.reason === "NICKNAME_LOCKED", "nickname must be set only once");

  const firstSpin = await call(spin, { method: "POST", body: { address: ADDRESS } });
  assert(firstSpin.payload.ok === true, "first spin should pay out");
  assert(firstSpin.payload.reward > 0, "spin reward should be positive");

  const secondSpin = await call(spin, { method: "POST", body: { address: ADDRESS } });
  assert(secondSpin.payload.ok === false, "second spin should hit the cooldown");
  assert(secondSpin.payload.cooldownActive === true, "cooldown flag should be set");

  // Two simultaneous spins must not both pay out.
  const parallelAddress = "0x2222222222222222222222222222222222222222";
  const [a, b] = await Promise.all([
    call(spin, { method: "POST", body: { address: parallelAddress } }),
    call(spin, { method: "POST", body: { address: parallelAddress } })
  ]);
  const paid = [a, b].filter((result) => result.payload.ok === true);
  assert(paid.length === 1, `exactly one concurrent spin may pay out, got ${paid.length}`);

  const checkedIn = await call(checkin, {
    method: "POST",
    body: { address: ADDRESS, txRef: "0xabc", chainId: "0x2105" }
  });
  assert(checkedIn.payload.ok === true, "first check-in should be counted");
  assert(checkedIn.payload.profile.checkins === 1, "check-in counter should be 1");

  const replayed = await call(checkin, {
    method: "POST",
    body: { address: ADDRESS, txRef: "0xabc", chainId: "0x2105" }
  });
  assert(replayed.payload.ok === false, "replayed tx reference must be rejected");
  assert(replayed.payload.profile.checkins === 1, "replay must not increase the counter");

  const pvpViaBattle = await call(battle, {
    method: "POST",
    body: { address: ADDRESS, mode: "pvp", stage: "finish", outcome: "win" }
  });
  assert(pvpViaBattle.statusCode === 400, "/api/battle must not settle PvP results");

  const balanceBefore = replayed.payload.profile.balance;
  const pveWin = await call(battle, {
    method: "POST",
    body: { address: ADDRESS, mode: "pve", stage: "finish", outcome: "win" }
  });
  assert(pveWin.payload.ok === true, "pve finish should be recorded");
  assert(pveWin.payload.profile.balance === balanceBefore, "pve results must not move coins");
  assert(pveWin.payload.profile.pveWinRate === 100, "pve win rate should be 100 after one win");

  const badEvent = await call(track, { method: "POST", body: { event: "drop table users" } });
  assert(badEvent.statusCode === 400, "event names must be validated");

  const goodEvent = await call(track, { method: "POST", body: { event: "spin_success" } });
  assert(goodEvent.payload.ok === true, "valid event should be tracked");

  await runPvpMatch();

  const board = await call(leaderboard, { method: "GET", query: { limit: 10 } });
  assert(Array.isArray(board.payload.rows), "leaderboard should return rows");
  assert(board.payload.rows.some((row) => row.address === ADDRESS), "player should appear on the leaderboard");

  console.log(JSON.stringify({ ok: true, suites: ["store", "profile", "spin", "checkin", "battle", "track", "pvp", "leaderboard"] }, null, 2));
}

// Play a full PvP match through the authoritative endpoints and check the pot
// is charged once and paid once.
async function runPvpMatch() {
  const one = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const two = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  await giveCoins(one, 100);
  await giveCoins(two, 100);

  const queued = await call(pvpJoin, { method: "POST", body: { address: one } });
  assert(queued.payload.status === "waiting", "first join should queue");

  const matched = await call(pvpJoin, { method: "POST", body: { address: two } });
  assert(matched.payload.status === "active", "second join should create a match");

  assert((await balanceOf(one)) === 90, "player one should be charged the entry cost once");
  assert((await balanceOf(two)) === 90, "player two should be charged the entry cost once");

  let snapshot = matched.payload;
  for (let move = 0; move < 20 && snapshot.status === "active"; move += 1) {
    const mover = snapshot.match.turnAddress;
    const index = snapshot.match.board.findIndex((cell) => cell === null);
    const played = await call(pvpMove, { method: "POST", body: { address: mover, index } });
    snapshot = played.payload;
  }

  assert(snapshot.status === "finished", `match should finish, got ${snapshot.status}`);
  assert(snapshot.reward === 20, `winner should take the 20 coin pot, got ${snapshot.reward}`);

  const balances = [await balanceOf(one), await balanceOf(two)].sort((a, b) => a - b);
  assert(balances[0] === 90 && balances[1] === 110, `pot must be paid exactly once, got ${balances}`);

  // Both clients keep polling after the match ends; that must not pay again.
  await call(pvpState, { method: "GET", query: { address: one } });
  await call(pvpState, { method: "GET", query: { address: two } });
  const after = [await balanceOf(one), await balanceOf(two)].sort((a, b) => a - b);
  assert(after[0] === 90 && after[1] === 110, `polling after the match must not change balances, got ${after}`);
}

async function giveCoins(address, amount) {
  await call(player, { method: "GET", query: { address } });
  const { loadProfile, saveProfile } = await import("../api/_lib/profile.js");
  const profile = await loadProfile(address);
  profile.balance = amount;
  await saveProfile(profile);
}

async function balanceOf(address) {
  const { loadProfile } = await import("../api/_lib/profile.js");
  const profile = await loadProfile(address);
  return profile.balance;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
