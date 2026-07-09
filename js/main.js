/**
 * main.js
 * Entry point — boots the app and runs the main animation loop.
 */

// ── State ──────────────────────────────────────────────────────────────────

let isRunning = false;
let rafHandle = null;

// Speed multiplier: accumulate fractional ticks to support slow-mo
let speedMult = 1;
let tickAccum = 0;

function setSpeedMult(v) { speedMult = Math.max(0.05, v); }

// FPS tracking
let lastTime   = 0;
let frameCount = 0;
let fpsAccum   = 0;

// ── Boot ───────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('preview-canvas');
  initRenderer(canvas);
  initUI();

  // Buttons
  document.getElementById('btn-play').addEventListener('click', play);
  document.getElementById('btn-pause').addEventListener('click', pause);
  document.getElementById('btn-reset').addEventListener('click', reset);

  // Resize: re-measure container and reset spawn coords.
  // Mobile browsers fire resize when the URL bar collapses during scroll —
  // ignore height-only changes there, or the canvas resizes mid-scroll.
  let _lastResizeW = window.innerWidth;
  window.addEventListener('resize', () => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const widthChanged = Math.abs(window.innerWidth - _lastResizeW) > 2;
    if (coarse && !widthChanged) return;
    _lastResizeW = window.innerWidth;
    sizeCanvas();
    clearCanvas();
    resetParticles();
  });

  // Resume animation automatically when the tab regains visibility
  // (Chrome throttles rAF in background tabs, which can stall the loop)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isRunning) {
      // Re-kick the loop — rAF stops silently in hidden tabs
      cancelAnimationFrame(rafHandle);
      lastTime  = performance.now();
      rafHandle = requestAnimationFrame(loop);
    }
  });

  // Auto-play immediately
  play();
});

// ── Loop ───────────────────────────────────────────────────────────────────

function play() {
  if (isRunning) return;
  isRunning = true;
  document.getElementById('btn-play').classList.add('hidden');
  document.getElementById('btn-pause').classList.remove('hidden');
  document.getElementById('canvas-overlay').classList.add('hidden');
  document.getElementById('canvas-wrap').classList.add('running');
  lastTime  = performance.now();
  rafHandle = requestAnimationFrame(loop);
}

function pause() {
  if (!isRunning) return;
  isRunning = false;
  cancelAnimationFrame(rafHandle);
  document.getElementById('btn-pause').classList.add('hidden');
  document.getElementById('btn-play').classList.remove('hidden');
  document.getElementById('canvas-overlay').classList.remove('hidden');
  document.getElementById('canvas-wrap').classList.remove('running');
}

function reset() {
  resetParticles();
  clearCanvas();
  // If we're in burst mode, trigger a fresh burst immediately
  if (cfg.emitterMode === 'burst') {
    cfg.burstPending = true;
  }
}

function loop(now) {
  if (!isRunning) return;

  // ── FPS counter ─────────────────────────────────────────────────────────
  const dt = now - lastTime;
  lastTime = now;
  fpsAccum += dt;
  frameCount++;

  if (fpsAccum >= 500) {
    const fps = Math.round((frameCount / fpsAccum) * 1000);
    document.getElementById('fps-display').textContent = fps + ' fps';
    fpsAccum   = 0;
    frameCount = 0;
  }

  // ── Live particle count ──────────────────────────────────────────────────
  // Compact stats on small screens — the full "x / y particles" gets clipped
  window._pdCompactStats ??= window.matchMedia('(max-width: 1000px), ((pointer: coarse) and (max-width: 1680px))');
  document.getElementById('particle-count-live').textContent = window._pdCompactStats.matches
    ? liveCount() + ' particles'
    : liveCount() + ' / ' + cfg.count + ' particles';

  // ── Simulate + Render ─────────────────────────────────────────────────────
  // Accumulate ticks so fractional speeds work (e.g. 0.5× = 1 tick per 2 frames)
  tickAccum += speedMult;
  const ticks = Math.floor(tickAccum);
  tickAccum -= ticks;
  for (let t = 0; t < ticks; t++) tickEmitter();
  renderFrame();

  rafHandle = requestAnimationFrame(loop);
}
