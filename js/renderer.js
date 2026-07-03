/**
 * renderer.js
 * Canvas drawing, emitter crosshair, and canvas drag interaction.
 *
 * v0.3.0: Unity-style trail system — point-based snapshots with age-based
 *         fading.  Each frame records particle positions; trail points fade
 *         linearly over a configurable lifetime.  No destination-out
 *         compositing = no 8-bit alpha quantisation ghosts.
 */

let canvas, ctx;

// ── Trail system — offscreen buffer ────────────────────────────────────────
let _trailCanvas = null;
let _trailCtx    = null;

let bgColor = '#0c0c0e';
let trailAlpha = 0.12;       // kept for backward-compat mapping
let blendMode = 'normal';
let effectStrength = 1;
let shadowColor = '#120018';

// Trail state
let _trailEnabled     = true;
let _trailPersistence = 50;   // 0-100: maps to trail lifetime
let _trailOpacity     = 100;  // 0-100: overall trail layer alpha
let _trailSoftness    = 0;    // 0-100: blur applied to trail layer
let _trailSweepCounter = 0;

// ── Hybrid trail system: snapshot tracking + incremental canvas ───────────
// We store snapshots for lifetime tracking, but render incrementally:
// - New particles are drawn onto a persistent trail canvas each frame
// - Fading is done via destination-out (like before) but with a guaranteed
//   alpha floor sweep to kill ghosts
// - Snapshot metadata tracks what was drawn when, so we can compute
//   the correct fade rate from the lifetime
// This gives O(aliveParticles) draw cost per frame instead of O(allTrailPoints). ─────────────────────────────────────────────
// Each snapshot is a Float32Array: [x, y, size, r, g, b, alpha, shape, ...]
// 8 fields per particle (TRAIL_STRIDE).  Snapshots are stored with their
// birth frame number so we can compute age-based fade.
const TRAIL_STRIDE = 8;
const MAX_TRAIL_SNAPSHOTS = 800; // hard cap to bound memory
let _trailSnapshots = [];  // { frame: number, pts: Float32Array, count: number }
let _trailFrame     = 0;
let _trailRecordInterval = 1; // record every Nth frame (dynamic for perf)

// Shape index for compact storage
const _SHAPE_IDX = { circle: 0, square: 1, triangle: 2, diamond: 3,
                     star: 4, sparkle: 5, cross: 6, heart: 7, ring: 8 };
const _IDX_SHAPE = ['circle','square','triangle','diamond',
                    'star','sparkle','cross','heart','ring'];

function normalizeEffectMode(mode) {
  switch (mode) {
    case 'source-over': return 'normal';
    case 'lighter':     return 'glow';
    case 'multiply':    return 'shadow';
    case 'screen':      return 'glow';
    case 'normal':
    case 'glow':
    case 'prism':
    case 'shadow':
      return mode;
    case 'neon':
    case 'soft':
      return 'glow';
    default:
      return 'normal';
  }
}

function _ensureTrailCanvas() {
  if (_trailCanvas && _trailCanvas.width === canvas.width && _trailCanvas.height === canvas.height) return;
  _trailCanvas = document.createElement('canvas');
  _trailCanvas.width = canvas.width;
  _trailCanvas.height = canvas.height;
  _trailCtx = _trailCanvas.getContext('2d');
  _trailCtx.imageSmoothingEnabled = false;
}

function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  sizeCanvas();
  setupEmitterInteraction();
}

function sizeCanvas() {
  const area = canvas.closest('#canvas-area') || canvas.parentElement.parentElement;
  const pad = 56;
  const size = Math.max(256, Math.min(
    area.clientWidth - pad,
    area.clientHeight - pad,
    720
  ));
  canvas.width = size;
  canvas.height = size;
  canvasW = size;
  canvasH = size;
  ctx.imageSmoothingEnabled = false;
  // Reset trail canvas on resize
  _trailCanvas = null;
  _trailCtx = null;
  centerEmitter();
}

function _renderFrameSnapshotLegacy() {
  const w = canvas.width;
  const h = canvas.height;
  const { r, g, b } = hexToRgb(bgColor);

  // ── 1. Clear main canvas to background ────────────────────────────────
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, w, h);

  if (_trailEnabled && _trailPersistence > 0 && _trailOpacity > 0) {
    _ensureTrailCanvas();
    _trailFrame++;

    // ── 2. Record current particles as a trail snapshot ───────────────
    if (_trailFrame % _trailRecordInterval === 0) {
      _recordTrailSnapshot(particles);
    }

    // ── 3. Expire old snapshots ───────────────────────────────────────
    const lifetime = _persistenceToLifetimeFrames(_trailPersistence);
    if (lifetime !== Infinity) {
      const cutoff = _trailFrame - lifetime;
      // Remove from front (oldest first)
      while (_trailSnapshots.length > 0 && _trailSnapshots[0].frame < cutoff) {
        _trailSnapshots.shift();
      }
    }
    // Hard cap
    while (_trailSnapshots.length > MAX_TRAIL_SNAPSHOTS) {
      _trailSnapshots.shift();
    }

    // ── 4. Clear trail canvas and redraw all trail points ─────────────
    _trailCtx.clearRect(0, 0, w, h);
    _trailCtx.globalCompositeOperation = 'source-over';

    const snapCount = _trailSnapshots.length;
    for (let si = 0; si < snapCount; si++) {
      const snap = _trailSnapshots[si];
      const age = _trailFrame - snap.frame;
      // Age-based fade: 1.0 at birth → 0.0 at lifetime
      // For permanent trails (lifetime=Inf), ageFrac stays 1.0
      const ageFrac = lifetime === Infinity ? 1.0 : Math.max(0, 1 - age / lifetime);
      if (ageFrac <= 0) continue;

      const pts = snap.pts;
      const count = snap.count;
      for (let i = 0; i < count; i++) {
        const off = i * TRAIL_STRIDE;
        const px    = pts[off];
        const py    = pts[off + 1];
        const psize = pts[off + 2];
        const pr    = pts[off + 3];
        const pg    = pts[off + 4];
        const pb    = pts[off + 5];
        const pa    = pts[off + 6];
        const pshape = _IDX_SHAPE[pts[off + 7]] || 'square';

        const finalAlpha = pa * ageFrac;
        if (finalAlpha <= 0.005 || psize < 0.5) continue;

        _trailCtx.globalAlpha = Math.min(1, finalAlpha);
        _trailCtx.fillStyle = `rgb(${pr},${pg},${pb})`;
        _drawTrailShape(_trailCtx, pshape, Math.round(px), Math.round(py), Math.max(1, Math.round(psize)));
      }
    }

    // ── 5. Apply softness (blur) to trail canvas if enabled ───────────
    if (_trailSoftness > 0 && (_softFrameCount = ((_softFrameCount || 0) + 1) % 3) === 0) {
      const blurPx = (_trailSoftness / 100) * 3;
      _trailCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
      _trailCtx.globalCompositeOperation = 'copy';
      _trailCtx.globalAlpha = 1;
      _trailCtx.drawImage(_trailCanvas, 0, 0);
      _trailCtx.filter = 'none';
      _trailCtx.globalCompositeOperation = 'source-over';
    }

    // ── 6. Composite trail canvas onto main canvas ────────────────────
    ctx.globalAlpha = Math.max(0, Math.min(1, _trailOpacity / 100));
    ctx.drawImage(_trailCanvas, 0, 0);
    ctx.globalAlpha = 1;

    // ── 7. Draw current particles crisply on top ──────────────────────
    for (const p of particles) {
      if (p.alive) drawParticle(ctx, p);
    }

    // ── 8. Adaptive record interval for performance ───────────────────
    // If we have tons of snapshots, subsample to keep draw count manageable
    const totalPoints = _trailSnapshots.reduce((s, sn) => s + sn.count, 0);
    _trailRecordInterval = totalPoints > 40000 ? 3 : totalPoints > 20000 ? 2 : 1;

  } else {
    // Trails off or opacity 0 — wipe accumulated data
    if (_trailSnapshots.length > 0) _trailSnapshots = [];
    if (_trailCanvas) clearTrailCanvas();
    for (const p of particles) {
      if (p.alive) drawParticle(ctx, p);
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (document.getElementById('show-crosshair')?.checked) drawEmitterCrosshair();
  if (document.getElementById('show-frame-guide')?.checked) drawFrameGuide();
  drawForceWellIndicators();
}

/**
 * Draw small visual indicators for placed gravity wells.
 * Attractors show as cyan rings, repellers as red rings.
 */
function drawForceWellIndicators() {
  const wells = typeof getForceWells === 'function' ? getForceWells() : [];
  if (wells.length === 0) return;

  ctx.save();
  ctx.lineWidth = 1;

  for (const w of wells) {
    const isAttract = w.strength > 0;
    const color = isAttract ? 'rgba(0,220,255,0.6)' : 'rgba(255,80,80,0.6)';
    const colorFaint = isAttract ? 'rgba(0,220,255,0.12)' : 'rgba(255,80,80,0.12)';

    // Radius ring (faint)
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = colorFaint;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(w.x, w.y, 4, 0, Math.PI * 2);
    ctx.stroke();

    // +/- indicator
    ctx.fillStyle = color;
    ctx.fillRect(w.x - 3, w.y - 0.5, 6, 1);
    if (isAttract) {
      ctx.fillRect(w.x - 0.5, w.y - 3, 1, 6);
    }
  }
  ctx.restore();
}

// ── Unity-style trail helper functions ─────────────────────────────────────

/**
 * Maps persistence (0–100) to trail lifetime in frames.
 * Modelled after Unity's TrailRenderer.time — the slider controls how many
 * seconds (frames) of history are kept.
 *
 * At ~15 fps (typical for this app):
 *   0   → 0 frames     (no trail)
 *   10  → ~5 frames    (flash, ~0.3s)
 *   30  → ~12 frames   (~0.8s)
 *   50  → ~40 frames   (~2.7s)
 *   70  → ~100 frames  (~6.7s)
 *   85  → ~190 frames  (~12.7s)
 *   95  → ~310 frames  (~20.7s)
 *   100 → Infinity      (permanent)
 */
function _persistenceToLifetimeFrames(p) {
  if (p >= 100) return Infinity;
  if (p <= 0)   return 0;
  // Quadratic curve: short trails feel snappy, high persistence
  // gives long trails but they ALWAYS eventually die (unless 100).
  const t = p / 100;
  return Math.round(3 + Math.pow(t, 2.2) * 360);
}

/**
 * Record a snapshot of all alive particles into the trail history.
 * Each particle is stored as 8 floats: x, y, size, r, g, b, alpha, shapeIdx
 */
function _recordTrailSnapshot(particles) {
  // Count alive particles first
  let aliveCount = 0;
  for (let i = 0; i < particles.length; i++) {
    if (particles[i].alive) aliveCount++;
  }
  if (aliveCount === 0) return;

  const pts = new Float32Array(aliveCount * TRAIL_STRIDE);
  let idx = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.alive) continue;

    // Resolve gradient colour at current life fraction
    let drawR = p.r, drawG = p.g, drawB = p.b;
    if (p.useGradient && typeof getGradientStopsRgb === 'function') {
      const t = p.life / p.maxLife;
      const stops = getGradientStopsRgb();
      const n = stops.length;
      const segT = t * n;
      const segIdx = Math.min(Math.floor(segT), n - 1);
      const localT = segT - segIdx;
      let fR, fG, fB;
      if (segIdx === 0) {
        fR = p.r; fG = p.g; fB = p.b;
      } else {
        fR = stops[segIdx - 1].r; fG = stops[segIdx - 1].g; fB = stops[segIdx - 1].b;
      }
      const to = stops[segIdx];
      drawR = Math.round(fR + (to.r - fR) * localT);
      drawG = Math.round(fG + (to.g - fG) * localT);
      drawB = Math.round(fB + (to.b - fB) * localT);
    }

    const off = idx * TRAIL_STRIDE;
    pts[off]     = p.x;
    pts[off + 1] = p.y;
    pts[off + 2] = p.size;
    pts[off + 3] = drawR;
    pts[off + 4] = drawG;
    pts[off + 5] = drawB;
    pts[off + 6] = Math.max(0, Math.min(1, p.alpha));
    pts[off + 7] = _SHAPE_IDX[p.shape] !== undefined ? _SHAPE_IDX[p.shape] : 1;
    idx++;
  }

  _trailSnapshots.push({ frame: _trailFrame, pts, count: aliveCount });
}

/**
 * Draw a single trail particle shape — simplified version of drawParticleShape
 * without the full effect pipeline (trails are always source-over).
 */
function _drawTrailShape(ctx, shape, x, y, size) {
  switch (shape) {
    case 'circle':
      if (size <= 4) {
        const r = Math.floor(size / 2);
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy <= r * r + r * 0.5) {
              ctx.fillRect(x + dx, y + dy, 1, 1);
            }
          }
        }
      } else {
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'ring': {
      const r = size / 2;
      if (r < 2.5) {
        ctx.fillRect(x, y, 1, 1);
      } else {
        const innerR = Math.max(0.5, r * 0.45);
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, r, 0, Math.PI * 2, false);
        ctx.arc(x + 0.5, y + 0.5, innerR, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
      }
      break;
    }
    case 'triangle': {
      const h = Math.ceil(size / 2);
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h, y + h);
      ctx.lineTo(x - h, y + h);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'diamond': {
      const h = Math.ceil(size / 2);
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x - h, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cross': {
      const t = Math.max(1, Math.floor(size / 3));
      ctx.fillRect(x - Math.floor(size / 2), y - t, size, t * 2);
      ctx.fillRect(x - t, y - Math.floor(size / 2), t * 2, size);
      break;
    }
    case 'star': {
      const outerR = size / 2;
      const innerR = outerR * 0.42;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? outerR : innerR;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'heart': {
      if (size <= 2) {
        ctx.fillRect(x, y, 1, 1);
      } else {
        const half = size / 2;
        ctx.beginPath();
        ctx.moveTo(x, y + half * 0.95);
        ctx.bezierCurveTo(x + half * 1.25, y + half * 0.25, x + half * 1.15, y - half * 0.75, x, y - half * 0.1);
        ctx.bezierCurveTo(x - half * 1.15, y - half * 0.75, x - half * 1.25, y + half * 0.25, x, y + half * 0.95);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'sparkle': {
      const long = size / 2;
      const short = Math.max(1, Math.round(size / 5));
      ctx.beginPath();
      ctx.moveTo(x, y - long);
      ctx.lineTo(x + short, y - short);
      ctx.lineTo(x + long, y);
      ctx.lineTo(x + short, y + short);
      ctx.lineTo(x, y + long);
      ctx.lineTo(x - short, y + short);
      ctx.lineTo(x - long, y);
      ctx.lineTo(x - short, y - short);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: // square
      ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
  }
}

/**
 * Legacy fade mapping — kept for backward-compat and exporter.
 */
function _persistenceToFade(p) {
  if (p >= 100) return 0;
  if (p <= 0)   return 1;
  const t = p / 100;
  return Math.pow(1 - t, 1.4) * 0.32 + (1 - t) * 0.06;
}

function _resolveParticleDisplayColor(p) {
  let drawR = p.r;
  let drawG = p.g;
  let drawB = p.b;

  if (p.useGradient) {
    const t = p.life / p.maxLife;
    const stops = getGradientStopsRgb();
    const n = stops.length;
    const segT = t * n;
    const segIdx = Math.min(Math.floor(segT), n - 1);
    const localT = segT - segIdx;
    let fR, fG, fB;
    if (segIdx === 0) {
      fR = p.r; fG = p.g; fB = p.b;
    } else {
      fR = stops[segIdx - 1].r; fG = stops[segIdx - 1].g; fB = stops[segIdx - 1].b;
    }
    const to = stops[segIdx];
    drawR = Math.round(fR + (to.r - fR) * localT);
    drawG = Math.round(fG + (to.g - fG) * localT);
    drawB = Math.round(fB + (to.b - fB) * localT);
  }

  return { r: drawR, g: drawG, b: drawB };
}

function _trailFadeAlphaForLifetime(lifetime) {
  if (!Number.isFinite(lifetime)) return 0;
  if (lifetime <= 0) return 1;
  const targetAlpha = 1 / 255;
  return Math.max(0, Math.min(1, 1 - Math.pow(targetAlpha, 1 / Math.max(1, lifetime))));
}

function _drawParticleToTrailLayer(targetCtx, p) {
  const alpha = Math.max(0, Math.min(1, p.alpha));
  if (alpha <= 0.002 || p.size <= 0.2) return;

  const color = _resolveParticleDisplayColor(p);
  targetCtx.globalAlpha = alpha;
  targetCtx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
  _drawTrailShape(
    targetCtx,
    p.shape,
    Math.round(p.x),
    Math.round(p.y),
    Math.max(1, Math.round(p.size))
  );
}

function _clearTransparentTrailPixels() {
  if (!_trailCtx || !_trailCanvas) return;
  const img = _trailCtx.getImageData(0, 0, _trailCanvas.width, _trailCanvas.height);
  const d = img.data;
  let dirty = false;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] <= 6) {
      if (d[i] !== 0 || d[i - 1] !== 0 || d[i - 2] !== 0 || d[i - 3] !== 0) dirty = true;
      d[i - 3] = 0;
      d[i - 2] = 0;
      d[i - 1] = 0;
      d[i] = 0;
    }
  }
  if (dirty) _trailCtx.putImageData(img, 0, 0);
}

// Override the older snapshot-redraw trail renderer with an incremental compositor.
function renderFrame() {
  const w = canvas.width;
  const h = canvas.height;
  const { r, g, b } = hexToRgb(bgColor);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, w, h);

  if (_trailEnabled && _trailPersistence > 0 && _trailOpacity > 0) {
    _ensureTrailCanvas();
    _trailFrame++;

    const lifetime = _persistenceToLifetimeFrames(_trailPersistence);
    if (lifetime !== Infinity) {
      const fadeAlpha = _trailFadeAlphaForLifetime(lifetime);
      if (fadeAlpha >= 1) {
        _trailCtx.clearRect(0, 0, w, h);
      } else if (fadeAlpha > 0) {
        _trailCtx.save();
        _trailCtx.globalCompositeOperation = 'destination-out';
        _trailCtx.globalAlpha = fadeAlpha;
        _trailCtx.fillStyle = '#000';
        _trailCtx.fillRect(0, 0, w, h);
        _trailCtx.restore();

        _trailSweepCounter++;
        if (_trailSweepCounter >= 24) {
          _trailSweepCounter = 0;
          _clearTransparentTrailPixels();
        }
      }
    }

    _trailCtx.save();
    _trailCtx.globalCompositeOperation = 'source-over';
    for (const p of particles) {
      if (p.alive) _drawParticleToTrailLayer(_trailCtx, p);
    }
    _trailCtx.restore();

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, _trailOpacity / 100));
    if (_trailSoftness > 0) {
      const blurPx = (_trailSoftness / 100) * 3;
      ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
    }
    ctx.drawImage(_trailCanvas, 0, 0);
    ctx.restore();
  } else if (_trailCanvas) {
    clearTrailCanvas();
  }

  for (const p of particles) {
    if (p.alive) drawParticle(ctx, p);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (document.getElementById('show-crosshair')?.checked) drawEmitterCrosshair();
  if (document.getElementById('show-frame-guide')?.checked) drawFrameGuide();
  drawForceWellIndicators();
}

function drawParticle(ctx, p) {
  const alpha = Math.max(0, Math.min(1, p.alpha));
  if (alpha <= 0) return;

  let drawR = p.r;
  let drawG = p.g;
  let drawB = p.b;
  if (p.useGradient) {
    const t = p.life / p.maxLife;
    const stops = getGradientStopsRgb();
    const n = stops.length;  // number of destination stops
    // Segments: [start→stop0, stop0→stop1, ..., stopN-2→stopN-1]
    const segT = t * n;
    const segIdx = Math.min(Math.floor(segT), n - 1);
    const localT = segT - segIdx;
    let fR, fG, fB;
    if (segIdx === 0) {
      fR = p.r; fG = p.g; fB = p.b;
    } else {
      fR = stops[segIdx - 1].r; fG = stops[segIdx - 1].g; fB = stops[segIdx - 1].b;
    }
    const to = stops[segIdx];
    drawR = Math.round(fR + (to.r - fR) * localT);
    drawG = Math.round(fG + (to.g - fG) * localT);
    drawB = Math.round(fB + (to.b - fB) * localT);
  }

  const color = `rgb(${drawR},${drawG},${drawB})`;
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const s = p.size;
  const effectMode = normalizeEffectMode(blendMode);
  const intensity = Math.max(0, effectStrength);

  if (effectMode === 'glow') {
    const softBias = Math.max(0, 1.2 - intensity) / 1.2;
    drawParticlePass(ctx, p, x, y, s * (1.35 + intensity * 0.25), color, alpha * (0.02 + softBias * 0.06), 'screen', 1.04 + softBias * 0.08);
    drawParticlePass(ctx, p, x, y, s * (1.18 + intensity * 0.4), color, alpha * (0.04 + intensity * 0.05), 'lighter');
    drawParticlePass(ctx, p, x, y, s * (1.65 + intensity * 0.9), color, alpha * (0.015 + intensity * 0.035), 'lighter');
    if (intensity > 1.4) {
      drawParticlePass(ctx, p, x, y, s * (1 + intensity * 0.24), color, alpha * Math.min(0.95, 0.14 + intensity * 0.18), 'lighter');
    }
    drawParticlePass(ctx, p, x, y, s, color, alpha, 'source-over', 1 + intensity * 0.08);
    return;
  }

  if (effectMode === 'prism') {
    const fringeOffset = Math.max(1, Math.round(1 + intensity * 1.1 + s * 0.08));
    const magenta = mixRgbColor(color, { r: 255, g: 90, b: 220 }, 0.62);
    const cyan = mixRgbColor(color, { r: 110, g: 255, b: 255 }, 0.58);
    const gold = mixRgbColor(color, { r: 255, g: 220, b: 90 }, 0.5);
    drawParticlePass(ctx, p, x - fringeOffset, y, s * (1 + intensity * 0.12), magenta, alpha * (0.12 + intensity * 0.04), 'lighter');
    drawParticlePass(ctx, p, x + fringeOffset, y, s * (1 + intensity * 0.12), cyan, alpha * (0.12 + intensity * 0.04), 'lighter');
    drawParticlePass(ctx, p, x, y - fringeOffset, s * (1 + intensity * 0.08), gold, alpha * (0.08 + intensity * 0.03), 'screen', 1.05);
    drawParticlePass(ctx, p, x, y, s * (1.06 + intensity * 0.18), color, alpha * (0.06 + intensity * 0.04), 'screen', 1.1 + intensity * 0.04);
    drawParticlePass(ctx, p, x, y, s, color, alpha, 'source-over', 1.05 + intensity * 0.04);
    return;
  }

  if (effectMode === 'shadow') {
    const shadowOffset = Math.max(1, Math.round(1 + intensity * 1.4));
    const shadowRgb = hexColorToRgbString(shadowColor);
    drawParticlePass(ctx, p, x + shadowOffset, y + shadowOffset, s * (1.22 + intensity * 0.18), shadowRgb, alpha * (0.18 + intensity * 0.08), 'source-over', 0.55);
    drawParticlePass(ctx, p, x + Math.max(1, Math.floor(shadowOffset / 2)), y + Math.max(1, Math.floor(shadowOffset / 2)), s * (1.02 + intensity * 0.08), shadowRgb, alpha * (0.12 + intensity * 0.05), 'source-over', 0.82);
    drawParticlePass(ctx, p, x, y, s * (1 + intensity * 0.05), color, alpha * 0.16, 'lighter');
    drawParticlePass(ctx, p, x, y, s, color, alpha, 'source-over');
    return;
  }

  drawParticlePass(ctx, p, x, y, s, color, alpha, 'source-over');
}

function drawParticlePass(ctx, p, x, y, size, color, alpha, compositeOperation, brightness = 1) {
  if (alpha <= 0 || size <= 0.2) return;

  const drawSize = Math.max(1, Math.round(size));
  const hasRotation = p.spin !== 0 && p.angle !== undefined &&
    (p.shape === 'square' || p.shape === 'triangle' || p.shape === 'diamond' ||
     p.shape === 'star' || p.shape === 'sparkle' || p.shape === 'cross' ||
     p.shape === 'heart');

  ctx.save();
  ctx.globalCompositeOperation = compositeOperation;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = brightness === 1 ? color : brightenRgbColor(color, brightness);

  if (hasRotation) {
    ctx.translate(x, y);
    ctx.rotate(p.angle);
    ctx.translate(-x, -y);
  }

  drawParticleShape(ctx, p.shape, x, y, drawSize);
  ctx.restore();
}

function brightenRgbColor(rgbString, factor) {
  const match = rgbString.match(/\d+/g);
  if (!match) return rgbString;
  const [r, g, b] = match.map(n => Math.max(0, Math.min(255, Math.round(Number(n) * factor))));
  return `rgb(${r},${g},${b})`;
}

function mixRgbColor(rgbString, tint, amount) {
  const match = rgbString.match(/\d+/g);
  if (!match) return rgbString;
  const a = Math.max(0, Math.min(1, amount));
  const [r, g, b] = match.map(Number);
  return `rgb(${Math.round(r * (1 - a) + tint.r * a)},${Math.round(g * (1 - a) + tint.g * a)},${Math.round(b * (1 - a) + tint.b * a)})`;
}

function hexColorToRgbString(hex) {
  const { r, g, b } = hexToRgb(hex || '#120018');
  return `rgb(${r},${g},${b})`;
}

function drawParticleShape(ctx, shape, x, y, size) {
  switch (shape) {
    case 'circle':
      if (size <= 4) {
        pixelCircle(ctx, x, y, size);
      } else {
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'ring': {
      // Hollow circle (annulus) — great for shockwave / portal / soap-bubble effects
      const r = size / 2;
      if (r < 2.5) {
        // Too small for a ring, fall back to filled pixel
        ctx.fillRect(x, y, 1, 1);
      } else {
        const innerR = Math.max(0.5, r * 0.45);
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, r, 0, Math.PI * 2, false);
        ctx.arc(x + 0.5, y + 0.5, innerR, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
      }
      break;
    }

    case 'triangle': {
      const h = Math.ceil(size / 2);
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h, y + h);
      ctx.lineTo(x - h, y + h);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'diamond': {
      const h = Math.ceil(size / 2);
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x - h, y);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'cross': {
      const t = Math.max(1, Math.floor(size / 3));
      ctx.fillRect(x - Math.floor(size / 2), y - t, size, t * 2);
      ctx.fillRect(x - t, y - Math.floor(size / 2), t * 2, size);
      break;
    }

    case 'star': {
      const outerR = size / 2;
      const innerR = outerR * 0.42;
      const pts = 5;
      ctx.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        const angle = (i * Math.PI) / pts - Math.PI / 2;
        const radius = i % 2 === 0 ? outerR : innerR;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'heart': {
      if (size <= 2) {
        ctx.fillRect(x, y, 1, 1);
      } else {
        const half = size / 2;
        ctx.beginPath();
        ctx.moveTo(x, y + half * 0.95);
        ctx.bezierCurveTo(
          x + half * 1.25, y + half * 0.25,
          x + half * 1.15, y - half * 0.75,
          x, y - half * 0.1
        );
        ctx.bezierCurveTo(
          x - half * 1.15, y - half * 0.75,
          x - half * 1.25, y + half * 0.25,
          x, y + half * 0.95
        );
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case 'sparkle': {
      const long = size / 2;
      const short = Math.max(1, Math.round(size / 5));
      ctx.beginPath();
      ctx.moveTo(x, y - long);
      ctx.lineTo(x + short, y - short);
      ctx.lineTo(x + long, y);
      ctx.lineTo(x + short, y + short);
      ctx.lineTo(x, y + long);
      ctx.lineTo(x - short, y + short);
      ctx.lineTo(x - long, y);
      ctx.lineTo(x - short, y - short);
      ctx.closePath();
      ctx.fill();
      break;
    }

    default:
      ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
  }
}

function pixelCircle(ctx, cx, cy, diameter) {
  const r = Math.floor(diameter / 2);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r + r * 0.5) {
        ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }
}

function rendererRotateEmitterOffset(dx, dy, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    dx * cos - dy * sin,
    dx * sin + dy * cos,
  ];
}

function rendererTriangleEmitterVertices(radius) {
  return [
    { x: 0, y: -radius },
    { x: Math.sin(Math.PI / 3) * radius, y: radius * 0.5 },
    { x: -Math.sin(Math.PI / 3) * radius, y: radius * 0.5 },
  ];
}

function rendererTraceEmitterPolygon(cx, cy, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(cx + points[0].x, cy + points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(cx + points[i].x, cy + points[i].y);
  }
  ctx.closePath();
}

/**
 * Draw the emitter crosshair and — for line/circle shapes — a dashed
 * shape indicator showing the actual spawn area.
 */
function drawEmitterCrosshair() {
  const x = emitterX >= 0 ? emitterX : canvasW / 2;
  const y = emitterY >= 0 ? emitterY : canvasH / 2;
  const shape = cfg?.emitterShape || 'point';
  const size  = Math.max(1, cfg?.emitterSize || 18);
  const radialSize = Math.min(canvasW, canvasH) * (size / 100);
  const angle = ((cfg?.emitterAngle || 0) * Math.PI) / 180;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  // ── Shape indicator (dashed outline of the spawn area) ────────────────
  if (shape === 'line') {
    const halfWidth = canvasW * (size / 100);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * halfWidth, y + Math.sin(angle) * halfWidth);
    ctx.lineTo(x - Math.cos(angle) * halfWidth, y - Math.sin(angle) * halfWidth);
    ctx.stroke();
  } else if (shape === 'circle' || shape === 'disk') {
    ctx.beginPath();
    ctx.arc(x, y, radialSize, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === 'square') {
    const half = radialSize;
    const points = [
      rendererRotateEmitterOffset(-half, -half, angle),
      rendererRotateEmitterOffset(half, -half, angle),
      rendererRotateEmitterOffset(half, half, angle),
      rendererRotateEmitterOffset(-half, half, angle),
    ].map(([px, py]) => ({ x: px, y: py }));
    rendererTraceEmitterPolygon(x, y, points);
    ctx.stroke();
  } else if (shape === 'triangle') {
    const points = rendererTriangleEmitterVertices(radialSize)
      .map(({ x: px, y: py }) => {
        const [rx, ry] = rendererRotateEmitterOffset(px, py, angle);
        return { x: rx, y: ry };
      });
    rendererTraceEmitterPolygon(x, y, points);
    ctx.stroke();
  } else if (shape === 'arc') {
    const halfSpan = (((cfg?.emitterArc || 120) / 2) * Math.PI) / 180;
    const start = angle - halfSpan;
    const end = angle + halfSpan;
    ctx.beginPath();
    ctx.arc(x, y, radialSize, start, end);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(start) * radialSize, y + Math.sin(start) * radialSize);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(end) * radialSize, y + Math.sin(end) * radialSize);
    ctx.stroke();
  }

  // ── Center crosshair ───────────────────────────────────────────────────
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  const r   = 7;
  const gap = 3;
  ctx.beginPath();
  ctx.moveTo(x - r, y); ctx.lineTo(x - gap, y);
  ctx.moveTo(x + gap, y); ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r); ctx.lineTo(x, y - gap);
  ctx.moveTo(x, y + gap); ctx.lineTo(x, y + r);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.restore();
}

function drawFrameGuide() {
  const frameSize = parseInt(document.getElementById('render-frame-size')?.value, 10) || 128;
  const ex = emitterX >= 0 ? emitterX : canvasW / 2;
  const ey = emitterY >= 0 ? emitterY : canvasH / 2;

  // The frame guide shows where the render frame will be centered
  // relative to the emitter position
  const emitPX = ex / canvasW;
  const emitPY = ey / canvasH;

  // The render frame is frameSize x frameSize, but we need to show it
  // at canvas scale. The render maps the emitter to (emitPX * frameSize, emitPY * frameSize)
  // in the frame. So the frame spans from:
  //   left = ex - emitPX * scale, top = ey - emitPY * scale
  // where scale = canvasW (we show the guide at a proportional size)
  // Actually, simpler: the frame captures frameSize pixels centered around
  // the emitter at its proportional position. On the canvas, the guide
  // rectangle shows what portion of the canvas will be visible.
  const scale = canvasW / frameSize;  // canvas pixels per frame pixel
  const guideW = frameSize * scale;   // this would be canvasW - i.e. full width
  // That's not right. Let's think differently:
  // The render frame is a square of frameSize x frameSize.
  // The emitter is placed at (emitPX * frameSize, emitPY * frameSize) in that frame.
  // On the canvas, the emitter is at (ex, ey).
  // So the frame extends from:
  //   canvas_left = ex - emitPX * frameSize_in_canvas_units
  // But what are "frameSize_in_canvas_units"? The canvas and frame have different sizes.
  // The simplest mapping: 1 frame pixel = 1 canvas pixel.
  // So the guide rectangle is frameSize x frameSize canvas pixels, with
  // emitter at (emitPX * frameSize, emitPY * frameSize) relative to rectangle origin.

  const guideLeft = ex - emitPX * frameSize;
  const guideTop  = ey - emitPY * frameSize;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(guideLeft + 0.5, guideTop + 0.5, frameSize, frameSize);
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.font = '9px monospace';
  ctx.fillText(frameSize + '×' + frameSize, guideLeft + 3, guideTop + 10);
  ctx.restore();
}


/** Mode for canvas interactions: 'emitter' (default) or 'force' (place wells) */
let _canvasInteractionMode = 'emitter';
let _pendingForceStrength = 5;
let _pendingForceRadius = 150;

function setCanvasInteractionMode(mode) { _canvasInteractionMode = mode; }
function setPendingForceWell(strength, radius) {
  _pendingForceStrength = strength;
  _pendingForceRadius = radius;
}

function setupEmitterInteraction() {
  canvas.style.cursor = 'crosshair';
  let dragging = false;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
    };
  }

  canvas.addEventListener('mousedown', e => {
    const { x, y } = getPos(e);
    if (_canvasInteractionMode === 'force') {
      addForceWell(x, y, _pendingForceStrength, _pendingForceRadius);
      if (typeof _onForceWellsChanged === 'function') _onForceWellsChanged();
      return;
    }
    dragging = true;
    setEmitterDragging(true);
    setEmitterPos(x, y);
  });

  canvas.addEventListener('mousemove', e => {
    const { x, y } = getPos(e);
    // Always update mouse force position (for interactive mouse force)
    if (typeof setMouseForcePos === 'function') setMouseForcePos(x, y);
    if (!dragging || _canvasInteractionMode === 'force') return;
    setEmitterPos(x, y);
  });

  canvas.addEventListener('mouseup',    () => { dragging = false; setEmitterDragging(false); });
  canvas.addEventListener('mouseleave', () => {
    dragging = false;
    setEmitterDragging(false);
    if (typeof setMouseForcePos === 'function') setMouseForcePos(-1, -1);
  });

  canvas.addEventListener('touchstart', e => {
    const { x, y } = getPos(e);
    if (_canvasInteractionMode === 'force') {
      addForceWell(x, y, _pendingForceStrength, _pendingForceRadius);
      if (typeof _onForceWellsChanged === 'function') _onForceWellsChanged();
      e.preventDefault();
      return;
    }
    dragging = true;
    setEmitterDragging(true);
    setEmitterPos(x, y);
    if (typeof setMouseForcePos === 'function') setMouseForcePos(x, y);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    const { x, y } = getPos(e);
    if (typeof setMouseForcePos === 'function') setMouseForcePos(x, y);
    if (!dragging || _canvasInteractionMode === 'force') return;
    setEmitterPos(x, y);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', () => { dragging = false; setEmitterDragging(false); });
}

function setRendererBg(hex)      { bgColor = hex; }
function setTrailAlpha(alpha)    {
  trailAlpha = alpha;
  // Backward-compat: map legacy trailAlpha (0–1) to new persistence (0–100)
  // trailAlpha 0 = no trail = persistence 0, trailAlpha 1 = infinite = persistence 100
  _trailPersistence = Math.round(alpha * 100);
  _trailEnabled = alpha > 0;
}
function setBlendMode(mode)      { blendMode = normalizeEffectMode(mode); }
function setEffectStrength(value){ effectStrength = Math.max(0, Math.min(3, Number.isFinite(value) ? value : 1)); }
function setShadowColor(hex)     { shadowColor = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#120018'; }

// ── Trail setters ─────────────────────────────────────────────────────────
function setTrailEnabled(on) {
  const was = _trailEnabled;
  _trailEnabled = !!on;
  if (was && !on) { _trailSnapshots = []; clearTrailCanvas(); }
}
function setTrailPersistence(val) {
  _trailPersistence = Math.max(0, Math.min(100, Number(val) || 0));
  if (_trailPersistence <= 0) { _trailSnapshots = []; clearTrailCanvas(); }
}
function setTrailOpacity(val) {
  _trailOpacity = Math.max(0, Math.min(100, Number(val) || 0));
  if (_trailOpacity <= 0) { _trailSnapshots = []; clearTrailCanvas(); }
}
function setTrailSoftness(val) {
  _trailSoftness = Math.max(0, Math.min(100, Number(val) || 0));
}

function getTrailState() {
  return {
    enabled: _trailEnabled,
    persistence: _trailPersistence,
    opacity: _trailOpacity,
    softness: _trailSoftness,
  };
}

function clearTrailCanvas() {
  _trailSnapshots = [];
  _trailFrame = 0;
  _trailSweepCounter = 0;
  if (_trailCtx && _trailCanvas) {
    _trailCtx.clearRect(0, 0, _trailCanvas.width, _trailCanvas.height);
  }
}

function clearCanvas() {
  const { r, g, b } = hexToRgb(bgColor);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  clearTrailCanvas();
}

function getCanvas() { return canvas; }
function getCtx()    { return ctx; }
