/**
 * exporter.js
 * Offline PNG and GIF export that mirrors the live simulation closely.
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
  let loopTimer = 0;

  const trailAlpha = Number.isFinite(emitCfg.trailAlpha) ? emitCfg.trailAlpha : 0.12;
  const bgHex = emitCfg.bgColor || '#0c0c0e';
  const transparentBg = !!emitCfg.transparentBg;

  function spawnPoint() {
    switch (emitCfg.emitterShape) {
      case 'line': {
        const halfWidth = frameSize * 0.18;
        return [centerX - halfWidth + Math.random() * halfWidth * 2, centerY];
      }
      case 'circle': {
        const radius = frameSize * 0.16;
        const angle = Math.random() * Math.PI * 2;
        return [centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius];
      }
      default:
        return [centerX, centerY];
    }
  }

  function spawnParticleToPool(x, y) {
    const particle = createParticle(x, y, emitCfg);
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].alive) {
        pool[i] = particle;
        return;
      }
    }
    pool.push(particle);
  }

  function resetPool() {
    for (const particle of pool) particle.alive = false;
    loopTimer = 0;
  }

  function liveCountLocal() {
    let count = 0;
    for (const particle of pool) {
      if (particle.alive) count++;
    }
    return count;
  }

  function tick() {
    for (const particle of pool) {
      if (particle.alive) updateParticle(particle);
    }

    const live = liveCountLocal();
    let toSpawn = 0;

    if (emitCfg.emitterMode === 'continuous' || emitCfg.emitterMode === 'trail') {
      if (live < emitCfg.count) {
        toSpawn = Math.min(
          emitCfg.count - live,
          Math.max(1, Math.round((emitCfg.spawnRate || 60) / 60))
        );
      }
    } else if (emitCfg.emitterMode === 'burst') {
      if (emitCfg.burstPending) {
        toSpawn = emitCfg.count;
        emitCfg.burstPending = false;
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

  return {
    canvas: frameCanvas,
    tick,
    drawFrame,
    resetPool,
  };
}

/**
 * Render a sprite sheet PNG from the current emitter settings.
 */
async function startExport(exportCfg, emitCfg) {
  const { frames, frameSize, cols, transparentBg } = exportCfg;
  const rows = Math.ceil(frames / cols);
  const sheetW = cols * frameSize;
  const sheetH = rows * frameSize;

  const modal = document.getElementById('export-modal');
  const progressBar = document.getElementById('export-progress-bar');
  const statusEl = document.getElementById('export-status');
  const resultEl = document.getElementById('export-result');
  const previewImg = document.getElementById('export-preview-img');
  const dlLink = document.getElementById('export-download-link');
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
  const primeTicks = simCfg.emitterMode === 'burst' ? 0 : Math.round(simCfg.lifetime * 1.5);

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
  statusEl.textContent = `Done! ${frames} frames at ${frameSize}x${frameSize}px (${cols} cols)`;
}

function yieldFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

/**
 * Capture the effect as an animated GIF.
 */
async function startGifExport(gifCfg, emitCfg) {
  const modal = document.getElementById('gif-modal');
  const progressBar = document.getElementById('gif-progress-bar');
  const statusEl = document.getElementById('gif-status');
  const resultEl = document.getElementById('gif-result');
  const previewImg = document.getElementById('gif-preview-img');
  const dlLink = document.getElementById('gif-download-link');

  modal.classList.remove('hidden');
  resultEl.classList.add('hidden');
  progressBar.style.width = '0%';
  statusEl.textContent = 'Preparing...';

  if (typeof GIF === 'undefined') {
    statusEl.textContent = 'Error: gif.js not loaded. Check your internet connection.';
    return;
  }

  const { fps, duration } = gifCfg;
  const totalFrames = Math.round(fps * duration);
  const delay = Math.round(1000 / fps);
  const frameSize = 256;

  const simCfg = { ...emitCfg };
  if (simCfg.emitterMode === 'burst') simCfg.burstPending = true;

  const sim = createLocalSimulator(simCfg, frameSize);
  const primeTicks = simCfg.emitterMode === 'burst' ? 0 : Math.round(simCfg.lifetime * 1.5);

  statusEl.textContent = 'Priming simulation...';
  await yieldFrame();
  for (let tick = 0; tick < primeTicks; tick++) sim.tick();

  const gif = new GIF({
    workers: 2,
    quality: 8,
    width: frameSize,
    height: frameSize,
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
    dlLink.download = `pixeldust_${fps}fps_${duration}s.gif`;
    progressBar.style.width = '100%';
    statusEl.textContent = `Done! ${totalFrames} frames @ ${fps} fps`;
    resultEl.classList.remove('hidden');
  });

  gif.render();
}
