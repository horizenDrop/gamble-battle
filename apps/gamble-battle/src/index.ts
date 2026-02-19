import { applyRun, createMemoryStorage, deriveStats, PlayerRecord, PlayerStorage, sortLeaderboard, xpForNextLevel } from "./modules/profile";
import { applyTimedBuff, BuffPolicy, clamp, createRafLoop, LoopHandle } from "./modules/runtime";
import { enforceChain, normalizeAddress, OnchainCall, submitOnchain, WalletProvider } from "./modules/wallet";

export type MiniAppFoundation = {
  appName: string;
  manifestUrl: string;
  webhookUrl: string;
  chainIdHex: `0x${string}`;
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
};

export type GambleBattleConfig = {
  foundation: MiniAppFoundation;
  requireWallet: boolean;
  provider?: WalletProvider;
  storage?: PlayerStorage;
  spinCooldownMs?: number;
  spinSymbols?: readonly number[];
};

export type SpinResult = {
  accepted: boolean;
  reward: number;
  symbols: number[];
  balance: number;
  nextSpinAt: number;
  waitMs: number;
};

export type LeaderboardRow = Pick<PlayerRecord, "address" | "bestScore" | "verifiedBestScore" | "updatedAt">;

export type SubmitResult = {
  accepted: boolean;
  txHash?: string;
};

type Cell = "X" | "O" | null;
type MatchStatus = "active" | "x_won" | "o_won" | "draw";
type MatchMode = "bot" | "pvp";
type BuffKey = "aim";

type MatchSession = {
  id: string;
  mode: MatchMode;
  board: Cell[];
  playerX: `0x${string}`;
  playerO: `0x${string}`;
  turn: "X" | "O";
  wager: number;
  status: MatchStatus;
  winner: `0x${string}` | null;
  updatedAt: number;
};

type Lobby = {
  code: string;
  host: `0x${string}`;
  wager: number;
  createdAt: number;
};

type RuntimeState = {
  buffs: Record<BuffKey, number>;
  buffStacks: Record<BuffKey, number>;
  buffCooldownUntil: Record<BuffKey, number>;
};

const DEFAULT_SPIN_SYMBOLS = [1, 2, 3, 5, 8, 13] as const;
const DEFAULT_SPIN_COOLDOWN_MS = 60 * 60 * 1000;
const ACTION_RATE_LIMIT_MS = 250;
const PLATFORM_FEE_BPS = 500;
const WIN_LINES: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

const BUFF_POLICY: BuffPolicy = {
  maxStacks: { aim: 2 },
  maxDurationSeconds: { aim: 12 },
  cooldownSeconds: { aim: 20 }
};

export function createGambleBattle(config: GambleBattleConfig) {
  const storage = config.storage ?? createMemoryStorage();
  const spinSymbols = [...(config.spinSymbols ?? DEFAULT_SPIN_SYMBOLS)];
  const spinCooldownMs = Math.max(10_000, config.spinCooldownMs ?? DEFAULT_SPIN_COOLDOWN_MS);

  const runtime: RuntimeState = {
    buffs: { aim: 0 },
    buffStacks: { aim: 0 },
    buffCooldownUntil: { aim: 0 }
  };

  const profiles = new Map<`0x${string}`, PlayerRecord>();
  const sessions = new Map<string, MatchSession>();
  const lobbies = new Map<string, Lobby>();
  const pendingSubmit = new Set<`0x${string}`>();
  const lastActionAt = new Map<`0x${string}`, number>();

  const loop: LoopHandle =
    typeof requestAnimationFrame === "function"
      ? createRafLoop((dtSeconds) => {
          runtime.buffs.aim = Math.max(0, runtime.buffs.aim - dtSeconds);
          if (runtime.buffs.aim === 0) runtime.buffStacks.aim = 0;
        })
      : { stop() {} };

  async function init() {
    const records = await storage.read();
    for (const record of records) {
      const address = normalizeAddress(record.address);
      profiles.set(address, {
        ...record,
        address,
        lastSpinSymbols: [...record.lastSpinSymbols]
      });
    }
  }

  async function persist() {
    await storage.write([...profiles.values()].map((entry) => ({ ...entry, lastSpinSymbols: [...entry.lastSpinSymbols] })));
  }

  function assertAddress(address: string) {
    const normalized = normalizeAddress(address);
    if (!normalized.startsWith("0x") || normalized.length < 10) {
      throw new Error("Invalid address");
    }
    return normalized;
  }

  function enforceActionRateLimit(address: `0x${string}`, now: number) {
    const prev = lastActionAt.get(address) ?? 0;
    if (now - prev < ACTION_RATE_LIMIT_MS) {
      throw new Error("Too many actions");
    }
    lastActionAt.set(address, now);
  }

  function requireAddress(address: string | undefined) {
    if (!address) throw new Error("Wallet is required");
    return assertAddress(address);
  }

  function resolveAddress(address: string | undefined) {
    if (config.requireWallet) return requireAddress(address);
    if (!address) throw new Error("Address is required");
    return assertAddress(address);
  }

  function ensureProfile(address: `0x${string}`) {
    const existing = profiles.get(address);
    if (existing) return existing;

    const fresh: PlayerRecord = {
      address,
      bestScore: 0,
      verifiedBestScore: 0,
      lastScore: 0,
      totalRuns: 0,
      level: 1,
      levelXp: 0,
      updatedAt: Date.now(),
      balance: 0,
      lastSpinAt: 0,
      lastSpinReward: 0,
      lastSpinSymbols: []
    };

    profiles.set(address, fresh);
    return fresh;
  }

  function applyRunProgress(address: `0x${string}`, score: number, verified: boolean, xpGained: number) {
    const current = ensureProfile(address);
    const next = applyRun(current, score, verified, xpGained);
    const merged: PlayerRecord = {
      ...current,
      ...next
    };
    profiles.set(address, merged);
    return merged;
  }

  function spin(address: string, now = Date.now()): SpinResult {
    const normalized = resolveAddress(address);
    enforceActionRateLimit(normalized, now);

    const profile = ensureProfile(normalized);
    const elapsed = now - profile.lastSpinAt;
    if (profile.lastSpinAt > 0 && elapsed < spinCooldownMs) {
      const waitMs = spinCooldownMs - elapsed;
      return {
        accepted: false,
        reward: 0,
        symbols: [...profile.lastSpinSymbols],
        balance: profile.balance,
        nextSpinAt: profile.lastSpinAt + spinCooldownMs,
        waitMs
      };
    }

    const symbols = Array.from({ length: 3 }, () => spinSymbols[Math.floor(Math.random() * spinSymbols.length)]);
    const reward = symbols.reduce((sum, value) => sum + value, 0);

    profile.balance += reward;
    profile.lastSpinAt = now;
    profile.lastSpinReward = reward;
    profile.lastSpinSymbols = symbols;
    profile.updatedAt = now;

    return {
      accepted: true,
      reward,
      symbols,
      balance: profile.balance,
      nextSpinAt: now + spinCooldownMs,
      waitMs: spinCooldownMs
    };
  }

  function maybeApplyAimBuff(now = Date.now()) {
    if (runtime.buffCooldownUntil.aim > now) {
      return false;
    }

    runtime.buffStacks.aim = clamp(runtime.buffStacks.aim + 1, 0, BUFF_POLICY.maxStacks.aim ?? 1);
    runtime.buffs.aim = applyTimedBuff(runtime.buffs.aim, 6, BUFF_POLICY.maxDurationSeconds.aim ?? 12);
    runtime.buffCooldownUntil.aim = now + (BUFF_POLICY.cooldownSeconds.aim ?? 20) * 1000;
    return true;
  }

  function validateWager(wager: number) {
    if (!Number.isInteger(wager) || wager <= 0) {
      throw new Error("Wager must be a positive integer");
    }
  }

  function startBotBattle(address: string, wager: number, now = Date.now()) {
    const normalized = resolveAddress(address);
    enforceActionRateLimit(normalized, now);
    validateWager(wager);

    const profile = ensureProfile(normalized);
    if (profile.balance < wager) {
      throw new Error("Not enough balance");
    }

    profile.balance -= wager;
    const session: MatchSession = {
      id: createId("bot"),
      mode: "bot",
      board: Array<Cell>(9).fill(null),
      playerX: normalized,
      playerO: "0x000000000000000000000000000000000000b07a",
      turn: "X",
      wager,
      status: "active",
      winner: null,
      updatedAt: now
    };

    sessions.set(session.id, session);
    maybeApplyAimBuff(now);
    return session;
  }

  function createPvpLobby(address: string, wager: number, now = Date.now()) {
    const normalized = resolveAddress(address);
    enforceActionRateLimit(normalized, now);
    validateWager(wager);

    const profile = ensureProfile(normalized);
    if (profile.balance < wager) {
      throw new Error("Not enough balance");
    }

    profile.balance -= wager;
    const code = createLobbyCode();
    lobbies.set(code, { code, host: normalized, wager, createdAt: now });
    return code;
  }

  function joinPvpLobby(address: string, code: string, now = Date.now()) {
    const normalized = resolveAddress(address);
    enforceActionRateLimit(normalized, now);

    const lobby = lobbies.get(code);
    if (!lobby) throw new Error("Lobby not found");
    if (lobby.host === normalized) throw new Error("Cannot join your own lobby");
    if (now - lobby.createdAt > 5 * 60 * 1000) {
      lobbies.delete(code);
      throw new Error("Lobby expired");
    }

    const guest = ensureProfile(normalized);
    if (guest.balance < lobby.wager) {
      throw new Error("Not enough balance");
    }

    guest.balance -= lobby.wager;
    lobbies.delete(code);

    const session: MatchSession = {
      id: createId("pvp"),
      mode: "pvp",
      board: Array<Cell>(9).fill(null),
      playerX: lobby.host,
      playerO: normalized,
      turn: "X",
      wager: lobby.wager,
      status: "active",
      winner: null,
      updatedAt: now
    };

    sessions.set(session.id, session);
    return session;
  }

  function playMove(sessionId: string, address: string, cellIndex: number, now = Date.now()) {
    const normalized = resolveAddress(address);
    enforceActionRateLimit(normalized, now);

    const session = sessions.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") return session;

    const marker = normalized === session.playerX ? "X" : normalized === session.playerO ? "O" : null;
    if (!marker) throw new Error("Address is not part of this session");
    if (session.turn !== marker) throw new Error("Not your turn");
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) throw new Error("Invalid cell");
    if (session.board[cellIndex] !== null) throw new Error("Cell is already occupied");

    session.board[cellIndex] = marker;
    session.updatedAt = now;

    const winnerMarker = findWinner(session.board);
    if (winnerMarker) {
      finishSession(session, winnerMarker === "X" ? session.playerX : session.playerO, now);
      return session;
    }

    if (session.board.every((cell) => cell !== null)) {
      finishSession(session, null, now);
      return session;
    }

    session.turn = marker === "X" ? "O" : "X";

    if (session.mode === "bot" && session.turn === "O") {
      const botMove = pickBotMove(session.board, runtime.buffs.aim > 0 ? 0.3 : 0.6);
      session.board[botMove] = "O";

      const postBotWinner = findWinner(session.board);
      if (postBotWinner) {
        finishSession(session, postBotWinner === "X" ? session.playerX : session.playerO, now);
      } else if (session.board.every((cell) => cell !== null)) {
        finishSession(session, null, now);
      } else {
        session.turn = "X";
      }
    }

    return session;
  }

  function finishSession(session: MatchSession, winner: `0x${string}` | null, now: number) {
    const pool = session.wager * 2;
    const payout = Math.floor((pool * (10_000 - PLATFORM_FEE_BPS)) / 10_000);

    if (winner) {
      const winnerProfile = ensureProfile(winner);
      winnerProfile.balance += payout;
      applyRunProgress(winner, payout, true, 25);

      const loser = winner === session.playerX ? session.playerO : session.playerX;
      applyRunProgress(loser, 0, false, 8);

      session.status = winner === session.playerX ? "x_won" : "o_won";
      session.winner = winner;
    } else {
      ensureProfile(session.playerX).balance += session.wager;
      ensureProfile(session.playerO).balance += session.wager;
      applyRunProgress(session.playerX, session.wager, false, 10);
      applyRunProgress(session.playerO, session.wager, false, 10);
      session.status = "draw";
      session.winner = null;
    }

    session.updatedAt = now;
  }

  async function submitBattleOnchain(address: string, calls: OnchainCall[], dataSuffixHex?: `0x${string}`): Promise<SubmitResult> {
    const normalized = resolveAddress(address);
    if (!config.provider) {
      throw new Error("Provider is required for onchain submit");
    }

    if (pendingSubmit.has(normalized)) {
      throw new Error("Submit is already in progress");
    }

    pendingSubmit.add(normalized);
    try {
      await enforceChain(config.provider, config.foundation.chainIdHex);
      const result = await submitOnchain(config.provider, {
        chainIdHex: config.foundation.chainIdHex,
        from: normalized,
        calls,
        dataSuffixHex
      });
      return { accepted: result.accepted, txHash: result.txHash };
    } finally {
      pendingSubmit.delete(normalized);
    }
  }

  function leaderboard(): LeaderboardRow[] {
    return sortLeaderboard([...profiles.values()]).map((row) => ({
      address: row.address,
      bestScore: row.bestScore,
      verifiedBestScore: row.verifiedBestScore,
      updatedAt: row.updatedAt
    }));
  }

  function getProfile(address: string) {
    const profile = ensureProfile(resolveAddress(address));
    return {
      ...profile,
      nextLevelXp: xpForNextLevel(profile.level),
      derivedStats: deriveStats(profile.level)
    };
  }

  function miniAppMeta() {
    return {
      appName: config.foundation.appName,
      manifestUrl: config.foundation.manifestUrl,
      webhookUrl: config.foundation.webhookUrl,
      safeAreaInsets: config.foundation.safeAreaInsets ?? { top: 0, right: 0, bottom: 0, left: 0 },
      readyHandshake: true
    };
  }

  return {
    init,
    persist,
    miniAppMeta,
    getProfile,
    spin,
    startBotBattle,
    createPvpLobby,
    joinPvpLobby,
    playMove,
    leaderboard,
    submitBattleOnchain,
    dispose() {
      loop.stop();
    }
  };
}

export function parseGambleBattleEnv(raw: Record<string, string | undefined>) {
  const appName = must(raw.GAME_NAME, "GAME_NAME");
  const manifestUrl = must(raw.MINIAPP_MANIFEST_URL, "MINIAPP_MANIFEST_URL");
  const webhookUrl = must(raw.WEBHOOK_URL, "WEBHOOK_URL");
  const chainIdHex = must(raw.CHAIN_ID_HEX, "CHAIN_ID_HEX") as `0x${string}`;

  if (!chainIdHex.startsWith("0x")) {
    throw new Error("CHAIN_ID_HEX must be hex string");
  }

  return {
    foundation: {
      appName,
      manifestUrl,
      webhookUrl,
      chainIdHex
    },
    requireWallet: (raw.REQUIRE_WALLET ?? "true") !== "false"
  } satisfies Pick<GambleBattleConfig, "foundation" | "requireWallet">;
}

export function mapTouchToGrid(x: number, y: number, width: number, height: number) {
  if (width <= 0 || height <= 0) return null;
  const col = clamp(Math.floor((x / width) * 3), 0, 2);
  const row = clamp(Math.floor((y / height) * 3), 0, 2);
  return row * 3 + col;
}

export function mapKeyboardToCell(key: string) {
  const parsed = Number(key);
  if (!Number.isInteger(parsed)) return null;
  const index = parsed - 1;
  return index >= 0 && index <= 8 ? index : null;
}

function findWinner(board: Cell[]) {
  for (const [a, b, c] of WIN_LINES) {
    const marker = board[a];
    if (marker && marker === board[b] && marker === board[c]) {
      return marker;
    }
  }
  return null;
}

function pickBotMove(board: Cell[], missChance: number) {
  const empty = board
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value === null)
    .map((entry) => entry.index);

  if (empty.length === 0) {
    throw new Error("No moves available");
  }

  if (Math.random() < missChance) {
    return empty[Math.floor(Math.random() * empty.length)];
  }

  const best = [4, 0, 2, 6, 8, 1, 3, 5, 7];
  return best.find((idx) => empty.includes(idx)) ?? empty[0];
}

function createLobbyCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function must(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}
