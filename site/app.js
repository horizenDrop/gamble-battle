const SPIN_VALUES = [1, 2, 3, 5, 8, 13];
const PVP_ENTRY_COST = 10;
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

const state = {
  sdk: null,
  provider: null,
  address: null,
  inMiniApp: false,
  coins: 0,
  lastSpinAt: 0,
  cooldownMs: 60 * 60 * 1000,
  spinning: false,
  board: Array(9).fill(null),
  finished: false,
  mode: "pve"
};

const els = {
  status: byId("miniapp-status"),
  contextInfo: byId("context-info"),
  walletAddress: byId("wallet-address"),
  menuAddress: byId("menu-address"),
  coins: byId("coins"),
  spinResult: byId("spin-result"),
  spinCooldown: byId("spin-cooldown"),
  matchResult: byId("match-result"),
  battleTitle: byId("battle-title"),
  battleSubtitle: byId("battle-subtitle"),
  board: byId("board"),
  connectBtn: byId("connect-btn"),
  spinBtn: byId("spin-btn"),
  pveBtn: byId("pve-btn"),
  pvpBtn: byId("pvp-btn"),
  resetBtn: byId("reset-match"),
  backMenuBtn: byId("back-menu"),
  openRulesBtn: byId("open-rules-btn"),
  reels: [byId("reel-0"), byId("reel-1"), byId("reel-2")],
  screenWallet: byId("screen-wallet"),
  screenMenu: byId("screen-menu"),
  screenBattle: byId("screen-battle")
};

boot().catch((error) => {
  els.status.textContent = `Mini App status: failed (${error?.message ?? "unknown error"})`;
});

async function boot() {
  await setupMiniAppSDK();
  wireEvents();
  renderBoard();
  updateCooldown();
  setInterval(updateCooldown, 1000);
  await tryAutoConnect();
}

async function setupMiniAppSDK() {
  try {
    const mod = await import("https://esm.sh/@farcaster/miniapp-sdk");
    const sdk = mod.default;
    state.sdk = sdk;

    const context = await Promise.resolve(sdk.context);
    state.inMiniApp = Boolean(context?.client);
    applySafeArea(context?.client?.safeAreaInsets);

    const fid = context?.user?.fid ? `fid=${context.user.fid}` : "fid=unknown";
    const location = context?.location?.type ?? "location=unknown";
    els.contextInfo.textContent = `Context: ${fid}, ${location}`;

    await sdk.actions?.ready?.();
    els.status.textContent = state.inMiniApp ? "Mini App status: ready" : "Mini App status: web fallback";
  } catch {
    els.status.textContent = "Mini App status: sdk unavailable (web fallback)";
  }
}

function wireEvents() {
  els.connectBtn.addEventListener("click", connectWalletInteractive);
  els.spinBtn.addEventListener("click", spinInteractive);
  els.pveBtn.addEventListener("click", () => startBattle("pve"));
  els.pvpBtn.addEventListener("click", () => startBattle("pvp"));
  els.resetBtn.addEventListener("click", resetMatch);
  els.backMenuBtn.addEventListener("click", () => setScreen("menu"));
  els.openRulesBtn.addEventListener("click", openRules);
}

async function tryAutoConnect() {
  try {
    const provider = await getProvider();
    if (!provider) return;
    state.provider = provider;

    const accounts = await provider.request({ method: "eth_accounts" });
    const first = Array.isArray(accounts) ? accounts[0] : null;
    if (!first) return;

    onWalletConnected(first);
  } catch {
    // silent fallback
  }
}

async function connectWalletInteractive() {
  try {
    const provider = await getProvider();
    if (!provider) throw new Error("No wallet provider available");
    state.provider = provider;

    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const first = Array.isArray(accounts) ? accounts[0] : null;
    if (!first) throw new Error("Wallet returned no account");

    onWalletConnected(first);
  } catch (error) {
    els.walletAddress.textContent = `Address: connect failed (${error?.message ?? "unknown"})`;
  }
}

function onWalletConnected(address) {
  state.address = address;
  els.walletAddress.textContent = `Address: ${address}`;
  els.menuAddress.textContent = `Wallet: ${shortAddress(address)}`;
  refreshCoins();
  setScreen("menu");
}

function setScreen(screen) {
  els.screenWallet.classList.toggle("active", screen === "wallet");
  els.screenMenu.classList.toggle("active", screen === "menu");
  els.screenBattle.classList.toggle("active", screen === "battle");
}

async function spinInteractive() {
  if (!state.address || state.spinning) return;

  const now = Date.now();
  const wait = state.cooldownMs - (now - state.lastSpinAt);
  if (state.lastSpinAt > 0 && wait > 0) {
    els.spinResult.textContent = "Spin result: cooldown active";
    return;
  }

  state.spinning = true;
  els.spinBtn.disabled = true;
  els.spinResult.textContent = "Spin result: spinning...";

  const finalValues = [randSymbol(), randSymbol(), randSymbol()];
  const result = await animateReels(finalValues);

  const reward = result.reduce((a, b) => a + b, 0);
  state.coins += reward;
  state.lastSpinAt = Date.now();

  refreshCoins();
  updateCooldown();
  els.spinResult.textContent = `Spin result: [${result.join(" | ")}] => +${reward} coins`;

  state.spinning = false;
  updateCooldown();
}

async function animateReels(finalValues) {
  const spinMs = 1500;
  const tickMs = 90;
  const start = Date.now();

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      for (let i = 0; i < els.reels.length; i += 1) {
        els.reels[i].textContent = String(randSymbol());
      }

      if (Date.now() - start >= spinMs) {
        clearInterval(interval);
        for (let i = 0; i < els.reels.length; i += 1) {
          els.reels[i].textContent = String(finalValues[i]);
        }
        resolve(finalValues);
      }
    }, tickMs);
  });
}

function updateCooldown() {
  if (state.lastSpinAt === 0) {
    els.spinCooldown.textContent = "Cooldown: ready";
    els.spinBtn.disabled = state.spinning;
    return;
  }

  const left = Math.max(0, state.cooldownMs - (Date.now() - state.lastSpinAt));
  if (left === 0) {
    els.spinCooldown.textContent = "Cooldown: ready";
    els.spinBtn.disabled = state.spinning;
    return;
  }

  const totalSeconds = Math.floor(left / 1000);
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  els.spinCooldown.textContent = `Cooldown: ${hh}:${mm}:${ss}`;
  els.spinBtn.disabled = true;
}

function startBattle(mode) {
  if (mode === "pvp") {
    if (state.coins < PVP_ENTRY_COST) {
      els.spinResult.textContent = `Need ${PVP_ENTRY_COST} coins for PvP`;
      return;
    }
    state.coins -= PVP_ENTRY_COST;
    refreshCoins();
  }

  state.mode = mode;
  resetMatch();
  els.battleTitle.textContent = mode === "pve" ? "PvE Training" : "PvP Match";
  els.battleSubtitle.textContent = mode === "pve" ? "Mode: training (no coin deduction)" : `Mode: pvp (entry ${PVP_ENTRY_COST} coins)`;
  setScreen("battle");
}

function renderBoard() {
  els.board.innerHTML = "";
  state.board.forEach((cell, idx) => {
    const button = document.createElement("button");
    button.className = "cell";
    button.type = "button";
    button.textContent = cell ?? "";
    button.addEventListener("click", () => onPlayerMove(idx));
    els.board.appendChild(button);
  });
}

function onPlayerMove(index) {
  if (state.finished || state.board[index]) return;

  state.board[index] = "X";
  if (resolveWinner("X")) return;

  const empty = state.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (empty.length === 0) {
    state.finished = true;
    els.matchResult.textContent = "Match: draw";
    renderBoard();
    return;
  }

  const botPick = pickBotMove(state.board, empty);
  state.board[botPick] = "O";
  resolveWinner("O");
  renderBoard();
}

function resolveWinner(marker) {
  const won = WIN_LINES.some(([a, b, c]) => state.board[a] === marker && state.board[b] === marker && state.board[c] === marker);
  if (!won) return false;

  state.finished = true;

  if (marker === "X") {
    if (state.mode === "pvp") {
      state.coins += PVP_ENTRY_COST * 2;
      refreshCoins();
      els.matchResult.textContent = "Match: you win (+20 coins)";
    } else {
      els.matchResult.textContent = "Match: you win (training)";
    }
  } else {
    els.matchResult.textContent = state.mode === "pvp" ? "Match: you lost (pvp)" : "Match: bot wins (training)";
  }

  renderBoard();
  return true;
}

function resetMatch() {
  state.board = Array(9).fill(null);
  state.finished = false;
  els.matchResult.textContent = "Match: in progress";
  renderBoard();
}

async function openRules() {
  const url = "https://docs.base.org/mini-apps/quickstart/build-checklist";
  try {
    if (state.sdk?.actions?.openUrl) {
      await state.sdk.actions.openUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // ignore
  }
}

async function getProvider() {
  const sdkProvider = await state.sdk?.wallet?.getEthereumProvider?.();
  return sdkProvider ?? window.ethereum ?? null;
}

function pickBotMove(board, emptyCells) {
  if (state.mode === "pvp") {
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
  }

  return pickBestMoveMinimax(board, emptyCells);
}

function pickBestMoveMinimax(board, emptyCells) {
  let bestMove = emptyCells[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const idx of emptyCells) {
    board[idx] = "O";
    const score = minimax(board, false);
    board[idx] = null;

    if (score > bestScore) {
      bestScore = score;
      bestMove = idx;
    }
  }

  return bestMove;
}

function minimax(board, isBotTurn) {
  const winner = getWinner(board);
  if (winner === "O") return 10;
  if (winner === "X") return -10;
  if (board.every((cell) => cell !== null)) return 0;

  const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

  if (isBotTurn) {
    let best = Number.NEGATIVE_INFINITY;
    for (const idx of empty) {
      board[idx] = "O";
      best = Math.max(best, minimax(board, false));
      board[idx] = null;
    }
    return best;
  }

  let best = Number.POSITIVE_INFINITY;
  for (const idx of empty) {
    board[idx] = "X";
    best = Math.min(best, minimax(board, true));
    board[idx] = null;
  }
  return best;
}

function getWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function refreshCoins() {
  els.coins.textContent = `Coins: ${state.coins}`;
}

function applySafeArea(insets) {
  if (!insets) return;
  document.documentElement.style.setProperty("--safe-top", `${insets.top ?? 0}px`);
  document.documentElement.style.setProperty("--safe-right", `${insets.right ?? 0}px`);
  document.documentElement.style.setProperty("--safe-bottom", `${insets.bottom ?? 0}px`);
  document.documentElement.style.setProperty("--safe-left", `${insets.left ?? 0}px`);
}

function randSymbol() {
  return SPIN_VALUES[Math.floor(Math.random() * SPIN_VALUES.length)];
}

function shortAddress(address) {
  if (!address || address.length < 10) return address ?? "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}
