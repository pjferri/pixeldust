/**
 * renderer.js
 * Handles the canvas and draws particles each frame.
 *
 * Uses imageSmoothingEnabled = false throughout so every
 * pixel stays crisp — core to the pixel-art aesthetic.
 */

let canvas, ctx;

/** Background colour (hex, set by UI). */
let bgColor = '#0d0d0f';

/** Trail alpha — how much of the old frame bleeds through (0=no trail, 1=full wipe). */
let trailAlpha = 0.18;

/** Current blend mode for particles. */
let blendMode = 'source-over';

/**
 * Initialise the renderer against a given <canvas> element.
 * Automatically sizes the canvas to fit its CSS container.
 */
function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx    = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  sizeCanvas();
}

/**
 * Fit canvas to container, respecting device pixel ratio.
 * Keeping the canvas square makes sprite-sheet export straightforward.
 */
function sizeCanvas() {
  const wrap = canvas.parentElement;
  const size = Math.min(wrap.clientWidth, wrap.clientHeight, 512);
  canvas.width  = size;
  canvas.height = size;
  // Propagate to emitter so spawn coords are accurate
  canvasW = size;
  canvasH = size;
  ctx.imageSmoothingEnabled = false;
}

/**
 * Draw one frame.
 * Called by the main loop in main.js.
 */
function renderFrame() {
  const w = canvas.width;
  const h = canvas.height;

  // ── Background / trail ──────────────────────────────────────────────────
  // Instead of clearing fully, paint a semi-transparent rectangle over the
  // previous frame. This creates the classic "motion trail" look.
  ctx.globalCompositeOperation = 'source-over';
  const { r, g, b } = hexToRgb(bgColor);
  ctx.fillStyle = `rgba(${r},${g},${b},${1 - trailAlpha})`;
  ctx.fillRect(0, 0, w, h);

  // ── Particles ───────────────────────────────────────────────────────────
  ctx.globalCompositeOperation = blendMode;

  for (const p of particles) {
    if (!p.alive) continue;
    drawParticle(ctx, p);
  }

  // Reset blend mode
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Draw a single particle pixel-perfectly.
 * All coordinates and sizes are rounded to integer pixels.
 */
function drawParticle(ctx, p) {
  const alpha = Math.max(0, Math.min(1, p.alpha));
  if (alpha <= 0) return;

  ctx.globalAlpha = alpha;
  ctx.fillStyle   = `rgb(${p.r},${p.g},${p.b})`;

  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const s = p.size;

  switch (p.shape) {
    case 'circle': {
      // Draw a filled circle with crisp integer coords.
      // We use a simple pixel-fill loop for very small sizes (< 6px) so the
      // result is more "pixel-art circle" than anti-aliased arc.
      if (s <= 4) {
        pixelCircle(ctx, x, y, s);
      } else {
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, s / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'diamond': {
      // Pixel-art diamond (rotated square)
      const h = Math.ceil(s / 2);
      ctx.beginPath();
      ctx.moveTo(x,     y - h);
      ctx.lineTo(x + h, y    );
      ctx.lineTo(x,     y + h);
      ctx.lineTo(x - h, y    );
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'cross': {
      const t = Math.max(1, Math.floor(s / 3));
      ctx.fillRect(x - Math.floor(s / 2), y - t,           s, t * 2);
      ctx.fillRect(x - t,                 y - Math.floor(s / 2), t * 2, s);
      break;
    }

    default: // 'square'
      ctx.fillRect(x - Math.floor(s / 2), y - Math.floor(s / 2), s, s);
  }

  ctx.globalAlpha = 1;
}

/**
 * Pixel-art circle: fills pixels within a radius using integer arithmetic.
 * Gives a blocky, authentic retro look at small sizes.
 */
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

/**
 * Set background colour.
 * @param {string} hex
 */
function setRendererBg(hex) {
  bgColor = hex;
}

/**
 * Set trail persistence (0 = short trail, 1 = full wipe each frame).
 * @param {number} alpha
 */
function setTrailAlpha(alpha) {
  trailAlpha = alpha;
}

/**
 * Set particle blend mode.
 * @param {string} mode - CSS composite operation string
 */
function setBlendMode(mode) {
  blendMode = mode;
}

/**
 * Fully clear the canvas (used on reset).
 */
function clearCanvas() {
  const { r, g, b } = hexToRgb(bgColor);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** Expose canvas for exporter. */
function getCanvas() { return canvas; }
function getCtx()    { return ctx; }
