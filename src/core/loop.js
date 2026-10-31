// Fixed 60 Hz simulation loop + sliced boot + perf telemetry per docs/DESIGN.md §1, §3.9, §10 (owner: core).

export const DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const FRAME_WINDOW = 180;

export function createLoop({ ctx, onStep, onRender, onSlice }) {
  let rafId = 0;
  let running = false;
  let paused = false;
  let lastNow = 0;
  let accumulator = 0;
  let pixelRatioDropped = false;

  const frameTimes = [];
  let recentSum = 0;
  let recentCount = 0;

  function stepOne() {
    ctx.state.frame += 1;
    ctx.frame = ctx.state.frame;
    ctx.time = ctx.state.frame * DT;
    ctx.state.timeMs = Math.round(ctx.time * 1000);

    if (!paused && ctx.state.scene !== 'title' && ctx.state.scene !== 'final') {
      ctx.state._runFrames = (ctx.state._runFrames || 0) + 1;
      ctx.state.elapsedMs = Math.round(ctx.state._runFrames * DT * 1000);
    }

    onStep(DT);
  }

  function resetClock() {
    lastNow = 0;
    accumulator = 0;
  }

  function stepFrames(n = 1) {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    for (let i = 0; i < count; i++) {
      stepOne();
    }
    resetClock();
    return ctx.state.frame;
  }

  function recordFrameMs(ms, isBootSlice = false) {
    if (!Number.isFinite(ms) || ms <= 0 || ms > 500) return;
    frameTimes.push(ms);
    if (frameTimes.length > FRAME_WINDOW) frameTimes.shift();

    if (isBootSlice) return;
    recentSum += ms;
    recentCount += 1;
    if (recentCount >= 45) {
      const avg = recentSum / recentCount;
      recentSum = 0;
      recentCount = 0;
      if (!pixelRatioDropped && avg > 22 && ctx.renderer) {
        const cur = ctx.renderer.getPixelRatio();
        if (cur > 1) {
          ctx.renderer.setPixelRatio(1);
          pixelRatioDropped = true;
        }
      }
    }
  }

  function tick(now) {
    if (!running) return;
    rafId = requestAnimationFrame(tick);

    const isFirstAfterGap = lastNow === 0;
    if (isFirstAfterGap) {
      lastNow = now;
    }
    const rawMs = Math.max(0, now - lastNow);
    lastNow = now;

    // Sliced world build budget (≤ 7.5 ms per frame) before heavy play.
    let worldReady = true;
    if (onSlice) {
      worldReady = Boolean(onSlice(7.5));
    }

    if (!isFirstAfterGap) {
      recordFrameMs(rawMs, !worldReady);
    }

    if (!paused) {
      const clampedSec = Math.min(rawMs / 1000, MAX_STEPS_PER_FRAME * DT);
      accumulator += clampedSec;
      let steps = 0;
      while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
        stepOne();
        accumulator -= DT;
        steps += 1;
      }
      if (steps === MAX_STEPS_PER_FRAME) {
        accumulator = 0;
      }
    }

    onRender(accumulator / DT);
  }

  function start() {
    if (running) return;
    running = true;
    lastNow = 0;
    accumulator = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function setPaused(b) {
    paused = Boolean(b);
    lastNow = 0;
    accumulator = 0;
  }

  function isPaused() {
    return paused;
  }

  function perf() {
    const info = ctx.renderer?.info;
    let fps = 60;
    let p95ms = 16.67;
    if (frameTimes.length > 0) {
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const mean = sorted.reduce((acc, v) => acc + v, 0) / sorted.length;
      fps = mean > 0 ? Math.round((1000 / mean) * 10) / 10 : 60;
      const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      p95ms = Math.round(sorted[idx] * 100) / 100;
    }
    return {
      fps,
      p95ms,
      calls: info?.render?.calls ?? 0,
      triangles: info?.render?.triangles ?? 0,
      geometries: info?.memory?.geometries ?? 0,
      textures: info?.memory?.textures ?? 0,
    };
  }

  return {
    DT,
    start,
    stop,
    stepOne,
    stepFrames,
    resetClock,
    setPaused,
    isPaused,
    perf,
  };
}

export default createLoop;
