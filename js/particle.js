/**
 * particle.js
 * Single particle data and per-frame update logic.
 *
 * Particles are plain objects (no class overhead) so we can pool them easily.
 * All rendering is handled by renderer.js — this file is pure logic.
 */

/**
 * Create a new particle from a config snapshot.
 *
 * @param {number} x  - spawn X in canvas coords
 * @param {number} y  - spawn Y in canvas coords
 * @param {object} cfg - emitter config snapshot (see emitter.js)
 * @returns {object}  particle state object
 */
function createParticle(x, y, cfg) {
  // Direction in radians — base direction ± half spread
  const halfSpread = (cfg.spread * Math.PI) / 360;           // spread is in degrees
  const baseAngle  = (cfg.direction * Math.PI) / 180;        // direction in degrees → radians
  const angle      = baseAngle - halfSpread + Math.random() * halfSpread * 2;

  // Speed with ±20% jitter for natural variation
  const speed = cfg.speed * (0.8 + Math.random() * 0.4);

  // Colour: either palette random or the single active colour
  const color = cfg.multiColor ? randomPaletteColor() : activeColor;
  const rgb   = hexToRgb(color);

  // Pixel size: snapped to integers for crisp pixel art
  const size  = Math.max(1, Math.round(cfg.particleSize));

  return {
    x,
    y,
    vx:       Math.cos(angle) * speed,
    vy:       Math.sin(angle) * speed,
    life:     0,                          // current age in frames
    maxLife:  cfg.lifetime + Math.floor(Math.random() * cfg.lifetime * 0.2),  // ±10% jitter
    size,
    baseSize: size,
    r:  rgb.r,
    g:  rgb.g,
    b:  rgb.b,
    alpha:    1,
    shape:    cfg.particleShape,
    fade:     cfg.fade,
    shrink:   cfg.shrink,
    gravity:  cfg.gravity,
    alive:    true,
  };
}

/**
 * Advance a particle by one frame.
 * Mutates the particle in-place. Sets alive=false when lifetime expires.
 *
 * @param {object} p - particle to update
 */
function updateParticle(p) {
  p.life++;

  // Kill particle when it has outlived its lifetime
  if (p.life >= p.maxLife) {
    p.alive = false;
    return;
  }

  const t = p.life / p.maxLife;  // normalised [0..1] age

  // Apply gravity to vertical velocity
  p.vy += p.gravity;

  // Move
  p.x += p.vx;
  p.y += p.vy;

  // Alpha fade (linear)
  p.alpha = p.fade ? Math.max(0, 1 - t) : 1;

  // Size shrink (linear, towards 0)
  if (p.shrink > 0) {
    p.size = Math.max(1, Math.round(p.baseSize * (1 - t * p.shrink)));
  }
}
