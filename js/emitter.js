/**
 * emitter.js
 * Manages the particle pool and spawn logic.
 *
 * Responsibilities:
 *   - Maintain a flat array of live particles
 *   - Spawn new particles each frame according to the current config
 *   - Call updateParticle() on each live particle per frame
 *   - Dead particles are recycled to avoid GC pressure
 */

// ── State ──────────────────────────────────────────────────────────────────

/** All particles (live + dead). Dead slots are reused before growing. */
const particles = [];

/** Index of the next available dead slot for quick recycling. -1 = none. */
let _deadHead = -1;

/** Canvas dimensions — set by renderer when canvas is resized. */
let canvasW = 512;
let canvasH = 512;

/** Current emitter config. Updated by ui.js via setEmitterConfig(). */
let cfg = {
  // Emitter
  emitterShape:  'point',   // 'point' | 'line' | 'circle'
  emitterMode:   'continuous',
  count:         80,        // target live particle count

  // Movement
  speed:         3,
  spread:        45,        // degrees
  direction:     270,       // degrees (270 = upward in canvas coords)
  gravity:       0.15,

  // Appearance
  particleSize:  3,
  particleShape: 'square',  // 'square' | 'circle' | 'diamond' | 'cross'
  blendMode:     'source-over',

  // Lifetime
  lifetime:      60,        // frames
  fade:          1,         // 0=no fade, 1=full fade
  shrink:        0,         // 0=no shrink, 1=shrink to 0

  // Colour
  multiColor:    false,

  // Burst state
  burstPending:  false,
};

// ── Public API ─────────────────────────────────────────────────────────────

/** Update config from ui. Only provided keys are overwritten. */
function setEmitterConfig(partial) {
  Object.assign(cfg, partial);
}

/** Returns a snapshot of the current config (used by createParticle). */
function getEmitterConfig() {
  return cfg;
}

/** Reset — kill all particles. */
function resetParticles() {
  for (const p of particles) p.alive = false;
}

/** Count of live particles (for HUD display). */
function liveCount() {
  return particles.filter(p => p.alive).length;
}

/**
 * Advance the simulation by one frame.
 * Called by the main render loop.
 */
function tickEmitter() {
  // 1. Update existing particles
  for (const p of particles) {
    if (p.alive) updateParticle(p);
  }

  // 2. Spawn new particles up to target count
  const live = particles.filter(p => p.alive).length;
  let toSpawn = 0;

  if (cfg.emitterMode === 'continuous') {
    // Maintain a steady pool of `count` particles
    toSpawn = Math.max(0, cfg.count - live);
    // Throttle per-frame spawn to avoid big initial burst
    toSpawn = Math.min(toSpawn, Math.ceil(cfg.count / 30));
  } else if (cfg.emitterMode === 'burst') {
    // Spawn all at once when triggered
    if (cfg.burstPending) {
      toSpawn = cfg.count;
      cfg.burstPending = false;
    }
  } else if (cfg.emitterMode === 'trail') {
    // Always emit a small trickle
    toSpawn = Math.min(3, Math.max(0, cfg.count - live));
  }

  for (let i = 0; i < toSpawn; i++) {
    const [sx, sy] = spawnPoint();
    spawnParticle(sx, sy);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Choose a spawn coordinate based on emitter shape. */
function spawnPoint() {
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  switch (cfg.emitterShape) {
    case 'line': {
      // Horizontal line across 40% of canvas width
      const hw = canvasW * 0.2;
      return [cx - hw + Math.random() * hw * 2, cy];
    }
    case 'circle': {
      // Random point on the circumference of a circle
      const radius = Math.min(canvasW, canvasH) * 0.18;
      const a = Math.random() * Math.PI * 2;
      return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
    }
    default: // 'point'
      return [cx, cy];
  }
}

/** Create a new particle, reusing a dead slot if available. */
function spawnParticle(x, y) {
  const p = createParticle(x, y, cfg);

  // Try to find a dead slot to recycle
  for (let i = 0; i < particles.length; i++) {
    if (!particles[i].alive) {
      particles[i] = p;
      return;
    }
  }

  // No dead slot found — grow the array
  particles.push(p);
}
