/**
 * exporter.js
 * Offline PNG and GIF export that mirrors the live simulation closely.
 *
 * v0.1.0: death particle simulation in local simulator; emitterSize/Angle support
 */

function createLocalSimulator(emitCfg, frameSize) {
  const pool = [];
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = frameSize;
  frameCanvas.height = frameSize;

  const frameCtx = frameCanvas.getContext('2d');
  frameCtx.imageSmoothingEnabled = false;

  const centerX = frameSize / 2;
  const centerY = frameSize / 2;
  let loopTimer  = 0;
  let pulseTimer = 0;

  const trailAlpha  = Number.isFinite(emitCfg.trailAlpha) ? emitCfg.trailAlpha : 0.12;
  const bgHex       = emitCfg.bgColor || '#0c0c0e';
  const transparentBg = !!emitCfg.transparentBg;

  function exportRotateEmitterOffset(dx, dy, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      dx * cos - dy * sin,
      dx * sin + dy * cos,
    ];
  }

  function exportTriangleEmitterOffset(radius, angle) {
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
    return exportRotateEmitterOffset(dx, dy, angle);
  }

  // ── Spawn point (mirrors emitter.js spawnPoint) ─────────────────────────
  function spawnPoint() {
    const size = Math.max(1, emitCfg.emitterSize || 18);
    const radialSize = frameSize * (size / 100);
    switch (emitCfg.emitterShape) {
      case 'line': {
        const hw    = frameSize * (size / 100);
        const angle = ((emitCfg.emitterAngle || 0) * Math.PI) / 180;
        const t     = (Math.random() * 2 - 1) * hw;
        return [centerX + t * Math.cos(angle), centerY + t * Math.sin(angle)];
      }
      case 'circle': {
        const radius = radialSize;
        const a = Math.random() * Math.PI * 2;
        return [centerX + Math.cos(a) * radius, centerY + Math.sin(a) * radius];
      }
      case 'disk': {
        const radius = radialSize * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        return [centerX + Math.cos(a) * radius, centerY + Math.sin(a) * radius];
      }
      case 'square': {
        const half = radialSize;
        const angle = ((emitCfg.emitterAngle || 0) * Math.PI) / 180;
        const dx = (Math.random() * 2 - 1) * half;
        const dy = (Math.random() * 2 - 1) * half;
        const [rx, ry] = exportRotateEmitterOffset(dx, dy, angle);
        return [centerX + rx, centerY + ry];
      }
      case 'triangle': {
        const angle = ((emitCfg.emitterAngle || 0) * Math.PI) / 180;
        const [dx, dy] = exportTriangleEmitterOffset(radialSize, angle);
        return [centerX + dx, centerY + dy];
      }
      case 'arc': {
        const centerAngle = ((emitCfg.emitterAngle || 0) * Math.PI) / 180;
        const halfSpan = (((emitCfg.emitterArc || 120) / 2) * Math.PI) / 180;
        const a = centerAngle + (Math.random() * 2 - 1) * halfSpan;
        return [centerX + Math.cos(a) * radialSize, centerY + Math.sin(a) * radialSize];
      }
      default:
        return [centerX, centerY];
    }
  }

  // ── Spawn helpers ────────────────────────────────────────────────────────
  function spawnParticleToPool(x, y) {
    const particle = createParticle(x, y, emitCfg);
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].alive) { pool[i] = particle; return; }
    }
    pool.push(particle);
  }

  /**
   * Death particle — mirrors _spawnDeathParticle in emitter.js.
   * Uses the local pool and emitCfg, never touches global particles[].
   */
  function spawnDeathParticle(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = emitCfg.deathSpeed * (0.6 + Math.random() * 0.8);
    const miniCfg = {
      ...emitCfg,
      speed:         spd,
      speedVariance: 0,
      spread:        360,
      direction:     0,
      particleSize:  Math.max(1, emitCfg.deathSize || 2),
      sizeVariance:  0,
      lifetime:      20 + Math.floor(Math.random() * 12),
      fade:          1,
      shrink:        0.6,
      turbulence:    0,
      drag:          0.9,
      bounce:        false,
      velocityDecay: 0,
      deathCount:    0,           // prevent cascade
      _isDeathParticle: true,
    };
    const p = createParticle(x, y, miniCfg);
    p.vx = Math.cos(angle) * spd;
    p.vy = Math.sin(angle) * spd;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].alive) { pool[i] = p; return; }
    }
    pool.push(p);
  }

  // ── Simulation ────────────────────────────────────────────────────────────
  function resetPool() {
    for (const particle of pool) particle.alive = false;
    loopTimer  = 0;
    pulseTimer = 0;
    emitCfg._spawnAccum = 0;
  }

  function liveCountLocal() {
    let count = 0;
    for (const particle of pool) { if (particle.alive) count++; }
    return count;
  }

  function tick() {
    // Update existing particles; collect positions of those that just died
    const deathSparks = (emitCfg.deathCount > 0) ? [] : null;

    for (const particle of pool) {
      if (particle.alive) {
        updateParticle(particle);
        if (!particle.alive && deathSparks && !particle.isDeathParticle) {
          deathSparks.push({ x: particle.x, y: particle.y });
        }
      }
    }

    // Spawn death particles (outside update loop to avoid iterating new entries)
    if (deathSparks) {
      for (const { x, y } of deathSparks) {
        const n = Math.min(emitCfg.deathCount, 8);
        for (let d = 0; d < n; d++) spawnDeathParticle(x, y);
      }
    }

    // Spawn new main particles
    const live = liveCountLocal();
    let toSpawn = 0;

    if (emitCfg.emitterMode === 'continuous') {
      if (live < emitCfg.count) {
        emitCfg._spawnAccum = (emitCfg._spawnAccum || 0) + (emitCfg.spawnRate || 60) / 60;
        toSpawn = Math.min(emitCfg.count - live, Math.floor(emitCfg._spawnAccum));
        emitCfg._spawnAccum -= toSpawn;
      } else {
        emitCfg._spawnAccum = 0;
      }
    } else if (emitCfg.emitterMode === 'burst') {
      if (emitCfg.burstPending) {
        toSpawn = emitCfg.count;
        emitCfg.burstPending = false;
      }
    } else if (emitCfg.emitterMode === 'pulse') {
      pulseTimer++;
      const pulseFrames = Math.max(10, Math.round((emitCfg.pulseInterval || 2) * 60));
      if (pulseTimer >= pulseFrames) {
        pulseTimer = 0;
        toSpawn = emitCfg.count;
      }
    }

    for (let i = 0; i < toSpawn; i++) {
      const [x, y] = spawnPoint();
      spawnParticleToPool(x, y);
    }

    if (emitCfg.loop) {
      loopTimer++;
      const interval = Math.ceil(emitCfg.lifetime * 1.5) + 20;
      if (loopTimer >= interval) {
        resetPool();
        if (emitCfg.emitterMode === 'burst') emitCfg.burstPending = true;
      }
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function drawFrame() {
    frameCtx.globalCompositeOperation = 'source-over';
    frameCtx.globalAlpha = 1;
    if (transparentBg) {
      frameCtx.clearRect(0, 0, frameSize, frameSize);
    } else {
      const { r, g, b } = hexToRgb(bgHex);
      frameCtx.fillStyle = `rgba(${r},${g},${b},${1 - trailAlpha})`;
      frameCtx.fillRect(0, 0, frameSize, frameSize);
    }

    for (const particle of pool) {
      if (particle.alive) drawParticle(frameCtx, particle);
    }
    frameCtx.globalCompositeOperation = 'source-over';
    frameCtx.globalAlpha = 1;
  }

  function clearFrame() {
    frameCtx.globalCompositeOperation = 'source-over';
    frameCtx.globalAlpha = 1;
    if (transparentBg) {
      frameCtx.clearRect(0, 0, frameSize, frameSize);
    } else {
      const { r, g, b } = hexToRgb(bgHex);
      frameCtx.fillStyle = `rgb(${r},${g},${b})`;
      frameCtx.fillRect(0, 0, frameSize, frameSize);
    }
  }

  clearFrame();

  return { canvas: frameCanvas, tick, drawFrame, resetPool };
}

/**
 * Render a sprite sheet PNG from the current emitter settings.
 */
async function startExport(exportCfg, emitCfg) {
  const { frames, frameSize, cols, transparentBg } = exportCfg;
  const rows  = Math.ceil(frames / cols);
  const sheetW = cols * frameSize;
  const sheetH = rows * frameSize;

  const modal       = document.getElementById('export-modal');
  const progressBar = document.getElementById('export-progress-bar');
  const statusEl    = document.getElementById('export-status');
  const resultEl    = document.getElementById('export-result');
  const previewImg  = document.getElementById('export-preview-img');
  const dlLink      = document.getElementById('export-download-link');
  const exportCanvas = document.getElementById('export-canvas');

  modal.classList.remove('hidden');
  resultEl.classList.add('hidden');
  progressBar.style.width = '0%';

  exportCanvas.width = sheetW;
  exportCanvas.height = sheetH;
  const sheetCtx = exportCanvas.getContext('2d');
  sheetCtx.imageSmoothingEnabled = false;
  if (!transparentBg) {
    sheetCtx.fillStyle = '#000000';
    sheetCtx.fillRect(0, 0, sheetW, sheetH);
  } else {
    sheetCtx.clearRect(0, 0, sheetW, sheetH);
  }

  const simCfg = { ...emitCfg, transparentBg };
  if (simCfg.emitterMode === 'burst') simCfg.burstPending = true;

  const sim = createLocalSimulator(simCfg, frameSize);
  // Prime so the simulation is in a steady state before we start capturing.
  // Burst: no prime (fire is instant). Pulse: prime for exactly one interval
  // so the first burst fires right as priming ends and particles are live from
  // frame 0. Continuous: fill the pool (lifetime × 1.5 is enough).
  const primeTicks =
    simCfg.emitterMode === 'burst' ? 0 :
    simCfg.emitterMode === 'pulse' ? Math.round((simCfg.pulseInterval || 2) * 60) :
    Math.round(simCfg.lifetime * 1.5);

  statusEl.textContent = 'Priming simulation...';
  await yieldFrame();
  for (let tick = 0; tick < primeTicks; tick++) sim.tick();

  let tickAccum = 0;

  for (let frame = 0; frame < frames; frame++) {
    tickAccum += Math.max(0.05, simCfg.speedMult || 1);
    const ticksThisFrame = Math.floor(tickAccum);
    tickAccum -= ticksThisFrame;
    for (let tick = 0; tick < ticksThisFrame; tick++) sim.tick();
    sim.drawFrame();

    const col = frame % cols;
    const row = Math.floor(frame / cols);
    sheetCtx.drawImage(sim.canvas, col * frameSize, row * frameSize);

    const pct = Math.round(((frame + 1) / frames) * 100);
    progressBar.style.width = pct + '%';
    statusEl.textContent = `Capturing frame ${frame + 1} / ${frames}`;

    if (frame % 4 === 0) await yieldFrame();
  }

  const dataUrl = exportCanvas.toDataURL('image/png');
  previewImg.src = dataUrl;
  dlLink.href = dataUrl;
  dlLink.download = `pixeldust_sprite_${frameSize}x${frameSize}_${frames}f.png`;
  resultEl.classList.remove('hidden');
  statusEl.textContent = `Done! ${frames} frames at ${frameSize}×${frameSize}px (${cols} cols)`;
}

function yieldFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

/**
 * Capture the effect as an animated GIF.
 */
async function startGifExport(gifCfg, emitCfg) {
  const modal       = document.getElementById('gif-modal');
  const progressBar = document.getElementById('gif-progress-bar');
  const statusEl    = document.getElementById('gif-status');
  const resultEl    = document.getElementById('gif-result');
  const previewImg  = document.getElementById('gif-preview-img');
  const dlLink      = document.getElementById('gif-download-link');

  modal.classList.remove('hidden');
  resultEl.classList.add('hidden');
  progressBar.style.width = '0%';
  statusEl.textContent = 'Preparing...';

  if (typeof GIF === 'undefined') {
    statusEl.textContent = 'Error: gif.js not loaded. Check your internet connection.';
    return;
  }

  const { fps, duration, gifSize } = gifCfg;
  const totalFrames = Math.round(fps * duration);
  const delay       = Math.round(1000 / fps);
  const frameSize   = gifSize || 256;

  const simCfg = { ...emitCfg };
  if (simCfg.emitterMode === 'burst') simCfg.burstPending = true;

  const sim = createLocalSimulator(simCfg, frameSize);
  const primeTicks =
    simCfg.emitterMode === 'burst' ? 0 :
    simCfg.emitterMode === 'pulse' ? Math.round((simCfg.pulseInterval || 2) * 60) :
    Math.round(simCfg.lifetime * 1.5);

  statusEl.textContent = 'Priming simulation...';
  await yieldFrame();
  for (let tick = 0; tick < primeTicks; tick++) sim.tick();

  const gif = new GIF({
    workers:      2,
    quality:      8,
    width:        frameSize,
    height:       frameSize,
    workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js',
  });

  let tickAccum = 0;

  for (let frame = 0; frame < totalFrames; frame++) {
    tickAccum += (60 / fps) * Math.max(0.05, simCfg.speedMult || 1);
    const ticksThisFrame = Math.floor(tickAccum);
    tickAccum -= ticksThisFrame;
    for (let tick = 0; tick < ticksThisFrame; tick++) sim.tick();
    sim.drawFrame();
    gif.addFrame(sim.canvas, { delay, copy: true });

    const pct = Math.round(((frame + 1) / totalFrames) * 80);
    progressBar.style.width = pct + '%';
    statusEl.textContent = `Capturing frame ${frame + 1} / ${totalFrames}`;

    if (frame % 4 === 0) await yieldFrame();
  }

  statusEl.textContent = 'Encoding GIF...';
  progressBar.style.width = '80%';
  await yieldFrame();

  gif.on('progress', progress => {
    progressBar.style.width = `${80 + Math.round(progress * 20)}%`;
  });

  gif.on('finished', blob => {
    const url = URL.createObjectURL(blob);
    previewImg.src = url;
    dlLink.href = url;
    dlLink.download = `pixeldust_${frameSize}px_${fps}fps_${duration}s.gif`;
    progressBar.style.width = '100%';
    statusEl.textContent = `Done! ${totalFrames} frames @ ${fps} fps (${frameSize}×${frameSize})`;
    resultEl.classList.remove('hidden');
  });

  gif.render();
}
