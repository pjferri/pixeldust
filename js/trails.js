/**
 * trails.js
 * Unified trail system shared by the live renderer (renderer.js) and the
 * offline export simulator (exporter.js).
 *
 * Design: Unity-TrailRenderer-style point history. Every simulation tick
 * records the position/size/color of each alive particle; every drawn frame
 * renders that history with a deterministic age-based fade
 * (alpha = 1 - age/length). Because fading is computed per point instead of
 * by repeatedly darkening a canvas, there is no 8-bit alpha rounding and
 * therefore no lingering "ghost" residue — points older than the trail
 * length simply stop being drawn.
 *
 * Permanent trails (length = ∞) draw onto a dedicated stamp canvas that is
 * never faded, which is also residue-free by construction.
 *
 * Also owns the optional custom particle image (sprite) used for both
 * particles and their trails, with a tint cache for palette colors.
 */

// ── Compact point storage ──────────────────────────────────────────────────
const TRAIL_SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star',
                      'sparkle', 'cross', 'heart', 'ring', 'image'];
const TRAIL_SHAPE_IDX = {};
TRAIL_SHAPES.forEach((s, i) => { TRAIL_SHAPE_IDX[s] = i; });
const TRAIL_PT_STRIDE = 8;   // x, y, size, r, g, b, alpha, shapeIdx

// Performance budgets for the point history
const TRAIL_MAX_POINTS        = 45000;  // hard cap on stored points
const TRAIL_INTERVAL_2_AT     = 12000;  // record every 2nd tick above this
const TRAIL_INTERVAL_3_AT     = 24000;  // record every 3rd tick above this
const TRAIL_PERMANENT_HISTORY = 90;     // snapshots kept while permanent
const TRAIL_DRAW_BUDGET       = 18000;  // max stamps drawn per frame

// ── Custom particle image (shared app-wide) ───────────────────────────────

let _particleSprite     = null;   // downscaled canvas of the uploaded image
let _particleSpriteData = null;   // dataURL for save/load round-trips
let _imageTint          = true;   // multiply sprite by particle color
const _tintCache        = new Map();

function hasParticleImage()     { return !!_particleSprite; }
function getParticleImageData() { return _particleSpriteData; }
function setImageTint(on)       { _imageTint = !!on; }

function clearParticleImage() {
  _particleSprite = null;
  _particleSpriteData = null;
  _tintCache.clear();
}

/**
 * Load a custom particle image from a dataURL. The image is downscaled to
 * at most 128px on its longest side (pixel-art sprites are typically far
 * smaller) and re-encoded so saved configs stay reasonably small.
 */
function loadParticleImage(dataUrl, onReady) {
  const img = new Image();
  img.onload = () => {
    const maxDim = Math.max(img.width, img.height) || 1;
    const scale  = Math.min(1, 128 / maxDim);
    const c = document.createElement('canvas');
    c.width  = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.drawImage(img, 0, 0, c.width, c.height);
    _particleSprite = c;
    _particleSpriteData = scale < 1 ? c.toDataURL('image/png') : dataUrl;
    _tintCache.clear();
    if (onReady) onReady(true);
  };
  img.onerror = () => { if (onReady) onReady(false); };
  img.src = dataUrl;
}

/** Sprite tinted by (r,g,b) via multiply — cached per quantized color. */
function _tintedSprite(r, g, b) {
  if (!_imageTint) return _particleSprite;
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  let c = _tintCache.get(key);
  if (c) return c;
  if (_tintCache.size >= 128) _tintCache.clear();
  const src = _particleSprite;
  c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const cx = c.getContext('2d');
  cx.drawImage(src, 0, 0);
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = `rgb(${r},${g},${b})`;
  cx.fillRect(0, 0, c.width, c.height);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(src, 0, 0);
  _tintCache.set(key, c);
  return c;
}

/**
 * Draw the custom image centered at (x, y). The particle size slider maps
 * to sprite size at 4px per unit (size 3 → 12px sprite), aspect preserved.
 * Falls back to a square when no image is loaded.
 */
function drawImageParticle(ctx, x, y, size, r, g, b) {
  if (!_particleSprite) {
    ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
    return;
  }
  const spr    = _tintedSprite(r, g, b);
  const target = Math.max(2, size * 4);
  const scale  = target / Math.max(spr.width, spr.height);
  const w = Math.max(1, Math.round(spr.width * scale));
  const h = Math.max(1, Math.round(spr.height * scale));
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spr, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  ctx.imageSmoothingEnabled = prevSmooth;
}

// ── Legacy config mapping ──────────────────────────────────────────────────

/**
 * Trail length in seconds from any config, old or new.
 * Returns -1 for permanent (∞), 0 for none.
 * Legacy persistence (0-100) maps through the old curve so existing
 * presets/saves keep roughly the same look.
 */
function resolveTrailSec(c) {
  if (typeof c.trailSec === 'number') return c.trailSec;
  if (typeof c.trailPersistence === 'number') return _persistenceToSec(c.trailPersistence);
  if (typeof c.trailAlpha === 'number') return _persistenceToSec(Math.round(c.trailAlpha * 100));
  return 0.75;
}

function _persistenceToSec(p) {
  if (p >= 100) return -1;
  if (p <= 0)   return 0;
  return (3 + Math.pow(p / 100, 2.2) * 360) / 60;
}

/** Normalized trail settings from a config (legacy keys map across). */
function resolveTrailConfig(c) {
  const sec = resolveTrailSec(c);
  const enabled = c.trailEnabled !== undefined ? !!c.trailEnabled : sec !== 0;
  const lengthFrames = sec < 0 ? Infinity : Math.round(sec * 60);
  const rawOp = c.trailOpacity !== undefined ? c.trailOpacity : 100;
  return {
    enabled,
    lengthFrames,
    opacity: Math.max(0, Math.min(1, rawOp / 100)),
    softness: typeof c.trailSoftness === 'number' ? c.trailSoftness : 0,
  };
}

/** Whole-effect Soften amount (0-100). Trail-only blur lives in trailSoftness. */
function resolveSoftness(c) {
  return typeof c.softness === 'number' ? c.softness : 0;
}

// ── Trail stamp drawing (simplified shapes, source-over only) ─────────────

function drawTrailStamp(ctx, shapeIdx, x, y, size, r, g, b) {
  switch (shapeIdx) {
    case 0: { // circle
      if (size <= 4) {
        const rad = Math.floor(size / 2);
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++)
            if (dx * dx + dy * dy <= rad * rad + rad * 0.5) ctx.fillRect(x + dx, y + dy, 1, 1);
      } else {
        ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, size / 2, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 2: { // triangle
      const h = Math.ceil(size / 2);
      ctx.beginPath();
      ctx.moveTo(x, y - h); ctx.lineTo(x + h, y + h); ctx.lineTo(x - h, y + h);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 3: { // diamond
      const h = Math.ceil(size / 2);
      ctx.beginPath();
      ctx.moveTo(x, y - h); ctx.lineTo(x + h, y); ctx.lineTo(x, y + h); ctx.lineTo(x - h, y);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 4: { // star
      const outerR = size / 2, innerR = outerR * 0.42;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const rad = i % 2 === 0 ? outerR : innerR;
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      break;
    }
    case 5: { // sparkle
      const long = size / 2, short = Math.max(1, Math.round(size / 5));
      ctx.beginPath();
      ctx.moveTo(x, y - long); ctx.lineTo(x + short, y - short);
      ctx.lineTo(x + long, y); ctx.lineTo(x + short, y + short);
      ctx.lineTo(x, y + long); ctx.lineTo(x - short, y + short);
      ctx.lineTo(x - long, y); ctx.lineTo(x - short, y - short);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 6: { // cross
      const t = Math.max(1, Math.floor(size / 3));
      ctx.fillRect(x - Math.floor(size / 2), y - t, size, t * 2);
      ctx.fillRect(x - t, y - Math.floor(size / 2), t * 2, size);
      break;
    }
    case 7: { // heart
      if (size <= 2) { ctx.fillRect(x, y, 1, 1); break; }
      const half = size / 2;
      ctx.beginPath();
      ctx.moveTo(x, y + half * 0.95);
      ctx.bezierCurveTo(x + half * 1.25, y + half * 0.25, x + half * 1.15, y - half * 0.75, x, y - half * 0.1);
      ctx.bezierCurveTo(x - half * 1.15, y - half * 0.75, x - half * 1.25, y + half * 0.25, x, y + half * 0.95);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 8: { // ring
      const rad = size / 2;
      if (rad < 2.5) { ctx.fillRect(x, y, 1, 1); break; }
      const innerR = Math.max(0.5, rad * 0.45);
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.5, rad, 0, Math.PI * 2, false);
      ctx.arc(x + 0.5, y + 0.5, innerR, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      break;
    }
    case 9: // image
      drawImageParticle(ctx, x, y, size, r, g, b);
      break;
    default: // square
      ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
  }
}

// ── Trail system factory ───────────────────────────────────────────────────

/**
 * Creates an independent trail system. The live renderer owns one; each
 * export simulation creates its own so exports never share live state.
 *
 * Usage:
 *   const trails = createTrailSystem();
 *   trails.configure({ enabled, lengthFrames, opacity });  // opacity 0-1
 *   trails.record(particles, w, h);   // once per simulation tick
 *   trails.draw(ctx, w, h);           // once per drawn frame
 *   trails.reset();                   // on canvas clear / sim reset
 */
function createTrailSystem() {
  let snapshots = [];        // { tick, pts: Float32Array, count }
  let tick = 0;
  let totalPts = 0;
  let recordInterval = 1;
  let stampCanvas = null;    // permanent (∞) mode accumulator
  let stampCtx = null;
  let layerCanvas = null;    // per-frame trail layer (composited with opacity)
  let layerCtx = null;

  const cfg = { enabled: true, lengthFrames: 45, opacity: 1, softness: 0, permanent: false };

  function configure(c) {
    const wasPermanent = cfg.permanent;
    if (c.enabled !== undefined) cfg.enabled = !!c.enabled;
    if (c.lengthFrames !== undefined) {
      cfg.permanent = !Number.isFinite(c.lengthFrames);
      cfg.lengthFrames = cfg.permanent ? Infinity : Math.max(0, c.lengthFrames);
    }
    if (c.opacity !== undefined) cfg.opacity = Math.max(0, Math.min(1, c.opacity));
    if (c.softness !== undefined) cfg.softness = Math.max(0, Math.min(100, c.softness));
    // Leaving permanent mode: drop the stamp accumulator; the point history
    // takes over and old permanent marks fade out of existence cleanly.
    if (wasPermanent && !cfg.permanent && stampCtx) {
      stampCtx.clearRect(0, 0, stampCanvas.width, stampCanvas.height);
    }
    if (!cfg.enabled) reset();
  }

  function reset() {
    snapshots = [];
    totalPts = 0;
    tick = 0;
    recordInterval = 1;
    if (stampCtx) stampCtx.clearRect(0, 0, stampCanvas.width, stampCanvas.height);
    if (layerCtx) layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
  }

  function _ensureStamp(w, h) {
    if (stampCanvas && stampCanvas.width === w && stampCanvas.height === h) return;
    stampCanvas = document.createElement('canvas');
    stampCanvas.width = w;
    stampCanvas.height = h;
    stampCtx = stampCanvas.getContext('2d');
    stampCtx.imageSmoothingEnabled = false;
  }

  function _ensureLayer(w, h) {
    if (layerCanvas && layerCanvas.width === w && layerCanvas.height === h) return;
    layerCanvas = document.createElement('canvas');
    layerCanvas.width = w;
    layerCanvas.height = h;
    layerCtx = layerCanvas.getContext('2d');
    layerCtx.imageSmoothingEnabled = false;
  }

  function _isActive() {
    return cfg.enabled && cfg.opacity > 0 && (cfg.permanent || cfg.lengthFrames > 0);
  }

  /** Record one simulation tick worth of particle positions. */
  function record(particles, w, h) {
    if (!_isActive()) return;
    tick++;

    // Expire old snapshots (finite mode)
    if (!cfg.permanent) {
      const cutoff = tick - cfg.lengthFrames;
      while (snapshots.length && snapshots[0].tick < cutoff) {
        totalPts -= snapshots.shift().count;
      }
    }

    if (tick % recordInterval !== 0) return;

    let alive = 0;
    for (let i = 0; i < particles.length; i++) if (particles[i].alive) alive++;
    if (alive > 0) {
      const pts = new Float32Array(alive * TRAIL_PT_STRIDE);
      let idx = 0;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p.alive) continue;
        const col = resolveParticleColor(p);
        const off = idx * TRAIL_PT_STRIDE;
        pts[off]     = p.x;
        pts[off + 1] = p.y;
        pts[off + 2] = p.size;
        pts[off + 3] = col.r;
        pts[off + 4] = col.g;
        pts[off + 5] = col.b;
        pts[off + 6] = Math.max(0, Math.min(1, p.alpha));
        pts[off + 7] = TRAIL_SHAPE_IDX[p.shape] !== undefined ? TRAIL_SHAPE_IDX[p.shape] : 1;
        idx++;
      }
      const snap = { tick, pts, count: alive };
      snapshots.push(snap);
      totalPts += alive;

      // Permanent mode: stamp immediately at full point alpha; the canvas
      // is never faded so no rounding residue can accumulate.
      if (cfg.permanent && w && h) {
        _ensureStamp(w, h);
        _drawSnapshot(stampCtx, snap, 1);
      }
    }

    // Budgets: permanent mode needs only a short history (the stamp canvas
    // holds the permanence); finite mode subsamples under heavy load.
    const maxSnaps = cfg.permanent ? TRAIL_PERMANENT_HISTORY : Infinity;
    while (snapshots.length > maxSnaps) totalPts -= snapshots.shift().count;
    while (totalPts > TRAIL_MAX_POINTS) totalPts -= snapshots.shift().count;
    recordInterval = totalPts > TRAIL_INTERVAL_3_AT ? 3
                   : totalPts > TRAIL_INTERVAL_2_AT ? 2 : 1;
  }

  function _drawSnapshot(ctx, snap, alphaScale) {
    const pts = snap.pts;
    for (let i = 0; i < snap.count; i++) {
      const off = i * TRAIL_PT_STRIDE;
      const a = pts[off + 6] * alphaScale;
      if (a <= 0.01) continue;
      const size = Math.max(1, Math.round(pts[off + 2]));
      const r = pts[off + 3], g = pts[off + 4], b = pts[off + 5];
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      drawTrailStamp(ctx, pts[off + 7], Math.round(pts[off]), Math.round(pts[off + 1]), size, r, g, b);
    }
  }

  /**
   * Draw the trail history onto a target context.
   *
   * Points are first flattened onto an internal trail layer, which is then
   * composited once with the trail opacity (and optional trail softness
   * blur). This matches the classic renderer's semantics: overlapping trail
   * stamps can never exceed the opacity ceiling, keeping dense trails
   * crisp instead of stacking up to full brightness and muddying.
   *
   * Fading is exponential (exp(-5.5·age/len) ≈ the old destination-out
   * decay to 1/255 over the trail lifetime): bright heads, fast-dying
   * tails.
   */
  function draw(ctx, w, h) {
    if (!_isActive()) return;

    let source;
    if (cfg.permanent) {
      if (!stampCanvas) return;
      source = stampCanvas;
    } else {
      if (!snapshots.length) return;
      _ensureLayer(w, h);
      layerCtx.clearRect(0, 0, w, h);
      layerCtx.globalCompositeOperation = 'source-over';

      const len = cfg.lengthFrames;

      // Draw budget: cap per-frame stamp count, dropping the oldest
      // (dimmest) snapshots first when over budget.
      let start = snapshots.length - 1;
      let budget = TRAIL_DRAW_BUDGET;
      while (start > 0 && budget - snapshots[start].count > 0) {
        budget -= snapshots[start].count;
        start--;
      }

      for (let si = start; si < snapshots.length; si++) {
        const snap = snapshots[si];
        const age = tick - snap.tick;
        if (age >= len) continue;
        const ageFrac = Math.exp(-5.5 * age / len);
        if (ageFrac <= 0.008) continue;
        _drawSnapshot(layerCtx, snap, ageFrac);
      }
      source = layerCanvas;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = cfg.opacity;
    if (cfg.softness > 0) {
      ctx.filter = `blur(${((cfg.softness / 100) * 3).toFixed(1)}px)`;
    }
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  }

  return { configure, record, draw, reset };
}
