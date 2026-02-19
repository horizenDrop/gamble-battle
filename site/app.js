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
  coins: 0,
  inMiniApp: false,
  lastSpinAt: 0,
  cooldownMs: 60 * 60 * 1000,
  spinning: false,
  board: Array(9).fill(null),
  finished: false,
  mode: "pve"
};

const els = {
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
  openSlotBtn: byId("open-slot-btn"),
  spinBtn: byId("spin-btn"),
  slotBackBtn: byId("slot-back-btn"),
  pveBtn: byId("pve-btn"),
  pvpBtn: byId("pvp-btn"),
  resetBtn: byId("reset-match"),
  backMenuBtn: byId("back-menu"),
  openRulesBtn: byId("open-rules-btn"),
  reels: [byId("reel-0"), byId("reel-1"), byId("reel-2")],
  screenWallet: byId("screen-wallet"),
  screenMenu: byId("screen-menu"),
  screenSlot: byId("screen-slot"),
  screenBattle: byId("screen-battle")
};

boot();

async function boot() {
  await setupMiniAppSDK();
  wireEvents();
  renderBoard();
  refreshCoins();
  updateCooldown();
  setInterval(updateCooldown, 1000);
  await tryAutoConnect();
}

async function setupMiniAppSDK() {
  try {
    const mod = await import("https://esm.sh/@farcaster/miniapp-sdk");
    state.sdk = mod.default;
    const context = await Promise.resolve(state.sdk.context);
    state.inMiniApp = Boolean(context?.client);
    applySafeArea(context?.client?.safeAreaInsets);
    await state.sdk.actions?.ready?.();
  } catch {
    // web fallback
  }
}

function wireEvents() {
  els.connectBtn.addEventListener("click", connectWalletInteractive);
  els.openSlotBtn.addEventListener("click", () => setScreen("slot"));
  els.slotBackBtn.addEventListener("click", () => setScreen("menu"));
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
  } catch {
    els.walletAddress.textContent = "Connection failed. Try again.";
  }
}

function onWalletConnected(address) {
  state.address = address;
  els.walletAddress.textContent = `Connected: ${shortAddress(address)}`;
  els.menuAddress.textContent = `Wallet: ${shortAddress(address)}`;
  setScreen("menu");
}

function setScreen(name) {
  els.screenWallet.classList.toggle("active", name === "wallet");
  els.screenMenu.classList.toggle("active", name === "menu");
  els.screenSlot.classList.toggle("active", name === "slot");
  els.screenBattle.classList.toggle("active", name === "battle");
}

async function spinInteractive() {
  if (!state.address || state.spinning) return;

  const now = Date.now();
  const wait = state.cooldownMs - (now - state.lastSpinAt);
  if (state.lastSpinAt > 0 && wait > 0) {
    els.spinResult.textContent = "Cooldown active. Come back later.";
    return;
  }

  state.spinning = true;
  els.spinBtn.disabled = true;
  els.spinResult.textContent = "Spinning...";

  const finalValues = [randSymbol(), randSymbol(), randSymbol()];
  const result = await animateReels(finalValues);

  const reward = result.reduce((a, b) => a + b, 0);
  state.coins += reward;
  state.lastSpinAt = Date.now();
  refreshCoins();

  els.spinResult.textContent = `Result ${result.join(" | ")}  +${reward} coins`;
  state.spinning = false;
  updateCooldown();
}

async function animateReels(finalValues) {
  const spinMs = 1700;
  const tickMs = 80;
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

  const total = Math.floor(left / 1000);
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  els.spinCooldown.textContent = `Cooldown: ${hh}:${mm}:${ss}`;
  els.spinBtn.disabled = true;
}

function startBattle(mode) {
  if (mode === "pvp") {
    if (state.coins < PVP_ENTRY_COST) {
      setScreen("menu");
      return;
    }
    state.coins -= PVP_ENTRY_COST;
    refreshCoins();
  }

  state.mode = mode;
  resetMatch();
  els.battleTitle.textContent = mode === "pve" ? "PvE Training" : "PvP Match";
  els.battleSubtitle.textContent = mode === "pve" ? "Practice mode. Coins are safe." : `Entry: ${PVP_ENTRY_COST} coins`;
  setScreen("battle");
}

function renderBoard() {
  els.board.innerHTML = "";
  state.board.forEach((cell, index) => {
    const button = document.createElement("button");
    button.className = "cell";
    button.type = "button";
    button.textContent = cell ?? "";
    button.addEventListener("click", () => onPlayerMove(index));
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
    els.matchResult.textContent = "Draw";
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
      els.matchResult.textContent = "You win +20";
    } else {
      els.matchResult.textContent = "You win";
    }
  } else {
    els.matchResult.textContent = state.mode === "pvp" ? "You lost" : "Bot wins";
  }

  renderBoard();
  return true;
}

function resetMatch() {
  state.board = Array(9).fill(null);
  state.finished = false;
  els.matchResult.textContent = "Match in progress";
  renderBoard();
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

async function openRules() {
  const url = "https://docs.base.org/mini-apps/featured-guidelines/design-guidelines";
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

function refreshCoins() {
  els.coins.textContent = String(state.coins);
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
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element;
}
