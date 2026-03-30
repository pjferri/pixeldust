/**
 * renderer.js
 * Canvas drawing, emitter crosshair, and canvas drag interaction.
 *
 * New in v0.2:
 *   - Lifetime colour gradient lerp in drawParticle()
 *   - Star and sparkle pixel shapes
 *   - Emitter crosshair drawn each frame
 *   - setupEmitterInteraction() — click/drag to reposition emitter
 */

let canvas, ctx;

let bgColor    = '#0c0c0e';
let trailAlpha = 0.12;
let blendMode  = 'lighter';

// ── Init ───────────────────────────────────────────────────────────────────

function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx    = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  sizeCanvas();
  setupEmitterInteraction();
}

// ── Sizing ─────────────────────────────────────────────────────────────────

/**
 * Fit the canvas to its #canvas-area container.
 * Measures the grandparent so the canvas size doesn't create
 * a circular dependency with its own wrapper.
 */
function sizeCanvas() {
  const area = canvas.closest('#canvas-area') || canvas.parentElement.parentElement;
  const pad  = 56;
  const size = Math.max(256, Math.min(
    area.clientWidth  - pad,
    area.clientHeight - pad,
    720
  ));
  canvas.width  = size;
  canvas.height = size;
  canvasW = size;
  canvasH = size;
  ctx.imageSmoothingEnabled = false;

  // Re-centre emitter so spawn point is valid after resize.
  // centerEmitter() is defined in emitter.js and resets to canvas centre.
  centerEmitter();
}

// ── Frame render ───────────────────────────────────────────────────────────

function renderFrame() {
  const w = canvas.width;
  const h = canvas.height;

  // ── Trail / background ────────────────────────────────────────────────
  ctx.globalCompositeOperation = 'source-over';
  const { r, g, b } = hexToRgb(bgColor);
  ctx.fillStyle = `rgba(${r},${g},${b},${1 - trailAlpha})`;
  ctx.fillRect(0, 0, w, h);

  // ── Particles ─────────────────────────────────────────────────────────
  ctx.globalCompositeOperation = blendMode;
  for (const p of particles) {
    if (p.alive) drawParticle(ctx, p);
  }

  // ── Emitter crosshair (drawn on top, always source-over) ─────────────
  ctx.globalCompositeOperation = 'source-over';
  drawEmitterCrosshair();
}

// ── Particle drawing ───────────────────────────────────────────────────────

/**
 * Draw one particle onto the context.
 * Handles colour gradient lerp, alpha, and all shape variants.
 */
function drawParticle(ctx, p) {
  const alpha = Math.max(0, Math.min(1, p.alpha));
  if (alpha <= 0) return;

  // ── Colour lerp for lifetime gradient ──────────────────────────────
  let drawR = p.r, drawG = p.g, drawB = p.b;
  if (p.useGradient) {
    const t  = p.life / p.maxLife;
    drawR = Math.round(p.r + (p.er - p.r) * t);
    drawG = Math.round(p.g + (p.eg - p.g) * t);
    drawB = Math.round(p.b + (p.eb - p.b) * t);
  }

  ctx.globalAlpha = alpha;
  ctx.fillStyle   = `rgb(${drawR},${drawG},${drawB})`;

  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const s = p.size;

  // Apply rotation transform for shapes that benefit from it
  const hasRotation = p.spin !== 0 && p.angle !== undefined &&
    (p.shape === 'square' || p.shape === 'diamond' || p.shape === 'star' ||
     p.shape === 'sparkle' || p.shape === 'cross');
  if (hasRotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.angle);
    ctx.translate(-x, -y);
  }

  switch (p.shape) {
    // ── Circle (pixel-art at small sizes, arc at large) ────────────────
    case 'circle':
      if (s <= 4) {
        pixelCircle(ctx, x, y, s);
      } else {
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, s / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    // ── Diamond ────────────────────────────────────────────────────────
    case 'diamond': {
      const h = Math.ceil(s / 2);
      ctx.beginPath();
      ctx.moveTo(x,     y - h);
      ctx.lineTo(x + h, y);
      ctx.lineTo(x,     y + h);
      ctx.lineTo(x - h, y);
      ctx.closePath();
      ctx.fill();
      break;
    }

    // ── Cross ──────────────────────────────────────────────────────────
    case 'cross': {
      const t = Math.max(1, Math.floor(s / 3));
      ctx.fillRect(x - Math.floor(s / 2), y - t,                s, t * 2);
      ctx.fillRect(x - t,                 y - Math.floor(s / 2), t * 2, s);
      break;
    }

    // ── Star (5-pointed) ───────────────────────────────────────────────
    case 'star': {
      const outerR = s / 2;
      const innerR = outerR * 0.42;
      const pts    = 5;
      ctx.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        // Start pointing up (offset by -π/2)
        const angle = (i * Math.PI) / pts - Math.PI / 2;
        const r     = i % 2 === 0 ? outerR : innerR;
        const px    = x + Math.cos(angle) * r;
        const py    = y + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }

    // ── Sparkle (4-pointed elongated star) ────────────────────────────
    case 'sparkle': {
      const long  = s / 2;
      const short = Math.max(1, Math.round(s / 5));
      ctx.beginPath();
      ctx.moveTo(x,           y - long);
      ctx.lineTo(x + short,   y - short);
      ctx.lineTo(x + long,    y);
      ctx.lineTo(x + short,   y + short);
      ctx.lineTo(x,           y + long);
      ctx.lineTo(x - short,   y + short);
      ctx.lineTo(x - long,    y);
      ctx.lineTo(x - short,   y - short);
      ctx.closePath();
      ctx.fill();
      break;
    }

    // ── Square (default) ───────────────────────────────────────────────
    default:
      ctx.fillRect(x - Math.floor(s / 2), y - Math.floor(s / 2), s, s);
  }

  if (hasRotation) ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * Pixel-art filled circle using integer arithmetic.
 * Gives a blocky retro look at sizes ≤4 px.
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

// ── Emitter crosshair ──────────────────────────────────────────────────────

/**
 * Draw a subtle crosshair at the current emitter origin.
 * Always drawn in source-over so it's visible regardless of blend mode.
 */
function drawEmitterCrosshair() {
  const x = emitterX >= 0 ? emitterX : canvasW / 2;
  const y = emitterY >= 0 ? emitterY : canvasH / 2;
  const r = 7;       // arm length from centre
  const gap = 3;     // gap around centre dot

  ctx.save();
  ctx.globalAlpha     = 0.5;
  ctx.strokeStyle     = '#ffffff';
  ctx.lineWidth       = 1;

  // Horizontal arms
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - gap, y);
  ctx.moveTo(x + gap, y);
  ctx.lineTo(x + r, y);
  // Vertical arms
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y - gap);
  ctx.moveTo(x, y + gap);
  ctx.lineTo(x, y + r);
  ctx.stroke();

  // Centre dot
  ctx.globalAlpha = 0.7;
  ctx.fillStyle   = '#ffffff';
  ctx.fillRect(x - 1, y - 1, 2, 2);

  ctx.restore();
}

// ── Canvas interaction (drag to reposition emitter) ────────────────────────

/**
 * Attach mouse and touch listeners to the canvas so the user can
 * click/drag to move the emitter spawn point.
 * Coordinate transform accounts for CSS scaling vs canvas buffer size.
 */
function setupEmitterInteraction() {
  canvas.style.cursor = 'crosshair';

  let dragging = false;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  }

  canvas.addEventListener('mousedown', e => {
    dragging = true;
    const { x, y } = getPos(e);
    setEmitterPos(x, y);
  });

  canvas.addEventListener('mousemove', e => {
    if (!dragging) return;
    const { x, y } = getPos(e);
    setEmitterPos(x, y);
  });

  canvas.addEventListener('mouseup',    () => { dragging = false; });
  canvas.addEventListener('mouseleave', () => { dragging = false; });

  // Touch support
  canvas.addEventListener('touchstart', e => {
    dragging = true;
    const { x, y } = getPos(e);
    setEmitterPos(x, y);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (!dragging) return;
    const { x, y } = getPos(e);
    setEmitterPos(x, y);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', () => { dragging = false; });
}

// ── Renderer state setters ─────────────────────────────────────────────────

function setRendererBg(hex)     { bgColor    = hex; }
function setTrailAlpha(alpha)   { trailAlpha = alpha; }
function setBlendMode(mode)     { blendMode  = mode; }

function clearCanvas() {
  const { r, g, b } = hexToRgb(bgColor);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function getCanvas() { return canvas; }
function getCtx()    { return ctx; }
