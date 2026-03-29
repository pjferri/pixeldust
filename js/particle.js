/**
 * particle.js
 * Single particle data and per-frame update logic.
 *
 * New in v0.2:
 *   - Lifetime colour gradient  (sr/sg/sb → er/eg/eb lerp)
 *   - Turbulence jitter         (per-frame random velocity noise)
 */

/**
 * Create a new particle from a config snapshot.
 *
 * @param {number} x   - spawn X in canvas coords
 * @param {number} y   - spawn Y in canvas coords
 * @param {object} cfg - emitter config snapshot (see emitter.js)
 * @returns {object}   particle state object
 */
function createParticle(x, y, cfg) {
  // ── Velocity ──────────────────────────────────────────────────────────────
  const halfSpread = (cfg.spread * Math.PI) / 360;
  const baseAngle  = (cfg.direction * Math.PI) / 180;
  const angle      = baseAngle - halfSpread + Math.random() * halfSpread * 2;
  const speed      = cfg.speed * (0.8 + Math.random() * 0.4);

  // ── Start colour ─────────────────────────────────────────────────────────
  // Priority: multiColor (random palette) > gradient start > single colour.
  let startHex;
  if (cfg.multiColor) {
    startHex = randomPaletteColor();           // random from active palette
  } else if (cfg.useGradient) {
    startHex = cfg.gradientStart || activeColor;
  } else {
    startHex = activeColor;
  }
  const startRgb = hexToRgb(startHex);

  // ── End colour (gradient target) ──────────────────────────────────────────
  // When multiColor + gradient both on, each particle starts at a random
  // palette colour and fades toward the shared gradient end colour.
  const endRgb = cfg.useGradient
    ? hexToRgb(cfg.gradientEnd || '#000000')
    : startRgb;   // no gradient → end = start → no colour change

  // ── Size ──────────────────────────────────────────────────────────────────
  const size = Math.max(1, Math.round(cfg.particleSize));

  return {
    x,
    y,
    vx:       Math.cos(angle) * speed,
    vy:       Math.sin(angle) * speed,
    life:     0,
    maxLife:  cfg.lifetime + Math.floor(Math.random() * cfg.lifetime * 0.2),
    size,
    baseSize: size,
    // Start colour
    r:  startRgb.r,
    g:  startRgb.g,
    b:  startRgb.b,
    // End colour (used by renderer when useGradient is true)
    er: endRgb.r,
    eg: endRgb.g,
    eb: endRgb.b,
    useGradient: !!cfg.useGradient,
    alpha:       1,
    shape:       cfg.particleShape,
    fade:        cfg.fade,
    shrink:      cfg.shrink,
    gravity:     cfg.gravity,
    turbulence:  cfg.turbulence || 0,
    alive:       true,
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

  if (p.life >= p.maxLife) {
    p.alive = false;
    return;
  }

  const t = p.life / p.maxLife;   // normalised age [0..1]

  // ── Gravity ───────────────────────────────────────────────────────────────
  p.vy += p.gravity;

  // ── Turbulence (per-frame random velocity jitter) ─────────────────────────
  // Adds organic noise so particles don't all follow the same path.
  if (p.turbulence > 0) {
    p.vx += (Math.random() - 0.5) * p.turbulence;
    p.vy += (Math.random() - 0.5) * p.turbulence;
  }

  // ── Movement ──────────────────────────────────────────────────────────────
  p.x += p.vx;
  p.y += p.vy;

  // ── Fade ──────────────────────────────────────────────────────────────────
  p.alpha = p.fade ? Math.max(0, 1 - t) : 1;

  // ── Shrink ────────────────────────────────────────────────────────────────
  if (p.shrink > 0) {
    p.size = Math.max(1, Math.round(p.baseSize * (1 - t * p.shrink)));
  }
}
