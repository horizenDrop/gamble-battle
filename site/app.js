const state = {
  sdk: null,
  provider: null,
  address: null,
  inMiniApp: false,
  lastSpinAt: 0,
  cooldownMs: 60 * 60 * 1000,
  board: Array(9).fill(null),
  finished: false
};

const els = {
  status: byId("miniapp-status"),
  walletAddress: byId("wallet-address"),
  contextInfo: byId("context-info"),
  spinResult: byId("spin-result"),
  spinCooldown: byId("spin-cooldown"),
  matchResult: byId("match-result"),
  actionResult: byId("action-result"),
  board: byId("board"),
  connectBtn: byId("connect-btn"),
  spinBtn: byId("spin-btn"),
  resetBtn: byId("reset-match"),
  signInBtn: byId("signin-btn"),
  openRulesBtn: byId("open-rules-btn")
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

function applySafeArea(insets) {
  if (!insets) return;
  document.documentElement.style.setProperty("--safe-top", `${insets.top ?? 0}px`);
  document.documentElement.style.setProperty("--safe-right", `${insets.right ?? 0}px`);
  document.documentElement.style.setProperty("--safe-bottom", `${insets.bottom ?? 0}px`);
  document.documentElement.style.setProperty("--safe-left", `${insets.left ?? 0}px`);
}

function wireEvents() {
  els.connectBtn.addEventListener("click", connectWallet);
  els.spinBtn.addEventListener("click", doSpin);
  els.resetBtn.addEventListener("click", resetMatch);
  els.signInBtn.addEventListener("click", doSignIn);
  els.openRulesBtn.addEventListener("click", openRules);
}

async function connectWallet() {
  try {
    const sdkProvider = await state.sdk?.wallet?.getEthereumProvider?.();
    const fallbackProvider = window.ethereum;
    state.provider = sdkProvider ?? fallbackProvider;
    if (!state.provider) throw new Error("No wallet provider available");

    const accounts = await state.provider.request({ method: "eth_requestAccounts" });
    state.address = Array.isArray(accounts) ? accounts[0] ?? null : null;
    if (!state.address) throw new Error("Wallet returned no account");

    els.walletAddress.textContent = `Address: ${state.address}`;
  } catch (error) {
    els.walletAddress.textContent = `Address: connect failed (${error?.message ?? "unknown"})`;
  }
}

function doSpin() {
  const now = Date.now();
  const wait = state.cooldownMs - (now - state.lastSpinAt);
  if (state.lastSpinAt > 0 && wait > 0) {
    els.spinResult.textContent = "Spin result: cooldown active";
    return;
  }

  state.lastSpinAt = now;
  const symbols = [randSymbol(), randSymbol(), randSymbol()];
  const reward = symbols.reduce((a, b) => a + b, 0);
  els.spinResult.textContent = `Spin result: [${symbols.join(" | ")}] => +${reward} coins`;
  updateCooldown();
}

function updateCooldown() {
  if (state.lastSpinAt === 0) {
    els.spinCooldown.textContent = "Cooldown: ready";
    return;
  }

  const left = Math.max(0, state.cooldownMs - (Date.now() - state.lastSpinAt));
  if (left === 0) {
    els.spinCooldown.textContent = "Cooldown: ready";
    return;
  }

  const totalSeconds = Math.floor(left / 1000);
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  els.spinCooldown.textContent = `Cooldown: ${hh}:${mm}:${ss}`;
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

  const botPick = empty[Math.floor(Math.random() * empty.length)];
  state.board[botPick] = "O";
  resolveWinner("O");
  renderBoard();
}

function resolveWinner(marker) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  const won = lines.some(([a, b, c]) => state.board[a] === marker && state.board[b] === marker && state.board[c] === marker);
  if (!won) return false;

  state.finished = true;
  els.matchResult.textContent = marker === "X" ? "Match: you win" : "Match: bot wins";
  renderBoard();
  return true;
}

function resetMatch() {
  state.board = Array(9).fill(null);
  state.finished = false;
  els.matchResult.textContent = "Match: in progress";
  renderBoard();
}

async function doSignIn() {
  try {
    if (!state.sdk?.actions?.signIn) {
      els.actionResult.textContent = "Actions: signIn not available in this environment";
      return;
    }

    const nonce = crypto.randomUUID();
    const result = await state.sdk.actions.signIn({ nonce });
    els.actionResult.textContent = `Actions: signIn success (${result?.message ? "signed" : "no payload"})`;
  } catch (error) {
    els.actionResult.textContent = `Actions: signIn failed (${error?.message ?? "unknown"})`;
  }
}

async function openRules() {
  const url = "https://docs.base.org/mini-apps/quickstart/build-checklist";
  try {
    if (state.sdk?.actions?.openUrl) {
      await state.sdk.actions.openUrl(url);
      els.actionResult.textContent = "Actions: opened via mini app navigation";
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    els.actionResult.textContent = "Actions: opened via browser fallback";
  } catch (error) {
    els.actionResult.textContent = `Actions: open failed (${error?.message ?? "unknown"})`;
  }
}

function randSymbol() {
  const symbols = [1, 2, 3, 5, 8, 13];
  return symbols[Math.floor(Math.random() * symbols.length)];
}

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}
