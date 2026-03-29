/**
 * main.js
 * Entry point — boots the app and runs the main animation loop.
 */

// ── State ──────────────────────────────────────────────────────────────────

let isRunning = false;
let rafHandle = null;

// FPS tracking
let lastTime  = 0;
let frameCount = 0;
let fpsAccum  = 0;

// ── Boot ───────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  // Initialise renderer with the preview canvas
  const canvas = document.getElementById('preview-canvas');
  initRenderer(canvas);

  // Wire all UI controls
  initUI();

  // Play/Pause/Reset buttons
  document.getElementById('btn-play').addEventListener('click', play);
  document.getElementById('btn-pause').addEventListener('click', pause);
  document.getElementById('btn-reset').addEventListener('click', reset);

  // Handle window resize
  window.addEventListener('resize', () => {
    sizeCanvas();
    clearCanvas();
  });

  // Auto-play on load
  play();
});

// ── Loop ───────────────────────────────────────────────────────────────────

function play() {
  if (isRunning) return;
  isRunning = true;
  document.getElementById('btn-play').classList.add('hidden');
  document.getElementById('btn-pause').classList.remove('hidden');
  document.getElementById('canvas-overlay').classList.add('hidden');
  lastTime = performance.now();
  rafHandle = requestAnimationFrame(loop);
}

function pause() {
  if (!isRunning) return;
  isRunning = false;
  cancelAnimationFrame(rafHandle);
  document.getElementById('btn-pause').classList.add('hidden');
  document.getElementById('btn-play').classList.remove('hidden');
  document.getElementById('canvas-overlay').classList.remove('hidden');
}

function reset() {
  resetParticles();
  clearCanvas();
  // If paused, re-prime by staying paused; if running, loop will refill naturally
}

function loop(now) {
  if (!isRunning) return;

  // ── FPS counter ─────────────────────────────────────────────────────────
  const dt = now - lastTime;
  lastTime = now;
  fpsAccum += dt;
  frameCount++;

  if (fpsAccum >= 500) { // Update FPS display every 500ms
    const fps = Math.round((frameCount / fpsAccum) * 1000);
    document.getElementById('fps-display').textContent = fps + ' fps';
    fpsAccum   = 0;
    frameCount = 0;
  }

  // ── Live particle count ──────────────────────────────────────────────────
  document.getElementById('particle-count-live').textContent = liveCount() + ' particles';

  // ── Simulate ─────────────────────────────────────────────────────────────
  tickEmitter();

  // ── Render ───────────────────────────────────────────────────────────────
  renderFrame();

  rafHandle = requestAnimationFrame(loop);
}
