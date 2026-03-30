/**
 * emitter.js
 * Manages the particle pool, spawn logic, and emitter position.
 *
 * New in v0.2:
 *   - emitterX / emitterY   — user-draggable spawn point
 *   - turbulence             — velocity noise amount passed to particles
 *   - useGradient            — lifetime colour gradient
 *   - loop                   — auto-reset for seamless looping
 */

// ── State ──────────────────────────────────────────────────────────────────

/** All particles (live + dead slots reused to avoid GC pressure). */
const particles = [];

/** Canvas dimensions — written by renderer.js sizeCanvas(). */
let canvasW = 512;
let canvasH = 512;

/**
 * Emitter origin in canvas pixels.
 * -1 = not yet set; sizeCanvas() initialises it to center on first call.
 */
let emitterX = -1;
let emitterY = -1;

/** True while the user is dragging the emitter on the canvas. */
let emitterDragging = false;

/** Frames elapsed since the last loop-reset (used by the loop feature). */
let _loopTimer = 0;

/** Current emitter config. Updated by ui.js via setEmitterConfig(). */
let cfg = {
  // Emitter
  emitterShape:  'point',       // 'point' | 'line' | 'circle'
  emitterMode:   'continuous',  // 'continuous' | 'burst' | 'trail'
  count:         120,
  spawnRate:     60,            // particles per second (continuous/trail modes)

  // Movement
  speed:         3,
  spread:        45,            // degrees
  direction:     270,           // degrees (270 = upward in canvas coords)
  gravity:       0.15,
  turbulence:    0,             // random velocity jitter per frame

  // Appearance
  particleSize:  3,
  particleShape: 'square',
  blendMode:     'lighter',
  startAlpha:    1,             // starting opacity of each particle
  rotation:      0,             // max rotation speed in degrees/frame (0 = no spin)

  // Lifetime
  lifetime:      60,
  fade:          1,
  shrink:        0,

  // Colour
  multiColor:    true,

  // Gradient
  useGradient:   false,
  gradientStart: '#ffff00',
  gradientEnd:   '#ff0000',

  // Loop
  loop:          false,

  // Burst state (transient)
  burstPending:  false,

  // Export helpers
  bgColor:       '#0c0c0e',
};

// ── Public API ─────────────────────────────────────────────────────────────

/** Merge partial config update. */
function setEmitterConfig(partial) {
  Object.assign(cfg, partial);
}

/** Returns the live config object (snapshot for exporters). */
function getEmitterConfig() {
  return cfg;
}

/** Kill all particles (keeps pool array, reuses slots). */
function resetParticles() {
  for (const p of particles) p.alive = false;
  _loopTimer = 0;
}

/** Number of currently-alive particles (for the HUD). */
function liveCount() {
  let n = 0;
  for (const p of particles) if (p.alive) n++;
  return n;
}

/**
 * Move the emitter origin to (x, y) in canvas pixels.
 * Called by the canvas drag handler in renderer.js.
 */
function setEmitterPos(x, y) {
  emitterX = Math.round(x);
  emitterY = Math.round(y);
}

/**
 * Centre the emitter on the current canvas.
 * Called by sizeCanvas() on every resize.
 */
function centerEmitter() {
  emitterX = Math.round(canvasW / 2);
  emitterY = Math.round(canvasH / 2);
}

// ── Simulation tick ────────────────────────────────────────────────────────

/**
 * Advance the simulation by one frame.
 * Called every frame from main.js loop().
 */
function tickEmitter() {
  // ── Initialise emitter position on very first tick ────────────────────
  if (emitterX < 0) centerEmitter();

  // ── Update live particles ─────────────────────────────────────────────
  for (const p of particles) {
    if (p.alive) updateParticle(p);
  }

  // ── Spawn new particles ───────────────────────────────────────────────
  const live = liveCount();
  let toSpawn = 0;

  if (cfg.emitterMode === 'continuous') {
    // Spawn at most `spawnRate/60` particles per frame, capped at max count
    if (live < cfg.count) {
      toSpawn = Math.min(
        cfg.count - live,
        Math.max(1, Math.round(cfg.spawnRate / 60))
      );
    }
  } else if (cfg.emitterMode === 'burst') {
    if (cfg.burstPending) {
      toSpawn = cfg.count;
      cfg.burstPending = false;
    }
  } else if (cfg.emitterMode === 'trail') {
    // Trickle at spawnRate/60 per frame, capped at count
    if (live < cfg.count) {
      toSpawn = Math.min(
        cfg.count - live,
        Math.max(1, Math.round(cfg.spawnRate / 60))
      );
    }
  }

  for (let i = 0; i < toSpawn; i++) {
    const [sx, sy] = spawnPoint();
    spawnParticle(sx, sy);
  }

  // ── Loop auto-reset ───────────────────────────────────────────────────
  // Increments every frame. When the interval elapses, kill all particles
  // so the effect restarts from scratch — creating a seamless loop.
  if (cfg.loop) {
    _loopTimer++;
    // Interval = 1.5× lifetime + 20 frames breathing room
    const interval = Math.ceil(cfg.lifetime * 1.5) + 20;
    if (_loopTimer >= interval) {
      _loopTimer = 0;
      resetParticles();
      if (cfg.emitterMode === 'burst') cfg.burstPending = true;
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Pick a spawn coordinate relative to the current emitter origin. */
function spawnPoint() {
  const cx = emitterX >= 0 ? emitterX : canvasW / 2;
  const cy = emitterY >= 0 ? emitterY : canvasH / 2;

  switch (cfg.emitterShape) {
    case 'line': {
      const hw = canvasW * 0.18;
      return [cx - hw + Math.random() * hw * 2, cy];
    }
    case 'circle': {
      const radius = Math.min(canvasW, canvasH) * 0.16;
      const a = Math.random() * Math.PI * 2;
      return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
    }
    default: // 'point'
      return [cx, cy];
  }
}

/** Place a new particle into the pool, reusing a dead slot if available. */
function spawnParticle(x, y) {
  const p = createParticle(x, y, cfg);
  for (let i = 0; i < particles.length; i++) {
    if (!particles[i].alive) { particles[i] = p; return; }
  }
  particles.push(p);
}
