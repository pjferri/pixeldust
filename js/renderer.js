/**
 * renderer.js
 * Canvas drawing, emitter crosshair, and canvas drag interaction.
 *
 * v0.1.0: ring particle shape; crosshair now visualises emitter shape extent
 */

let canvas, ctx;

// Ghost trail fix — pixel-snap counter
let _snapCount = 0;

let bgColor = '#0c0c0e';
let trailAlpha = 0.12;
let blendMode = 'normal';
let effectStrength = 1;
let shadowColor = '#120018';

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

  // ── Pixel-snap ghost fix ─────────────────────────────────────────────
  // 8-bit canvas quantization can leave pixels stuck 1–2 units from the
  // background colour, creating a faint permanent "ghost."  Every 3rd
  // frame we scan the canvas and snap any pixel within ±3 of the bg to
  // the exact bg value.  Because this runs BEFORE drawParticle(), active
  // particle content is always painted fresh on top — no visual impact.
  _snapCount = (_snapCount + 1) % 3;
  if (_snapCount === 0) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const T = 3; // threshold
    for (let i = 0, n = d.length; i < n; i += 4) {
      if (d[i]   - r <= T && r - d[i]   <= T &&
          d[i+1] - g <= T && g - d[i+1] <= T &&
          d[i+2] - b <= T && b - d[i+2] <= T) {
        d[i] = r; d[i+1] = g; d[i+2] = b;
      }
    }
    ctx.putImageData(img, 0, 0);
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
function setEffectStrength(value){ effectStrength = Math.max(0, Math.min(3, Number.isFinite(value) ? value : 1)); }
function setShadowColor(hex)     { shadowColor = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#120018'; }

function clearCanvas() {
  const { r, g, b } = hexToRgb(bgColor);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function getCanvas() { return canvas; }
function getCtx()    { return ctx; }
