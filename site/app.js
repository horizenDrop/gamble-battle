const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

const state = {
  sdk: null,
  provider: null,
  address: null,
  profile: null,
  spinning: false,
  board: Array(9).fill(null),
  finished: false,
  mode: "pve",
  pveFirstMover: "player",
  playerTurn: true
};

const els = {
  walletAddress: byId("wallet-address"),
  menuAddress: byId("menu-address"),
  coins: byId("coins"),
  wins: byId("wins"),
  losses: byId("losses"),
  draws: byId("draws"),
  checkins: byId("checkins"),
  menuHint: byId("menu-hint"),
  spinResult: byId("spin-result"),
  spinCooldown: byId("spin-cooldown"),
  matchResult: byId("match-result"),
  battleTitle: byId("battle-title"),
  battleSubtitle: byId("battle-subtitle"),
  pveControls: byId("pve-controls"),
  pveScore: byId("pve-score"),
  board: byId("board"),
  connectBtn: byId("connect-btn"),
  openSlotBtn: byId("open-slot-btn"),
  spinBtn: byId("spin-btn"),
  slotBackBtn: byId("slot-back-btn"),
  pveBtn: byId("pve-btn"),
  pvpBtn: byId("pvp-btn"),
  pveFirstPlayerBtn: byId("pve-first-player"),
  pveFirstBotBtn: byId("pve-first-bot"),
  checkinBtn: byId("checkin-btn"),
  resetBtn: byId("reset-match"),
  backMenuBtn: byId("back-menu"),
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
  await tryAutoConnect();
  setInterval(updateCooldown, 1000);
}

async function setupMiniAppSDK() {
  try {
    const mod = await import("https://esm.sh/@farcaster/miniapp-sdk");
    state.sdk = mod.default;
    const context = await Promise.resolve(state.sdk.context);
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
  els.pveFirstPlayerBtn.addEventListener("click", () => setPveFirstMover("player"));
  els.pveFirstBotBtn.addEventListener("click", () => setPveFirstMover("bot"));
  els.checkinBtn.addEventListener("click", onchainCheckin);
  els.resetBtn.addEventListener("click", resetMatch);
  els.backMenuBtn.addEventListener("click", () => setScreen("menu"));
}

async function tryAutoConnect() {
  try {
    const provider = await getProvider();
    if (!provider) return;
    state.provider = provider;

    const accounts = await provider.request({ method: "eth_accounts" });
    const first = Array.isArray(accounts) ? accounts[0] : null;
    if (!first) return;

    await onWalletConnected(first);
  } catch {
    // silent
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

    await onWalletConnected(first);
  } catch {
    els.walletAddress.textContent = "Connection failed. Try again.";
  }
}

async function onWalletConnected(address) {
  state.address = String(address).toLowerCase();
  els.walletAddress.textContent = `Connected: ${shortAddress(state.address)}`;
  els.menuAddress.textContent = `Wallet: ${shortAddress(state.address)}`;

  const response = await apiGet(`/api/player?address=${encodeURIComponent(state.address)}`);
  state.profile = response.profile;
  refreshProfileUI();
  setScreen("menu");
}

function setScreen(name) {
  els.screenWallet.classList.toggle("active", name === "wallet");
  els.screenMenu.classList.toggle("active", name === "menu");
  els.screenSlot.classList.toggle("active", name === "slot");
  els.screenBattle.classList.toggle("active", name === "battle");
}

function setPveFirstMover(next) {
  state.pveFirstMover = next === "bot" ? "bot" : "player";
  refreshFirstTurnButtons();
  if (state.mode === "pve") {
    els.battleSubtitle.textContent = state.pveFirstMover === "bot" ? "Bot moves first." : "You move first.";
  }
}

async function spinInteractive() {
  if (!state.address || state.spinning) return;

  const wait = spinWaitMs();
  if (wait > 0) {
    els.spinResult.textContent = "Cooldown active. Come back later.";
    return;
  }

  state.spinning = true;
  els.spinBtn.disabled = true;
  els.spinResult.textContent = "Spinning...";

  await animateReels();

  const result = await apiPost("/api/spin", { address: state.address });
  if (!result.ok) {
    els.spinResult.textContent = "Cooldown active. Come back later.";
    state.profile = result.profile;
    refreshProfileUI();
    state.spinning = false;
    updateCooldown();
    return;
  }

  state.profile = result.profile;
  refreshProfileUI();

  for (let i = 0; i < els.reels.length; i += 1) {
    els.reels[i].textContent = String(result.symbols[i]);
  }

  els.spinResult.textContent = `Result ${result.symbols.join(" | ")}  +${result.reward} coins`;
  state.spinning = false;
  updateCooldown();
}

async function animateReels() {
  const spinMs = 1700;
  const tickMs = 80;
  const start = Date.now();

  await new Promise((resolve) => {
    const interval = setInterval(() => {
      for (let i = 0; i < els.reels.length; i += 1) {
        els.reels[i].textContent = String(randSymbol());
      }

      if (Date.now() - start >= spinMs) {
        clearInterval(interval);
        resolve();
      }
    }, tickMs);
  });
}

function spinWaitMs() {
  const lastSpinAt = state.profile?.lastSpinAt ?? 0;
  if (!lastSpinAt) return 0;
  return Math.max(0, 60 * 60 * 1000 - (Date.now() - lastSpinAt));
}

function updateCooldown() {
  const wait = spinWaitMs();
  if (wait <= 0) {
    els.spinCooldown.textContent = "Cooldown: ready";
    els.spinBtn.disabled = state.spinning;
    return;
  }

  const total = Math.floor(wait / 1000);
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  els.spinCooldown.textContent = `Cooldown: ${hh}:${mm}:${ss}`;
  els.spinBtn.disabled = true;
}

async function startBattle(mode) {
  if (!state.address) return;

  const start = await apiPost("/api/battle", {
    address: state.address,
    mode,
    stage: "start"
  });

  if (!start.ok) {
    if (start.reason === "NOT_ENOUGH_COINS") {
      els.menuHint.textContent = "Not enough coins for PvP";
      state.profile = start.profile;
      refreshProfileUI();
    }
    return;
  }

  state.profile = start.profile;
  refreshProfileUI();

  state.mode = mode;
  els.pveControls.style.display = mode === "pve" ? "block" : "none";
  if (mode === "pve") {
    els.battleTitle.textContent = "PvE Training";
    els.battleSubtitle.textContent = state.pveFirstMover === "bot" ? "Bot moves first." : "You move first.";
    refreshPveScore();
    refreshFirstTurnButtons();
  } else {
    els.battleTitle.textContent = "PvP Match";
    els.battleSubtitle.textContent = `Entry ${start.entryCost} coins`;
  }
  await resetMatch();
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

async function onPlayerMove(index) {
  if (state.finished || state.board[index] || !state.playerTurn) return;

  state.board[index] = "X";
  state.playerTurn = false;
  if (await resolveWinner("X")) return;

  const empty = state.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (empty.length === 0) {
    state.finished = true;
    els.matchResult.textContent = "Draw";
    await finishBattle("draw");
    renderBoard();
    return;
  }

  await botTakeTurn();
  renderBoard();
}

async function resolveWinner(marker) {
  const won = WIN_LINES.some(([a, b, c]) => state.board[a] === marker && state.board[b] === marker && state.board[c] === marker);
  if (!won) return false;

  state.finished = true;
  if (marker === "X") {
    els.matchResult.textContent = "You win";
    await finishBattle("win");
  } else {
    els.matchResult.textContent = "You lost";
    await finishBattle("loss");
  }

  renderBoard();
  return true;
}

async function finishBattle(outcome) {
  const result = await apiPost("/api/battle", {
    address: state.address,
    mode: state.mode,
    stage: "finish",
    outcome
  });

  if (result.ok) {
    state.profile = result.profile;
    refreshProfileUI();
  }
}

async function botTakeTurn() {
  const empty = state.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (empty.length === 0) {
    state.finished = true;
    els.matchResult.textContent = "Draw";
    await finishBattle("draw");
    return;
  }

  const botPick = pickBotMove(state.board, empty);
  state.board[botPick] = "O";
  const botWon = await resolveWinner("O");
  if (botWon) return;

  if (state.board.every((cell) => cell !== null)) {
    state.finished = true;
    els.matchResult.textContent = "Draw";
    await finishBattle("draw");
    return;
  }

  state.playerTurn = true;
}

async function resetMatch() {
  state.board = Array(9).fill(null);
  state.finished = false;
  state.playerTurn = state.mode !== "pve" || state.pveFirstMover === "player";
  els.matchResult.textContent = "Match in progress";
  renderBoard();
  if (state.mode === "pve" && state.pveFirstMover === "bot") {
    await botTakeTurn();
    renderBoard();
  }
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

async function onchainCheckin() {
  if (!state.address || !state.provider) return;

  try {
    await ensureBaseChain();
    const txRef = await submitCheckinTransaction();
    const txHash = /^0x[a-fA-F0-9]{64}$/.test(String(txRef)) ? String(txRef) : "";

    const result = await apiPost("/api/checkin", {
      address: state.address,
      txHash,
      txRef: String(txRef)
    });

    if (result.ok) {
      state.profile = result.profile;
      refreshProfileUI();
      els.menuHint.textContent = `Check-in confirmed (${shortHash(String(txRef))})`;
    } else if (result.reason === "ALREADY_CHECKED_IN") {
      els.menuHint.textContent = "Today check-in already completed";
      state.profile = result.profile;
      refreshProfileUI();
    } else {
      els.menuHint.textContent = "Check-in failed";
    }
  } catch {
    els.menuHint.textContent = "Onchain check-in canceled or failed";
  }
}

async function submitCheckinTransaction() {
  const call = {
    to: state.address,
    value: "0x0",
    data: "0x67626c5f636865636b696e"
  };

  try {
    const result = await state.provider.request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          chainId: "0x2105",
          from: state.address,
          atomicRequired: false,
          calls: [call]
        }
      ]
    });

    if (typeof result === "string") return result;
    if (result?.transactionHash) return result.transactionHash;
    if (result?.id) return result.id;
    return JSON.stringify(result);
  } catch {
    return state.provider.request({
      method: "eth_sendTransaction",
      params: [{ from: state.address, ...call }]
    });
  }
}

async function ensureBaseChain() {
  const chainId = await state.provider.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() === "0x2105") return;

  await state.provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: "0x2105" }]
  });
}

function refreshPveScore() {
  const player = state.profile?.pvePlayerWins ?? 0;
  const bot = state.profile?.pveBotWins ?? 0;
  els.pveScore.textContent = `Score You ${player} : ${bot} Bot`;
}

function refreshFirstTurnButtons() {
  els.pveFirstPlayerBtn.classList.toggle("selected", state.pveFirstMover === "player");
  els.pveFirstBotBtn.classList.toggle("selected", state.pveFirstMover === "bot");
}

function refreshProfileUI() {
  const profile = state.profile;
  if (!profile) return;

  els.coins.textContent = String(profile.balance ?? 0);
  els.wins.textContent = String(profile.wins ?? 0);
  els.losses.textContent = String(profile.losses ?? 0);
  els.draws.textContent = String(profile.draws ?? 0);
  els.checkins.textContent = String(profile.checkins ?? 0);
  refreshPveScore();
  refreshFirstTurnButtons();
  els.menuHint.textContent = "Ready";
  updateCooldown();
}

async function getProvider() {
  const sdkProvider = await state.sdk?.wallet?.getEthereumProvider?.();
  return sdkProvider ?? window.ethereum ?? null;
}

async function apiGet(url) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}

async function apiPost(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}

function applySafeArea(insets) {
  if (!insets) return;
  document.documentElement.style.setProperty("--safe-top", `${insets.top ?? 0}px`);
  document.documentElement.style.setProperty("--safe-right", `${insets.right ?? 0}px`);
  document.documentElement.style.setProperty("--safe-bottom", `${insets.bottom ?? 0}px`);
  document.documentElement.style.setProperty("--safe-left", `${insets.left ?? 0}px`);
}

function randSymbol() {
  const values = [1, 2, 3, 5, 8, 13];
  return values[Math.floor(Math.random() * values.length)];
}

function shortAddress(address) {
  if (!address || address.length < 10) return address ?? "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash) {
  if (!hash || hash.length < 12) return hash ?? "-";
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element;
}
