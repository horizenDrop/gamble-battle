export type ProfileEntry = {
  address: string;
  bestScore: number;
  verifiedBestScore: number;
  lastScore: number;
  totalRuns: number;
  level: number;
  levelXp: number;
  updatedAt: number;
};

export type StorageAdapter = {
  read: () => Promise<ProfileEntry[]>;
  write: (entries: ProfileEntry[]) => Promise<void>;
};

export function xpForNextLevel(level: number) {
  return 40 + level * 30 + level * level * 6;
}

export function deriveStats(level: number) {
  const damage = Number((1 + (level - 1) * 0.15).toFixed(2));
  const maxHp = 3 + Math.floor((level - 1) / 2);
  return { damage, maxHp, nextLevelXp: xpForNextLevel(level) };
}

export function sortLeaderboard(entries: ProfileEntry[]) {
  return [...entries].sort((a, b) => {
    if (b.verifiedBestScore !== a.verifiedBestScore) return b.verifiedBestScore - a.verifiedBestScore;
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
    return b.updatedAt - a.updatedAt;
  });
}

export function applyRun(previous: ProfileEntry | null, score: number, verified: boolean, xpGained: number): ProfileEntry {
  const prev = previous ?? {
    address: "",
    bestScore: 0,
    verifiedBestScore: 0,
    lastScore: 0,
    totalRuns: 0,
    level: 1,
    levelXp: 0,
    updatedAt: 0
  };

  let level = Math.max(1, prev.level);
  let levelXp = Math.max(0, prev.levelXp + Math.max(0, xpGained));
  while (levelXp >= xpForNextLevel(level)) {
    levelXp -= xpForNextLevel(level);
    level += 1;
  }

  return {
    ...prev,
    bestScore: Math.max(prev.bestScore, Math.max(0, Math.floor(score))),
    verifiedBestScore: verified ? Math.max(prev.verifiedBestScore, Math.max(0, Math.floor(score))) : prev.verifiedBestScore,
    lastScore: Math.max(0, Math.floor(score)),
    totalRuns: prev.totalRuns + 1,
    level,
    levelXp,
    updatedAt: Date.now()
  };
}

export function createMemoryAdapter(): StorageAdapter {
  let entries: ProfileEntry[] = [];
  return {
    async read() {
      return entries;
    },
    async write(next) {
      entries = next;
    }
  };
}
