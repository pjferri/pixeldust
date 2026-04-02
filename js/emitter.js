/**
 * emitter.js
 * Manages the particle pool, spawn logic, and emitter position.
 *
 * v0.9:   death particles (sub-emitters), speedVariance, velocityDecay cfg defaults
 * v0.1.0: emitterSize (line width / circle radius %), emitterAngle (line rotation)
 * v0.1.5: disk, square, triangle, and arc emitter shapes
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
let emitterJustMoved = false;

/** Frames elapsed since the last loop-reset (used by the loop feature). */
let _loopTimer  = 0;
let _pulseTimer = 0;

/** Fractional spawn accumulator so sub-frame spawn rates work correctly. */
let _spawnAccum = 0;

/** Current emitter config. Updated by ui.js via setEmitterConfig(). */
let cfg = {
  // Emitter
  emitterShape:  'point',       // 'point' | 'line' | 'circle' | 'disk' | 'square' | 'triangle' | 'arc'
  emitterMode:   'continuous',  // 'continuous' | 'burst' | 'pulse'
  emitterSize:   18,            // % of canvas (shape half-width / radius)
  emitterAngle:  0,             // degrees — rotation of rotatable emitter shapes
  emitterArc:    120,           // degrees — span of the arc emitter
  count:         120,
  spawnRate:     60,            // particles per second (continuous/pulse modes)

  // Movement
  speed:         3,
  spread:        45,            // degrees
  direction:     270,           // degrees (270 = upward in canvas coords)
  gravity:       0.15,
  turbulence:    0,             // random velocity jitter per frame
  drag:          1,             // velocity multiplier per frame (1=no drag, 0.95=strong drag)
  wind:          0,             // constant horizontal force per frame (negative = left)
  orbit:         0,             // signed tangential force around each particle's spawn point
  bounce:        false,         // particles reverse velocity when hitting canvas edges
  hueVariation:  0,             // ±degrees of random hue shift per particle (0 = off)
  speedVariance: 0,             // 0 = consistent speed; 1 = ±50% range per particle
  velocityDecay: 0,             // 0 = no decay; 1 = velocity fades out over lifetime

  // Appearance
  particleSize:  3,
  particleShape: 'square',
  blendMode:     'normal',
  startAlpha:    1,             // starting opacity of each particle
  rotation:      0,             // max rotation speed in degrees/frame (0 = no spin)
  sizeVariance:  0,             // ±px random size offset per particle

  // Lifetime
  lifetime:      60,
  fade:          1,
  shrink:        0,

  // Death particles (sub-emitters spawned when a particle expires)
  deathCount:    0,             // mini-particles per death (0 = off)
  deathSpeed:    2,             // speed of death particles
  deathSize:     2,             // size of death particles

  // Colour
  multiColor:    true,

  // Gradient
  useGradient:   false,
  gradientStart: '#ffff00',
  gradientEnd:   '#ff0000',
  shadowColor:   '#120018',

  // Loop
  loop:          false,

  // Burst state (transient)
  burstPending:  false,
  pulseInterval: 2,            // seconds between auto-bursts in pulse mode

  // Export helpers
  bgColor:       '#0c0c0e',
  trailAlpha:    0.12,
  speedMult:     1,
  effectStrength: 1,
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
  _loopTimer  = 0;
  _pulseTimer = 0;
  _spawnAccum = 0;
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
  const nx = Math.round(x);
  const ny = Math.round(y);
  if (nx !== emitterX || ny !== emitterY) {
    emitterX = nx;
    emitterY = ny;
    emitterJustMoved = true;
    // Immediately clear the canvas so no ghost trail lingers at the old position.
    // clearCanvas() is defined in renderer.js (all files share the global scope).
    if (typeof clearCanvas === 'function') clearCanvas();
  }
}

function setEmitterDragging(isDragging) {
  emitterDragging = !!isDragging;
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

  // ── Update live particles + detect deaths ─────────────────────────────
  const deathSparks = cfg.deathCount > 0 ? [] : null;

  for (const p of particles) {
    if (p.alive) {
      updateParticle(p);
      // If particle just died and death sparks are enabled, record its position
      if (!p.alive && deathSparks && !p.isDeathParticle) {
        deathSparks.push({ x: p.x, y: p.y });
      }
    }
  }

  // ── Spawn death particles outside the update loop ─────────────────────
  // (avoids iterating over newly-added particles in the same frame)
  if (deathSparks) {
    for (const { x, y } of deathSparks) {
      const n = Math.min(cfg.deathCount, 8); // hard cap for safety
      for (let d = 0; d < n; d++) {
        _spawnDeathParticle(x, y);
      }
    }
  }

  // ── Spawn new particles ───────────────────────────────────────────────
  const live = liveCount();
  let toSpawn = 0;

  if (cfg.emitterMode === 'continuous') {
    // Accumulate fractional particles per frame so any spawn rate works correctly,
    // including rates well below 60 p/s (e.g. 5 p/s = one particle every 12 frames).
    if (live < cfg.count) {
      _spawnAccum += (cfg.spawnRate || 60) / 60;
      toSpawn = Math.min(cfg.count - live, Math.floor(_spawnAccum));
      _spawnAccum -= toSpawn;
    } else {
      _spawnAccum = 0; // drain accumulator when at capacity so it doesn't overflow
    }
  } else if (cfg.emitterMode === 'burst') {
    if (cfg.burstPending) {
      toSpawn = cfg.count;
      cfg.burstPending = false;
    }
  } else if (cfg.emitterMode === 'pulse') {
    // Auto-fire a full burst every pulseInterval seconds
    _pulseTimer++;
    const pulseFrames = Math.max(10, Math.round((cfg.pulseInterval || 2) * 60));
    if (_pulseTimer >= pulseFrames) {
      _pulseTimer = 0;
      toSpawn = cfg.count;
    }
  }

  for (let i = 0; i < toSpawn; i++) {
    const [sx, sy] = spawnPoint();
    spawnParticle(sx, sy);
  }

  // ── Loop auto-reset ───────────────────────────────────────────────────
  if (cfg.loop) {
    _loopTimer++;
    const interval = Math.ceil(cfg.lifetime * 1.5) + 20;
    if (_loopTimer >= interval) {
      _loopTimer = 0;
  _pulseTimer = 0;
      resetParticles();
      clearCanvas();
      if (cfg.emitterMode === 'burst') cfg.burstPending = true;
      if (cfg.emitterMode === 'pulse') _pulseTimer = 0;
    }
  }

  emitterJustMoved = false;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pick a spawn coordinate relative to the current emitter origin.
 * emitterSize is a percentage of canvas width/height (1–50).
 * emitterAngle rotates rotatable shapes (0 = right-facing / unrotated).
 */
function emitterRotateOffset(dx, dy, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    dx * cos - dy * sin,
    dx * sin + dy * cos,
  ];
}

function emitterTriangleOffset(radius, angle) {
  const top = { x: 0, y: -radius };
  const right = { x: Math.sin(Math.PI / 3) * radius, y: radius * 0.5 };
  const left = { x: -right.x, y: right.y };
  const r1 = Math.sqrt(Math.random());
  const r2 = Math.random();
  const u = 1 - r1;
  const v = r1 * (1 - r2);
  const w = r1 * r2;
  const dx = u * top.x + v * right.x + w * left.x;
  const dy = u * top.y + v * right.y + w * left.y;
  return emitterRotateOffset(dx, dy, angle);
}

function spawnPoint() {
  const cx = emitterX >= 0 ? emitterX : canvasW / 2;
  const cy = emitterY >= 0 ? emitterY : canvasH / 2;
  const size = Math.max(1, cfg.emitterSize || 18);
  const radialSize = Math.min(canvasW, canvasH) * (size / 100);

  switch (cfg.emitterShape) {
    case 'line': {
      const hw    = canvasW * (size / 100);
      const angle = ((cfg.emitterAngle || 0) * Math.PI) / 180;
      const t     = (Math.random() * 2 - 1) * hw;
      return [
        cx + t * Math.cos(angle),
        cy + t * Math.sin(angle),
      ];
    }
    case 'circle': {
      const radius = radialSize;
      const a = Math.random() * Math.PI * 2;
      return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
    }
    case 'disk': {
      const radius = radialSize * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
    }
    case 'square': {
      const half = radialSize;
      const angle = ((cfg.emitterAngle || 0) * Math.PI) / 180;
      const dx = (Math.random() * 2 - 1) * half;
      const dy = (Math.random() * 2 - 1) * half;
      const [rx, ry] = emitterRotateOffset(dx, dy, angle);
      return [cx + rx, cy + ry];
    }
    case 'triangle': {
      const angle = ((cfg.emitterAngle || 0) * Math.PI) / 180;
      const [dx, dy] = emitterTriangleOffset(radialSize, angle);
      return [cx + dx, cy + dy];
    }
    case 'arc': {
      const radius = radialSize;
      const centerAngle = ((cfg.emitterAngle || 0) * Math.PI) / 180;
      const halfSpan = (((cfg.emitterArc || 120) / 2) * Math.PI) / 180;
      const a = centerAngle + (Math.random() * 2 - 1) * halfSpan;
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

/**
 * Spawn a death particle at (x, y) — a mini-particle emitted when
 * a normal particle expires. Death particles do NOT trigger further deaths
 * (no cascade), are short-lived, and fly in random directions.
 */
function _spawnDeathParticle(x, y) {
  const angle = Math.random() * Math.PI * 2;
  const spd   = cfg.deathSpeed * (0.6 + Math.random() * 0.8);

  const miniCfg = {
    ...cfg,
    speed:         spd,
    speedVariance: 0,
    spread:        360,
    direction:     0,
    particleSize:  Math.max(1, cfg.deathSize),
    sizeVariance:  0,
    lifetime:      20 + Math.floor(Math.random() * 12),
    fade:          1,
    shrink:        0.6,
    turbulence:    0,
    drag:          0.9,
    bounce:        false,
    velocityDecay: 0,
    deathCount:    0,       // prevent cascade
    _isDeathParticle: true,
  };

  const p  = createParticle(x, y, miniCfg);
  // Override velocity with true random direction
  p.vx = Math.cos(angle) * spd;
  p.vy = Math.sin(angle) * spd;

  for (let i = 0; i < particles.length; i++) {
    if (!particles[i].alive) { particles[i] = p; return; }
  }
  particles.push(p);
}
