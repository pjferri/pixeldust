/**
 * particle.js
 * Single particle data and per-frame update logic.
 *
 * v0.5: air drag, continuous fade
 * v0.6: wind force, hue variation
 * v0.9: speedVariance, velocityDecay, grow mode (negative shrink)
 */

// ── Colour helpers ─────────────────────────────────────────────────────────

/** Convert {r,g,b} (0-255) to [h(0-360), s(0-1), l(0-1)]. */
function _rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s, l];
}

/** Convert h(0-360), s(0-1), l(0-1) to {r,g,b} (0-255). */
function _hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const _hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(_hue(p, q, h + 1/3) * 255),
    g: Math.round(_hue(p, q, h      ) * 255),
    b: Math.round(_hue(p, q, h - 1/3) * 255),
  };
}

/** Apply a random hue offset (±hueJitter degrees) to an {r,g,b} colour. */
function _jitterHue(rgb, hueJitter) {
  if (!hueJitter) return rgb;
  const [h, s, l] = _rgbToHsl(rgb.r, rgb.g, rgb.b);
  const newH = (h + (Math.random() * 2 - 1) * hueJitter + 360) % 360;
  return _hslToRgb(newH, s, l);
}

// ── Particle factory ───────────────────────────────────────────────────────

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

  // Speed variance: 0 = consistent speed, 1 = ±50% range
  // Falls back to legacy 20% jitter when speedVariance is not set
  const sv = cfg.speedVariance ?? 0.2;
  const speedMult = 1 - sv * 0.5 + Math.random() * sv;
  const speed = cfg.speed * Math.max(0.01, speedMult);

  // speedScale (0–1): couples per-frame forces to the speed setting so that
  // gravity, wind, and turbulence all scale down with the speed slider.
  // At speed=0 the simulation is truly still; at speed=10 forces are full.
  const speedScale = cfg.speed / 10;

  // ── Start colour ─────────────────────────────────────────────────────────
  // Priority: multiColor (random palette) > gradient start > single colour.
  let startHex;
  if (cfg.multiColor) {
    startHex = randomPaletteColor();
  } else if (cfg.useGradient) {
    startHex = cfg.gradientStart || activeColor;
  } else {
    startHex = activeColor;
  }
  let startRgb = hexToRgb(startHex);

  // ── Hue variation (optional per-particle colour shift) ───────────────────
  const hueJitter = cfg.hueVariation || 0;
  if (hueJitter > 0) startRgb = _jitterHue(startRgb, hueJitter);

  // ── End colour (gradient target) ──────────────────────────────────────────
  const endRgb = cfg.useGradient
    ? hexToRgb(cfg.gradientEnd || '#000000')
    : startRgb;

  // ── Size ──────────────────────────────────────────────────────────────────
  const variance = cfg.sizeVariance || 0;
  const size = Math.max(1, Math.round(cfg.particleSize + (Math.random() * 2 - 1) * variance));

  return {
    x,
    y,
    vx:            Math.cos(angle) * speed,
    vy:            Math.sin(angle) * speed,
    life:          0,
    maxLife:       cfg.lifetime + Math.floor(Math.random() * cfg.lifetime * 0.2),
    size,
    baseSize:      size,
    r:  startRgb.r,
    g:  startRgb.g,
    b:  startRgb.b,
    er: endRgb.r,
    eg: endRgb.g,
    eb: endRgb.b,
    useGradient:   !!cfg.useGradient,
    alpha:         cfg.startAlpha ?? 1,
    startAlpha:    cfg.startAlpha ?? 1,
    angle:         Math.random() * Math.PI * 2,
    spin:          (Math.random() - 0.5) * 2 * ((cfg.rotation || 0) * Math.PI / 180),
    shape:         cfg.particleShape,
    fade:          cfg.fade,
    shrink:        cfg.shrink,
    gravity:       cfg.gravity,
    wind:          cfg.wind || 0,
    turbulence:    cfg.turbulence || 0,
    drag:          Math.max(0.5, Math.min(1, cfg.drag ?? 1)),
    bounce:        !!cfg.bounce,
    velocityDecay: cfg.velocityDecay || 0,
    speedScale,
    alive:         true,
    isDeathParticle: cfg._isDeathParticle || false,
  };
}

// ── Per-frame update ───────────────────────────────────────────────────────

/**
 * Advance a particle by one frame.
 * Mutates the particle in-place. Sets alive=false when lifetime expires.
 */
function updateParticle(p) {
  p.life++;

  if (p.life >= p.maxLife) {
    p.alive = false;
    return;
  }

  const t = p.life / p.maxLife;   // normalised age [0..1]

  // ── Gravity ───────────────────────────────────────────────────────────────
  p.vy += p.gravity * p.speedScale;

  // ── Wind (constant horizontal force) ─────────────────────────────────────
  if (p.wind !== 0) p.vx += p.wind * p.speedScale;

  // ── Air drag (velocity dampening) ────────────────────────────────────────
  if (p.drag < 1) {
    p.vx *= p.drag;
    p.vy *= p.drag;
  }

  // ── Velocity decay over lifetime (gradual deceleration) ──────────────────
  // Applies an exponential-like slowdown toward end of life.
  if (p.velocityDecay > 0) {
    const decayFactor = 1 - (p.velocityDecay / p.maxLife);
    p.vx *= decayFactor;
    p.vy *= decayFactor;
  }

  // ── Turbulence ────────────────────────────────────────────────────────────
  if (p.turbulence > 0) {
    p.vx += (Math.random() - 0.5) * p.turbulence * p.speedScale;
    p.vy += (Math.random() - 0.5) * p.turbulence * p.speedScale;
  }

  // ── Movement ──────────────────────────────────────────────────────────────
  p.x += p.vx;
  p.y += p.vy;

  // ── Bounce off walls ──────────────────────────────────────────────────────
  if (p.bounce) {
    const hs = Math.floor(p.size / 2);
    if (p.x - hs < 0)          { p.x = hs;          p.vx = Math.abs(p.vx); }
    if (p.x + hs > canvasW)    { p.x = canvasW - hs; p.vx = -Math.abs(p.vx); }
    if (p.y - hs < 0)          { p.y = hs;           p.vy = Math.abs(p.vy); }
    if (p.y + hs > canvasH)    { p.y = canvasH - hs; p.vy = -Math.abs(p.vy); }
  }

  // ── Rotation ──────────────────────────────────────────────────────────────
  if (p.spin !== 0) p.angle += p.spin;

  // ── Fade ──────────────────────────────────────────────────────────────────
  p.alpha = Math.max(0, p.startAlpha * (1 - t * p.fade));

  // ── Shrink / Grow (shrink > 0 = shrinks, shrink < 0 = grows) ─────────────
  if (p.shrink !== 0) {
    p.size = Math.max(1, Math.round(p.baseSize * (1 - t * p.shrink)));
  }
}
