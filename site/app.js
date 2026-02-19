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
  playerTurn: true,
  leaderboardRows: []
};

const els = {
  walletAddress: byId("wallet-address"),
  nicknameInput: byId("nickname-input"),
  saveNicknameBtn: byId("save-nickname-btn"),
  nicknameStatus: byId("nickname-status"),
  menuNickname: byId("menu-nickname"),
  menuAddress: byId("menu-address"),
  coins: byId("coins"),
  wins: byId("wins"),
  losses: byId("losses"),
  draws: byId("draws"),
  pveWinRate: byId("pve-winrate"),
  pvpWinRate: byId("pvp-winrate"),
  checkins: byId("checkins"),
  menuStatus: byId("menu-status"),
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
  leaderboardBtn: byId("leaderboard-btn"),
  leaderboardBackBtn: byId("leaderboard-back-btn"),
  pveFirstPlayerBtn: byId("pve-first-player"),
  pveFirstBotBtn: byId("pve-first-bot"),
  checkinBtn: byId("checkin-btn"),
  resetBtn: byId("reset-match"),
  backMenuBtn: byId("back-menu"),
  reels: [byId("reel-0"), byId("reel-1"), byId("reel-2")],
  screenWallet: byId("screen-wallet"),
  screenNickname: byId("screen-nickname"),
  screenMenu: byId("screen-menu"),
  screenSlot: byId("screen-slot"),
  screenLeaderboard: byId("screen-leaderboard"),
  screenBattle: byId("screen-battle"),
  leaderboardList: byId("leaderboard-list")
};

boot();

async function boot() {
  await setupMiniAppSDK();
  wireEvents();
  renderBoard();
  setStatus("Connect wallet to continue");
  setInterval(updateCooldown, 1000);
  await tryAutoConnect();
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
  els.openSlotBtn.addEventListener("click", async () => {
    await syncProfile();
    setScreen("slot");
  });
  els.slotBackBtn.addEventListener("click", async () => {
    await syncProfile();
    setScreen("menu");
  });
  els.spinBtn.addEventListener("click", spinInteractive);
  els.pveBtn.addEventListener("click", () => startBattle("pve"));
  els.pvpBtn.addEventListener("click", () => startBattle("pvp"));
  els.leaderboardBtn.addEventListener("click", openLeaderboard);
  els.leaderboardBackBtn.addEventListener("click", () => setScreen("menu"));
  els.saveNicknameBtn.addEventListener("click", saveNickname);
  els.pveFirstPlayerBtn.addEventListener("click", () => setPveFirstMover("player"));
  els.pveFirstBotBtn.addEventListener("click", () => setPveFirstMover("bot"));
  els.checkinBtn.addEventListener("click", onchainCheckin);
  els.resetBtn.addEventListener("click", resetMatch);
  els.backMenuBtn.addEventListener("click", async () => {
    await syncProfile();
    setScreen("menu");
  });
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

  await syncProfile();
  const hasNickname = Boolean(String(state.profile?.nickname ?? "").trim());
  setScreen(hasNickname ? "menu" : "nickname");
  if (hasNickname) {
    setStatus("Nickname locked. Choose your next action.");
  } else {
    els.nicknameInput.value = "";
    els.nicknameStatus.textContent = "Choose nickname once. It cannot be changed.";
  }

  await verifyDbStatus();
}

function setScreen(name) {
  els.screenWallet.classList.toggle("active", name === "wallet");
  els.screenNickname.classList.toggle("active", name === "nickname");
  els.screenMenu.classList.toggle("active", name === "menu");
  els.screenSlot.classList.toggle("active", name === "slot");
  els.screenLeaderboard.classList.toggle("active", name === "leaderboard");
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

  await syncProfile();
  if (spinWaitMs() > 0) {
    els.spinResult.textContent = "Cooldown active. Come back later.";
    setStatus("Spin blocked by cooldown");
    return;
  }

  state.spinning = true;
  updateCooldown();
  els.spinResult.textContent = "Spinning...";

  await animateReels();

  const result = await apiPost("/api/spin", { address: state.address });
  if (!result.ok) {
    state.profile = result.profile;
    refreshProfileUI();
    state.spinning = false;
    updateCooldown();
    els.spinResult.textContent = "Cooldown active. Come back later.";
    setStatus("Spin denied by server cooldown");
    return;
  }

  state.profile = result.profile;
  refreshProfileUI();

  const display = normalizeDisplaySymbols(result.displaySymbols?.length ? result.displaySymbols : result.symbols);
  for (let i = 0; i < els.reels.length; i += 1) {
    els.reels[i].textContent = String(display[i]);
  }

  els.spinResult.textContent = `${result.label} +${result.reward} coins`;
  setStatus(result.tier === "jackpot" ? `JACKPOT +${result.reward}` : `Spin complete +${result.reward}`);
  state.spinning = false;
  updateCooldown();
  trackEvent("spin_success");
}

async function animateReels() {
  const spinMs = 1700;
  const tickMs = 80;
  const start = Date.now();

  await new Promise((resolve) => {
    const interval = setInterval(() => {
      for (let i = 0; i < els.reels.length; i += 1) {
        els.reels[i].textContent = randSymbol();
      }

      if (Date.now() - start >= spinMs) {
        clearInterval(interval);
        resolve();
      }
    }, tickMs);
  });
}

function spinWaitMs() {
  const lastSpinAt = Number(state.profile?.lastSpinAt ?? 0);
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
      setStatus("Not enough coins for PvP");
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
  } else {
    els.battleTitle.textContent = "PvP Match";
    els.battleSubtitle.textContent = `Entry ${start.entryCost} coins`;
  }

  await resetMatch();
  setScreen("battle");
  trackEvent(mode === "pve" ? "battle_pve_start" : "battle_pvp_start");
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
    trackEvent(`battle_${state.mode}_${outcome}`);
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
    const chainId = await ensureBaseChain();
    const txRef = await submitCheckinTransaction(chainId);
    const txHash = /^0x[a-fA-F0-9]{64}$/.test(String(txRef)) ? String(txRef) : "";

    const result = await apiPost("/api/checkin", {
      address: state.address,
      txHash,
      txRef: String(txRef),
      chainId
    });

    if (result.ok) {
      state.profile = result.profile;
      refreshProfileUI();
      trackEvent("checkin_success");
      return;
    }

    if (result.reason === "ALREADY_CHECKED_IN") {
      state.profile = result.profile;
      refreshProfileUI();
      return;
    }

    setStatus("Check-in failed");
  } catch (error) {
    const message = String(error?.message ?? "").toLowerCase();
    if (message.includes("insufficient")) {
      setStatus("Check-in failed: wallet reports insufficient gas funds");
      return;
    }
    setStatus("Onchain check-in canceled or failed");
  }
}

async function saveNickname() {
  if (!state.address) return;

  const nickname = String(els.nicknameInput.value ?? "").trim();
  if (nickname.length < 2) {
    els.nicknameStatus.textContent = "Nickname must be at least 2 chars";
    return;
  }

  try {
    const result = await apiPost("/api/player", {
      address: state.address,
      nickname
    });

    if (!result.ok) {
      if (result.reason === "NICKNAME_TAKEN") {
        els.nicknameStatus.textContent = "Nickname already taken";
        return;
      }
      if (result.reason === "NICKNAME_LOCKED") {
        state.profile = result.profile ?? state.profile;
        refreshProfileUI();
        els.nicknameStatus.textContent = "Nickname already locked";
        setScreen("menu");
        return;
      }
      els.nicknameStatus.textContent = "Failed to save nickname";
      return;
    }

    state.profile = result.profile;
    refreshProfileUI();
    els.nicknameInput.value = "";
    els.nicknameStatus.textContent = "Nickname saved";
    setScreen("menu");
    setStatus("Nickname saved and locked");
    trackEvent("nickname_set");
  } catch {
    els.nicknameStatus.textContent = "Failed to save nickname";
  }
}

async function openLeaderboard() {
  try {
    const data = await apiGet("/api/leaderboard?limit=30");
    state.leaderboardRows = data.rows ?? [];
    renderLeaderboard();
    setScreen("leaderboard");
    setStatus("Leaderboard updated");
  } catch {
    setStatus("Failed to load leaderboard");
  }
}

function renderLeaderboard() {
  if (!state.leaderboardRows.length) {
    els.leaderboardList.innerHTML = "<p class=\"tiny\">No players yet</p>";
    return;
  }

  els.leaderboardList.innerHTML = state.leaderboardRows
    .map((row, index) => {
      const nick = displayName(row);
      return `<div class="lb-row">
        <div class="lb-rank">#${index + 1}</div>
        <div>
          <div class="lb-name">${escapeHtml(nick)}</div>
          <div class="lb-meta">${shortAddress(row.evmAddress || row.address)} | PvE ${formatPct(row.pveWinRate)} | PvP ${formatPct(row.pvpWinRate)}</div>
        </div>
        <div class="lb-rank">${Number(row.balance ?? 0)} coins</div>
      </div>`;
    })
    .join("");
}

async function submitCheckinTransaction(chainId) {
  const paymasterUrl = await getPaymasterUrl();
  const call = {
    to: state.address,
    value: "0x0"
  };

  const payload = {
    version: "2.0.0",
    chainId,
    from: state.address,
    atomicRequired: false,
    calls: [call]
  };

  const attempts = [];
  if (paymasterUrl) {
    attempts.push({
      method: "wallet_sendCalls",
      params: [
        {
          ...payload,
          capabilities: {
            paymasterService: {
              url: paymasterUrl,
              optional: true
            }
          }
        }
      ]
    });
  }
  attempts.push({ method: "wallet_sendCalls", params: [payload] });
  attempts.push({
    method: "eth_sendTransaction",
    params: [{ from: state.address, ...call }]
  });

  let lastError = null;
  for (const req of attempts) {
    try {
      const result = await state.provider.request(req);
      if (typeof result === "string") return result;
      if (result?.transactionHash) return result.transactionHash;
      if (result?.id) return result.id;
      if (result) return JSON.stringify(result);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message ?? "check-in transaction failed");
}

async function ensureBaseChain() {
  const chainId = await state.provider.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() === "0x2105") return "0x2105";

  await state.provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: "0x2105" }]
  });
  return "0x2105";
}

async function getPaymasterUrl() {
  try {
    const config = await apiGet("/api/checkin-config");
    return String(config?.paymasterUrl ?? "").trim();
  } catch {
    return "";
  }
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

  els.menuNickname.textContent = displayName(profile);
  els.menuAddress.textContent = shortAddress(profile.evmAddress || profile.address);
  els.coins.textContent = String(profile.balance ?? 0);
  els.wins.textContent = String(profile.wins ?? 0);
  els.losses.textContent = String(profile.losses ?? 0);
  els.draws.textContent = String(profile.draws ?? 0);
  els.pveWinRate.textContent = formatPct(profile.pveWinRate);
  els.pvpWinRate.textContent = formatPct(profile.pvpWinRate);
  els.checkins.textContent = String(profile.checkins ?? 0);
  refreshPveScore();
  refreshFirstTurnButtons();
  updateCooldown();
}

async function syncProfile() {
  if (!state.address) return;
  const response = await apiGet(`/api/player?address=${encodeURIComponent(state.address)}`);
  state.profile = response.profile;
  refreshProfileUI();
}

async function verifyDbStatus() {
  try {
    const db = await apiGet("/api/db-status");
    if (!db.ok) {
      setStatus("DB issue detected. Check Redis config.");
      return;
    }
    if (db.mode === "memory") {
      setStatus("DB mode: memory (configure Redis for persistent state)");
      return;
    }
    setStatus("DB mode: Redis connected");
  } catch {
    setStatus("DB status unavailable");
  }
}

async function trackEvent(event) {
  try {
    await apiPost("/api/track", { event });
  } catch {
    // best effort
  }
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

function setStatus(message) {
  els.menuStatus.textContent = `Status: ${message}`;
}

function applySafeArea(insets) {
  if (!insets) return;
  document.documentElement.style.setProperty("--safe-top", `${insets.top ?? 0}px`);
  document.documentElement.style.setProperty("--safe-right", `${insets.right ?? 0}px`);
  document.documentElement.style.setProperty("--safe-bottom", `${insets.bottom ?? 0}px`);
  document.documentElement.style.setProperty("--safe-left", `${insets.left ?? 0}px`);
}

function randSymbol() {
  const values = ["🍒", "🍋", "🟦", "7️⃣", "💎"];
  return values[Math.floor(Math.random() * values.length)];
}

function normalizeDisplaySymbols(symbols) {
  return symbols.map((s) => (s === "7" ? "7️⃣" : s));
}

function shortAddress(address) {
  if (!address || address.length < 10) return address ?? "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash) {
  if (!hash || hash.length < 12) return hash ?? "-";
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function formatPct(value) {
  const num = Number(value ?? 0);
  return `${num.toFixed(1)}%`;
}

function displayName(profile) {
  const name = String(profile?.nickname ?? "").trim();
  return name || "Anonymous";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element;
}
