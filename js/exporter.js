/**
 * exporter.js
 * Renders the particle effect offline into a sprite sheet PNG.
 *
 * Strategy:
 *   1. Create an off-screen canvas for each frame at the target frame size.
 *   2. Re-simulate the effect from scratch on a private particle pool.
 *   3. Composite frames into a grid on a final sheet canvas.
 *   4. Offer the result as a downloadable PNG.
 *
 * Because we need consistent, deterministic frames we run our own
 * mini-simulation rather than screenshotting the live canvas.
 */

/**
 * Begin the export process.
 *
 * @param {object} exportCfg  - from UI: { frames, frameSize, cols }
 * @param {object} emitCfg   - snapshot of current emitter config
 */
async function startExport(exportCfg, emitCfg) {
  const { frames, frameSize, cols } = exportCfg;
  const rows = Math.ceil(frames / cols);

  const sheetW = cols     * frameSize;
  const sheetH = rows     * frameSize;

  // Grab DOM refs
  const modal      = document.getElementById('export-modal');
  const progressBar = document.getElementById('export-progress-bar');
  const statusEl   = document.getElementById('export-status');
  const resultEl   = document.getElementById('export-result');
  const previewImg = document.getElementById('export-preview-img');
  const dlLink     = document.getElementById('export-download-link');
  const exportCanvas = document.getElementById('export-canvas');

  // Show modal
  modal.classList.remove('hidden');
  resultEl.classList.add('hidden');
  progressBar.style.width = '0%';

  // ── Setup sheet canvas ───────────────────────────────────────────────────
  exportCanvas.width  = sheetW;
  exportCanvas.height = sheetH;
  const sheetCtx = exportCanvas.getContext('2d');
  sheetCtx.imageSmoothingEnabled = false;

  // Fill with black
  sheetCtx.fillStyle = '#000000';
  sheetCtx.fillRect(0, 0, sheetW, sheetH);

  // ── Setup per-frame off-screen canvas ────────────────────────────────────
  const fc  = document.createElement('canvas');
  fc.width  = frameSize;
  fc.height = frameSize;
  const fctx = fc.getContext('2d');
  fctx.imageSmoothingEnabled = false;

  // ── Local particle pool for the simulation ───────────────────────────────
  // We simulate an effect, capture a frame every N steps, then advance more.
  const pool = [];

  // Scale spawn point to frame size
  const cx = frameSize / 2;
  const cy = frameSize / 2;

  // Determine how many simulation ticks we spread across the total export
  // We simulate (frames * lifetime/2) ticks and sample evenly.
  const totalTicks = frames * Math.max(20, Math.ceil(emitCfg.lifetime / 2));
  const sampleInterval = Math.floor(totalTicks / frames);

  // Prime the simulation for a couple of lifetimes before we start capturing
  const primeTicks = Math.round(emitCfg.lifetime * 1.5);

  // Helper: tick the local pool
  function localTick() {
    // Update existing
    for (const p of pool) { if (p.alive) updateParticle(p); }

    // Spawn
    const live = pool.filter(p => p.alive).length;
    const toSpawn = Math.min(
      Math.max(0, emitCfg.count - live),
      Math.ceil(emitCfg.count / 20)
    );
    for (let i = 0; i < toSpawn; i++) {
      let sx = cx, sy = cy;
      if (emitCfg.emitterShape === 'line') {
        sx = cx - frameSize * 0.2 + Math.random() * frameSize * 0.4;
      } else if (emitCfg.emitterShape === 'circle') {
        const r = Math.min(frameSize, frameSize) * 0.18;
        const a = Math.random() * Math.PI * 2;
        sx = cx + Math.cos(a) * r;
        sy = cy + Math.sin(a) * r;
      }
      const p = createParticle(sx, sy, emitCfg);
      // Reuse dead slot
      let placed = false;
      for (let j = 0; j < pool.length; j++) {
        if (!pool[j].alive) { pool[j] = p; placed = true; break; }
      }
      if (!placed) pool.push(p);
    }
  }

  // Helper: draw pool onto a context
  function drawPool(targetCtx, fSize) {
    // Background
    const { r, g, b } = hexToRgb(emitCfg.bgColor || '#0d0d0f');
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.globalAlpha = 1;
    targetCtx.fillStyle = `rgb(${r},${g},${b})`;
    targetCtx.fillRect(0, 0, fSize, fSize);

    targetCtx.globalCompositeOperation = emitCfg.blendMode || 'source-over';
    for (const p of pool) {
      if (p.alive) drawParticle(targetCtx, p);
    }
    targetCtx.globalCompositeOperation = 'source-over';
  }

  // ── Prime ────────────────────────────────────────────────────────────────
  statusEl.textContent = 'Priming simulation…';
  await yieldFrame();
  for (let t = 0; t < primeTicks; t++) localTick();

  // ── Capture frames ───────────────────────────────────────────────────────
  for (let f = 0; f < frames; f++) {
    // Advance simulation between frames
    for (let t = 0; t < sampleInterval; t++) localTick();

    // Draw frame
    drawPool(fctx, frameSize);

    // Place frame onto sheet
    const col = f % cols;
    const row = Math.floor(f / cols);
    sheetCtx.drawImage(fc, col * frameSize, row * frameSize);

    // UI feedback
    const pct = Math.round(((f + 1) / frames) * 100);
    progressBar.style.width = pct + '%';
    statusEl.textContent = `Capturing frame ${f + 1} / ${frames}`;

    // Yield to browser every 4 frames so the UI stays responsive
    if (f % 4 === 0) await yieldFrame();
  }

  // ── Show result ───────────────────────────────────────────────────────────
  const dataUrl = exportCanvas.toDataURL('image/png');
  previewImg.src = dataUrl;
  dlLink.href    = dataUrl;
  dlLink.download = `pixeldust_sprite_${frameSize}x${frameSize}_${frames}f.png`;
  resultEl.classList.remove('hidden');
  statusEl.textContent = `Done! ${frames} frames at ${frameSize}×${frameSize}px (${cols} cols)`;
}

/** Yield to the browser event loop so the UI can repaint. */
function yieldFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

// ── GIF Export ─────────────────────────────────────────────────────────────

/**
 * Capture N frames from the live simulation and encode as an animated GIF.
 * Uses gif.js (loaded via CDN). Falls back gracefully if not available.
 *
 * @param {object} gifCfg   - { fps, duration }
 * @param {object} emitCfg  - snapshot of current emitter config
 */
async function startGifExport(gifCfg, emitCfg) {
  const modal     = document.getElementById('gif-modal');
  const progressBar = document.getElementById('gif-progress-bar');
  const statusEl  = document.getElementById('gif-status');
  const resultEl  = document.getElementById('gif-result');
  const previewImg = document.getElementById('gif-preview-img');
  const dlLink    = document.getElementById('gif-download-link');

  modal.classList.remove('hidden');
  resultEl.classList.add('hidden');
  progressBar.style.width = '0%';
  statusEl.textContent = 'Preparing…';

  if (typeof GIF === 'undefined') {
    statusEl.textContent = 'Error: gif.js not loaded. Check your internet connection.';
    return;
  }

  const { fps, duration } = gifCfg;
  const totalFrames = Math.round(fps * duration);
  const delay       = Math.round(1000 / fps);

  // Off-screen canvas for rendering export frames
  const frameSize = 256;
  const fc        = document.createElement('canvas');
  fc.width        = frameSize;
  fc.height       = frameSize;
  const fctx      = fc.getContext('2d');
  fctx.imageSmoothingEnabled = false;

  // Local particle pool
  const pool = [];
  const cx   = frameSize / 2;
  const cy   = frameSize / 2;

  function localTick() {
    for (const p of pool) { if (p.alive) updateParticle(p); }
    const live    = pool.filter(p => p.alive).length;
    const toSpawn = Math.min(
      Math.max(0, emitCfg.count - live),
      Math.max(1, Math.round((emitCfg.spawnRate || 60) / 60))
    );
    for (let i = 0; i < toSpawn; i++) {
      let sx = cx, sy = cy;
      if (emitCfg.emitterShape === 'line') {
        sx = cx - frameSize * 0.2 + Math.random() * frameSize * 0.4;
      } else if (emitCfg.emitterShape === 'circle') {
        const r = frameSize * 0.18;
        const a = Math.random() * Math.PI * 2;
        sx = cx + Math.cos(a) * r;
        sy = cy + Math.sin(a) * r;
      }
      const p = createParticle(sx, sy, emitCfg);
      let placed = false;
      for (let j = 0; j < pool.length; j++) {
        if (!pool[j].alive) { pool[j] = p; placed = true; break; }
      }
      if (!placed) pool.push(p);
    }
  }

  function drawPool() {
    const { r, g, b } = hexToRgb(emitCfg.bgColor || '#0d0d0f');
    fctx.globalCompositeOperation = 'source-over';
    fctx.globalAlpha = 1;
    fctx.fillStyle = `rgb(${r},${g},${b})`;
    fctx.fillRect(0, 0, frameSize, frameSize);
    fctx.globalCompositeOperation = emitCfg.blendMode || 'source-over';
    for (const p of pool) { if (p.alive) drawParticle(fctx, p); }
    fctx.globalCompositeOperation = 'source-over';
  }

  // Prime simulation
  const primeTicks = Math.round(emitCfg.lifetime * 1.5);
  statusEl.textContent = 'Priming simulation…';
  await yieldFrame();
  for (let t = 0; t < primeTicks; t++) localTick();

  // Set up GIF encoder
  const gif = new GIF({
    workers:      2,
    quality:      8,
    width:        frameSize,
    height:       frameSize,
    workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js',
  });

  // Advance by (60/fps) ticks between frames so timing is correct
  const ticksPerFrame = Math.max(1, Math.round(60 / fps));

  for (let f = 0; f < totalFrames; f++) {
    for (let t = 0; t < ticksPerFrame; t++) localTick();
    drawPool();
    gif.addFrame(fc, { delay, copy: true });

    const pct = Math.round(((f + 1) / totalFrames) * 80);
    progressBar.style.width = pct + '%';
    statusEl.textContent = `Capturing frame ${f + 1} / ${totalFrames}`;
    if (f % 4 === 0) await yieldFrame();
  }

  statusEl.textContent = 'Encoding GIF… (this may take a moment)';
  progressBar.style.width = '80%';
  await yieldFrame();

  gif.on('progress', p => {
    progressBar.style.width = (80 + Math.round(p * 20)) + '%';
  });

  gif.on('finished', blob => {
    const url = URL.createObjectURL(blob);
    previewImg.src        = url;
    dlLink.href           = url;
    dlLink.download       = `pixeldust_${fps}fps_${duration}s.gif`;
    progressBar.style.width = '100%';
    statusEl.textContent  = `Done! ${totalFrames} frames @ ${fps} fps`;
    resultEl.classList.remove('hidden');
  });

  gif.render();
}
