/**
 * main.js
 * Entry point — boots the app and runs the main animation loop.
 */

// ── State ──────────────────────────────────────────────────────────────────

let isRunning = false;
let rafHandle = null;

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

  // Resize: re-measure container and reset spawn coords
  window.addEventListener('resize', () => {
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
  document.getElementById('particle-count-live').textContent = liveCount() + ' particles';

  // ── Simulate + Render ─────────────────────────────────────────────────────
  tickEmitter();
  renderFrame();

  rafHandle = requestAnimationFrame(loop);
}
