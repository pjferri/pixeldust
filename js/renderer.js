/**
 * renderer.js
 * Canvas drawing, emitter crosshair, and canvas drag interaction.
 *
 * v0.1.0: ring particle shape; crosshair now visualises emitter shape extent
 */

let canvas, ctx;

let bgColor = '#0c0c0e';
let trailAlpha = 0.12;
let blendMode = 'glow';
let effectStrength = 1;

function normalizeEffectMode(mode) {
  switch (mode) {
    case 'source-over': return 'normal';
    case 'lighter':     return 'glow';
    case 'multiply':    return 'shadow';
    case 'screen':      return 'screen';
    case 'normal':
    case 'glow':
    case 'neon':
    case 'screen':
    case 'shadow':
      return mode;
    default:
      return 'normal';
  }
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
  centerEmitter();
}

function renderFrame() {
  const w = canvas.width;
  const h = canvas.height;
  const { r, g, b } = hexToRgb(bgColor);

  ctx.globalCompositeOperation = 'source-over';

  // If no particles are alive, do a full opaque clear so residual glow is erased
  if (liveCount() === 0) {
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = `rgba(${r},${g},${b},${1 - trailAlpha})`;
    ctx.fillRect(0, 0, w, h);
  }

  for (const p of particles) {
    if (p.alive) drawParticle(ctx, p);
  }

  ctx.globalCompositeOperation = 'source-over';
  if (document.getElementById('show-crosshair')?.checked) drawEmitterCrosshair();
}

function drawParticle(ctx, p) {
  const alpha = Math.max(0, Math.min(1, p.alpha));
  if (alpha <= 0) return;

  let drawR = p.r;
  let drawG = p.g;
  let drawB = p.b;
  if (p.useGradient) {
    const t = p.life / p.maxLife;
    drawR = Math.round(p.r + (p.er - p.r) * t);
    drawG = Math.round(p.g + (p.eg - p.g) * t);
    drawB = Math.round(p.b + (p.eb - p.b) * t);
  }

  const color = `rgb(${drawR},${drawG},${drawB})`;
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const s = p.size;
  const effectMode = normalizeEffectMode(blendMode);
  const intensity = Math.max(0, effectStrength);

  if (effectMode === 'glow') {
    drawParticlePass(ctx, p, x, y, s * (1.4 + intensity), color, alpha * 0.10 * intensity, 'lighter');
    drawParticlePass(ctx, p, x, y, s * (1.1 + intensity * 0.6), color, alpha * 0.22 * intensity, 'lighter');
    drawParticlePass(ctx, p, x, y, s, color, alpha, 'source-over');
    return;
  }

  if (effectMode === 'neon') {
    drawParticlePass(ctx, p, x, y, s * (1.8 + intensity * 1.4), color, alpha * 0.12 * intensity, 'lighter');
    drawParticlePass(ctx, p, x, y, s * (1.2 + intensity), color, alpha * 0.28 * intensity, 'lighter');
    drawParticlePass(ctx, p, x, y, s * (1 + intensity * 0.2), color, alpha * 0.9, 'lighter');
    drawParticlePass(ctx, p, x, y, s, color, alpha, 'source-over');
    return;
  }

  if (effectMode === 'screen') {
    drawParticlePass(ctx, p, x, y, s * (1 + intensity * 0.4), color, alpha * 0.18 * intensity, 'screen');
    drawParticlePass(ctx, p, x, y, s, color, alpha, 'screen');
    return;
  }

  if (effectMode === 'shadow') {
    drawParticlePass(ctx, p, x, y, s * (1 + intensity * 0.4), color, alpha * 0.25 * Math.max(0.3, intensity), 'multiply');
    drawParticlePass(ctx, p, x, y, s, color, alpha * 0.85, 'source-over', Math.max(0.2, 0.7 - intensity * 0.15));
    return;
  }

  drawParticlePass(ctx, p, x, y, s, color, alpha, 'source-over');
}

function drawParticlePass(ctx, p, x, y, size, color, alpha, compositeOperation, brightness = 1) {
  if (alpha <= 0 || size <= 0.2) return;

  const drawSize = Math.max(1, Math.round(size));
  const hasRotation = p.spin !== 0 && p.angle !== undefined &&
    (p.shape === 'square' || p.shape === 'diamond' || p.shape === 'star' ||
     p.shape === 'sparkle' || p.shape === 'cross');

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

/**
 * Draw the emitter crosshair and — for line/circle shapes — a dashed
 * shape indicator showing the actual spawn area.
 */
function drawEmitterCrosshair() {
  const x = emitterX >= 0 ? emitterX : canvasW / 2;
  const y = emitterY >= 0 ? emitterY : canvasH / 2;
  const shape = cfg?.emitterShape || 'point';
  const size  = Math.max(1, cfg?.emitterSize || 18);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;

  // ── Shape indicator (dashed outline of the spawn area) ────────────────
  if (shape === 'line') {
    const hw    = canvasW * (size / 100);
    const angle = ((cfg?.emitterAngle || 0) * Math.PI) / 180;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * hw, y + Math.sin(angle) * hw);
    ctx.lineTo(x - Math.cos(angle) * hw, y - Math.sin(angle) * hw);
    ctx.stroke();
  } else if (shape === 'circle') {
    const radius = Math.min(canvasW, canvasH) * (size / 100);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
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
    dragging = true;
    setEmitterDragging(true);
    const { x, y } = getPos(e);
    setEmitterPos(x, y);
  });

  canvas.addEventListener('mousemove', e => {
    if (!dragging) return;
    const { x, y } = getPos(e);
    setEmitterPos(x, y);
  });

  canvas.addEventListener('mouseup',    () => { dragging = false; setEmitterDragging(false); });
  canvas.addEventListener('mouseleave', () => { dragging = false; setEmitterDragging(false); });

  canvas.addEventListener('touchstart', e => {
    dragging = true;
    setEmitterDragging(true);
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

  canvas.addEventListener('touchend', () => { dragging = false; setEmitterDragging(false); });
}

function setRendererBg(hex)      { bgColor = hex; }
function setTrailAlpha(alpha)    { trailAlpha = alpha; }
function setBlendMode(mode)      { blendMode = normalizeEffectMode(mode); }
function setEffectStrength(value){ effectStrength = Math.max(0, Math.min(2, Number.isFinite(value) ? value : 1)); }

function clearCanvas() {
  const { r, g, b } = hexToRgb(bgColor);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function getCanvas() { return canvas; }
function getCtx()    { return ctx; }
