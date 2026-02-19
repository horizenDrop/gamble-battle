export type LoopHandle = { stop: () => void };

export type BuffPolicy = {
  maxStacks: Record<string, number>;
  maxDurationSeconds: Record<string, number>;
  cooldownSeconds: Record<string, number>;
};

export function createRafLoop(tick: (dtSeconds: number) => void): LoopHandle {
  let running = true;
  let rafId = 0;
  let last = performance.now();

  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.04);
    last = now;
    tick(dt);
    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    }
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function applyTimedBuff(currentSeconds: number, addSeconds: number, maxSeconds: number) {
  return Math.min(maxSeconds, currentSeconds + addSeconds);
}
