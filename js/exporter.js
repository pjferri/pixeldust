/**
 * exporter.js
 * Offline PNG and GIF export that mirrors the live simulation closely.
 *
 * v0.1.0: death particle simulation in local simulator; emitterSize/Angle support
 */


/* ════════════════════════════════════════════════════════════════════
   UNIFIED RENDER & EXPORT PIPELINE
   ════════════════════════════════════════════════════════════════════
   Workflow:
   1. User clicks Render → captureFrames() runs the offline simulator
      and stores an array of ImageData frames.
   2. The Render Result modal shows an animated preview with playback
      controls (play/pause, scrubber, speed, loop, reverse).
   3. User picks an export format (PNG Spritesheet, GIF, PNG ZIP)
      and clicks Export → the appropriate encoder runs.
   ════════════════════════════════════════════════════════════════════ */

/** Captured frame data — stored globally so export can use it */
let _capturedFrames = [];   // Array of ImageData
let _capturedSize   = 128;  // pixel width/height of each frame
let _capturedFps    = 15;   // fps used for playback & GIF timing
let _capturedTransparent = false;

/** Preview animation state */
let _previewPlaying = false;
let _previewFrame   = 0;
let _previewSpeed   = 1;
let _previewLoop    = true;
let _previewReverse = false;
let _previewRaf     = null;
let _previewLastT   = 0;

function yieldFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

/* ──────────────────────────────────────────────────────────────────
   PHASE 1: CAPTURE FRAMES
   ────────────────────────────────────────────────────────────────── */

async function captureFrames(renderCfg, emitCfg) {
  const { frames, frameSize, fps, transparentBg } = renderCfg;

  const modal       = document.getElementById('render-modal');
  const progressPhase = document.getElementById('render-progress-phase');
  const resultPhase = document.getElementById('render-result');
  const progressBar = document.getElementById('render-progress-bar');
  const statusEl    = document.getElementById('render-status');

  // Show modal in progress mode
  modal.classList.remove('hidden');
  progressPhase.classList.remove('hidden');
  resultPhase.classList.add('hidden');
  progressBar.style.width = '0%';
  statusEl.textContent = 'Preparing\u2026';

  _capturedFrames = [];
  _capturedSize   = frameSize;
  _capturedFps    = fps;
  _capturedTransparent = transparentBg;

  // Create local simulator
  const simCfg = { ...emitCfg, transparentBg };
  if (simCfg.emitterMode === 'burst') simCfg.burstPending = true;

  const sim = createLocalSimulator(simCfg, frameSize);

  // Start from a clean state (equivalent to hitting Reset)
  // For continuous mode: prime just enough to fill the pool so the first
  // frame isn't empty. For burst: fire immediately. For pulse: fire one burst.
  sim.resetPool();
  if (simCfg.emitterMode === 'burst') {
    simCfg.burstPending = true;
  }

  statusEl.textContent = 'Priming simulation\u2026';
  await yieldFrame();

  // Prime: run enough ticks to get a visually interesting first frame
  // but NOT a full steady-state prime (user wants to see the animation build up)
  const primeTicks =
    simCfg.emitterMode === 'burst' ? 0 :
    simCfg.emitterMode === 'pulse' ? 0 :  // start fresh, first pulse fires at frame 0
    Math.min(Math.round(simCfg.lifetime * 0.3), 30);  // just a few ticks so pool isn't empty

  for (let tick = 0; tick < primeTicks; tick++) sim.tick();

  // Capture frames
  // We want each rendered frame to represent 1/fps seconds of simulation.
  // The simulator runs at 60 ticks/sec internally, so each frame needs
  // (60/fps) * speedMult ticks.
  const ticksPerFrame = (60 / fps) * Math.max(0.05, simCfg.speedMult || 1);
  let tickAccum = 0;

  // Create a temporary canvas to read ImageData from
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = frameSize;
  tempCanvas.height = frameSize;
  const tempCtx = tempCanvas.getContext('2d');

  for (let frame = 0; frame < frames; frame++) {
    tickAccum += ticksPerFrame;
    const ticksThisFrame = Math.floor(tickAccum);
    tickAccum -= ticksThisFrame;
    for (let t = 0; t < ticksThisFrame; t++) sim.tick();
    sim.drawFrame();

    // Store frame as ImageData
    tempCtx.clearRect(0, 0, frameSize, frameSize);
    tempCtx.drawImage(sim.canvas, 0, 0);
    const imgData = tempCtx.getImageData(0, 0, frameSize, frameSize);
    _capturedFrames.push(imgData);

    const pct = Math.round(((frame + 1) / frames) * 100);
    progressBar.style.width = pct + '%';
    statusEl.textContent = `Capturing frame ${frame + 1} / ${frames}`;

    if (frame % 4 === 0) await yieldFrame();
  }

  // Switch to result view
  progressPhase.classList.add('hidden');
  resultPhase.classList.remove('hidden');

  // Update info
  document.getElementById('render-info-frames').textContent =
    `${frames} frames @ ${fps} fps`;
  document.getElementById('render-info-size').textContent =
    `${frameSize}\u00d7${frameSize}px`;

  // Setup preview canvas
  const previewCanvas = document.getElementById('render-preview-canvas');
  previewCanvas.width  = frameSize;
  previewCanvas.height = frameSize;

  // Setup scrubber
  const scrubber = document.getElementById('render-scrubber');
  scrubber.max   = frames - 1;
  scrubber.value = 0;

  // Reset encode progress
  document.getElementById('render-encode-progress').classList.add('hidden');

  // Setup export format visibility
  updateExportFormatUI();

  // Draw first frame and start playback
  _previewFrame = 0;
  drawPreviewFrame(0);
  startPreviewPlayback();
}


/* ──────────────────────────────────────────────────────────────────
   PHASE 2: ANIMATED PREVIEW WITH PLAYBACK
   ────────────────────────────────────────────────────────────────── */

function drawPreviewFrame(idx) {
  if (!_capturedFrames.length) return;
  idx = Math.max(0, Math.min(idx, _capturedFrames.length - 1));

  const canvas = document.getElementById('render-preview-canvas');
  const ctx = canvas.getContext('2d');
  ctx.putImageData(_capturedFrames[idx], 0, 0);

  // Update scrubber & frame counter
  document.getElementById('render-scrubber').value = idx;
  document.getElementById('render-frame-num').textContent =
    `${idx + 1} / ${_capturedFrames.length}`;
}

function startPreviewPlayback() {
  if (_previewPlaying) return;
  _previewPlaying = true;
  _previewLastT = performance.now();
  document.getElementById('render-play-btn').innerHTML = '&#10074;&#10074;';
  _previewRaf = requestAnimationFrame(previewLoop);
}

function stopPreviewPlayback() {
  _previewPlaying = false;
  document.getElementById('render-play-btn').innerHTML = '&#9654;';
  if (_previewRaf) {
    cancelAnimationFrame(_previewRaf);
    _previewRaf = null;
  }
}

function previewLoop(now) {
  if (!_previewPlaying || !_capturedFrames.length) return;

  const dt = now - _previewLastT;
  const frameInterval = 1000 / (_capturedFps * _previewSpeed);

  if (dt >= frameInterval) {
    _previewLastT = now - (dt % frameInterval);

    const total = _capturedFrames.length;
    if (_previewReverse) {
      _previewFrame--;
      if (_previewFrame < 0) {
        if (_previewLoop) {
          _previewFrame = total - 1;
        } else {
          _previewFrame = 0;
          stopPreviewPlayback();
          return;
        }
      }
    } else {
      _previewFrame++;
      if (_previewFrame >= total) {
        if (_previewLoop) {
          _previewFrame = 0;
        } else {
          _previewFrame = total - 1;
          stopPreviewPlayback();
          return;
        }
      }
    }
    drawPreviewFrame(_previewFrame);
  }

  _previewRaf = requestAnimationFrame(previewLoop);
}


/* ──────────────────────────────────────────────────────────────────
   PHASE 3: EXPORT FUNCTIONS
   ────────────────────────────────────────────────────────────────── */

function updateExportFormatUI() {
  const fmt = document.getElementById('render-export-format').value;
  document.getElementById('render-sheet-opts').classList.toggle('hidden', fmt !== 'spritesheet');
  document.getElementById('render-gif-opts').classList.toggle('hidden', fmt !== 'gif');
  document.getElementById('render-frame-opts').classList.toggle('hidden', fmt !== 'frame');
  document.getElementById('render-mp4-opts').classList.toggle('hidden', fmt !== 'mp4');

  // Hide spritesheet preview when switching away from spritesheet
  const sheetPreview = document.getElementById('spritesheet-preview-wrap');
  if (fmt !== 'spritesheet') sheetPreview.classList.add('hidden');
}

/** Export: PNG Spritesheet */
async function exportSpritesheet() {
  const frames    = _capturedFrames;
  const frameSize = _capturedSize;
  const cols      = parseInt(document.getElementById('render-cols').value, 10) || 4;
  const rows      = Math.ceil(frames.length / cols);
  const sheetW    = cols * frameSize;
  const sheetH    = rows * frameSize;

  const exportCanvas = document.getElementById('export-canvas');
  exportCanvas.width  = sheetW;
  exportCanvas.height = sheetH;
  const ctx = exportCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  if (!_capturedTransparent) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, sheetW, sheetH);
  } else {
    ctx.clearRect(0, 0, sheetW, sheetH);
  }

  // Draw each frame into the grid
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width  = frameSize;
  tempCanvas.height = frameSize;
  const tempCtx = tempCanvas.getContext('2d');

  for (let i = 0; i < frames.length; i++) {
    tempCtx.putImageData(frames[i], 0, 0);
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.drawImage(tempCanvas, col * frameSize, row * frameSize);
  }

  const dataUrl = exportCanvas.toDataURL('image/png');

  // Show preview
  const previewWrap = document.getElementById('spritesheet-preview-wrap');
  const previewImg  = document.getElementById('spritesheet-preview-img');
  previewImg.src = dataUrl;
  previewWrap.classList.remove('hidden');

  const baseName = `pixeldust_sprite_${frameSize}x${frameSize}_${frames.length}f`;
  triggerDownload(dataUrl, `${baseName}.png`);

  // Companion JSON metadata (frame rects + timing) so the sheet can be
  // dropped straight into game engines / animation tools.
  const meta = {
    image:           `${baseName}.png`,
    frameWidth:      frameSize,
    frameHeight:     frameSize,
    frameCount:      frames.length,
    columns:         cols,
    rows:            rows,
    fps:             _capturedFps,
    frameDurationMs: Math.round(1000 / _capturedFps),
    frames: frames.map((_, i) => ({
      index: i,
      x: (i % cols) * frameSize,
      y: Math.floor(i / cols) * frameSize,
      w: frameSize,
      h: frameSize,
    })),
  };
  const metaBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
  const metaUrl  = URL.createObjectURL(metaBlob);
  triggerDownload(metaUrl, `${baseName}.json`);
  setTimeout(() => URL.revokeObjectURL(metaUrl), 2000);
}

/** Export: Animated GIF */
async function exportGif() {
  if (typeof GIF === 'undefined') {
    alert('gif.js library not loaded. Check your internet connection.');
    return;
  }

  const encodeProgress = document.getElementById('render-encode-progress');
  const encodeBar      = document.getElementById('render-encode-bar');
  const encodeStatus   = document.getElementById('render-encode-status');

  encodeProgress.classList.remove('hidden');
  encodeBar.style.width = '0%';
  encodeStatus.textContent = 'Building GIF frames\u2026';

  const frameSize = _capturedSize;
  const fps       = _capturedFps;
  const delay     = Math.round(1000 / fps);
  const quality   = parseInt(document.getElementById('render-gif-quality').value, 10) || 8;

  // Fetch the worker script as a blob to avoid CORS issues
  let workerBlobUrl;
  try {
    const resp = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js');
    const workerText = await resp.text();
    const blob = new Blob([workerText], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
  } catch (e) {
    encodeStatus.textContent = 'Error: Could not load GIF worker. Check internet connection.';
    return;
  }

  const gif = new GIF({
    workers:      2,
    quality:      quality,
    width:        frameSize,
    height:       frameSize,
    workerScript: workerBlobUrl,
    transparent:  _capturedTransparent ? 0x00000000 : null,
  });

  // Add captured frames
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width  = frameSize;
  tempCanvas.height = frameSize;
  const tempCtx = tempCanvas.getContext('2d');

  for (let i = 0; i < _capturedFrames.length; i++) {
    tempCtx.putImageData(_capturedFrames[i], 0, 0);
    gif.addFrame(tempCtx, { delay, copy: true });

    const pct = Math.round(((i + 1) / _capturedFrames.length) * 50);
    encodeBar.style.width = pct + '%';

    if (i % 8 === 0) await yieldFrame();
  }

  encodeStatus.textContent = 'Encoding GIF (this may take a moment)\u2026';
  encodeBar.style.width = '50%';
  await yieldFrame();

  return new Promise((resolve) => {
    gif.on('progress', progress => {
      encodeBar.style.width = `${50 + Math.round(progress * 50)}%`;
    });

    gif.on('finished', blob => {
      const url = URL.createObjectURL(blob);
      encodeBar.style.width = '100%';
      encodeStatus.textContent = `GIF encoded! ${_capturedFrames.length} frames @ ${fps} fps`;

      triggerDownload(url, `pixeldust_${frameSize}px_${fps}fps.gif`);

      // Clean up after a brief delay so download starts
      setTimeout(() => {
        encodeProgress.classList.add('hidden');
        URL.revokeObjectURL(url);
        URL.revokeObjectURL(workerBlobUrl);
      }, 2000);

      resolve();
    });

    gif.render();
  });
}

/** Export: Single Frame as PNG */
async function exportSingleFrame() {
  const frameSize = _capturedSize;
  const idx = _previewFrame;
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width  = frameSize;
  tempCanvas.height = frameSize;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(_capturedFrames[idx], 0, 0);

  const dataUrl = tempCanvas.toDataURL('image/png');
  triggerDownload(dataUrl, `pixeldust_frame${idx}_${frameSize}px.png`);
}

/** Export: MP4 Video using MediaRecorder + canvas */
async function exportMP4() {
  const encodeProgress = document.getElementById('render-encode-progress');
  const encodeBar      = document.getElementById('render-encode-bar');
  const encodeStatus   = document.getElementById('render-encode-status');

  encodeProgress.classList.remove('hidden');
  encodeBar.style.width = '0%';
  encodeStatus.textContent = 'Encoding MP4\u2026';

  const frameSize = _capturedSize;
  const fps       = _capturedFps;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width  = frameSize;
  tempCanvas.height = frameSize;
  const tempCtx = tempCanvas.getContext('2d');

  // Use MediaRecorder to create a webm/mp4
  const stream = tempCanvas.captureStream(0); // 0 = manual frame control
  const track = stream.getVideoTracks()[0];
  
  // Try mp4 first, fall back to webm
  let mimeType = 'video/webm;codecs=vp9';
  let fileExt = 'webm';
  if (MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4';
    fileExt = 'mp4';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
    mimeType = 'video/webm;codecs=vp9';
    fileExt = 'webm';
  } else if (MediaRecorder.isTypeSupported('video/webm')) {
    mimeType = 'video/webm';
    fileExt = 'webm';
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4000000,
  });

  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise(resolve => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      encodeBar.style.width = '100%';
      encodeStatus.textContent = `Video encoded! ${_capturedFrames.length} frames @ ${fps} fps`;

      triggerDownload(url, `pixeldust_${frameSize}px_${fps}fps.${fileExt}`);

      setTimeout(() => {
        encodeProgress.classList.add('hidden');
        URL.revokeObjectURL(url);
      }, 2000);
      resolve();
    };

    recorder.start();

    // Feed frames at correct timing
    const frameDelay = 1000 / fps;
    let frameIdx = 0;

    function feedNextFrame() {
      if (frameIdx >= _capturedFrames.length) {
        recorder.stop();
        return;
      }

      tempCtx.putImageData(_capturedFrames[frameIdx], 0, 0);
      // Request a frame from the captureStream
      if (track.requestFrame) track.requestFrame();

      const pct = Math.round(((frameIdx + 1) / _capturedFrames.length) * 100);
      encodeBar.style.width = pct + '%';

      frameIdx++;
      setTimeout(feedNextFrame, frameDelay);
    }

    feedNextFrame();
  });
}


/* ──────────────────────────────────────────────────────────────────
   UTILITY
   ────────────────────────────────────────────────────────────────── */

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function closeRenderModal() {
  stopPreviewPlayback();
  document.getElementById('render-modal').classList.add('hidden');
  _capturedFrames = [];  // free memory
}

function runExport() {
  const fmt = document.getElementById('render-export-format').value;
  switch (fmt) {
    case 'spritesheet': return exportSpritesheet();
    case 'gif':         return exportGif();
    case 'mp4':         return exportMP4();
    case 'frame':       return exportSingleFrame();
  }
}

// Override the older snapshot-redraw exporter trail simulator with the same
// incremental trail compositor used by the live renderer.
function createLocalSimulator(emitCfg, frameSize) {
  const pool = [];
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = frameSize;
  frameCanvas.height = frameSize;

  const frameCtx = frameCanvas.getContext('2d');
  frameCtx.imageSmoothingEnabled = false;

  const emitPX = Number.isFinite(emitCfg._emitterPX) ? emitCfg._emitterPX : 0.5;
  const emitPY = Number.isFinite(emitCfg._emitterPY) ? emitCfg._emitterPY : 0.5;
  const centerX = Math.round(frameSize * emitPX);
  const centerY = Math.round(frameSize * emitPY);
  let loopTimer = 0;
  let pulseTimer = 0;

  const trailAlpha = Number.isFinite(emitCfg.trailAlpha) ? emitCfg.trailAlpha : 0.12;
  const bgHex = emitCfg.bgColor || '#0c0c0e';
  const transparentBg = !!emitCfg.transparentBg;

  const trailEnabled = emitCfg.trailEnabled !== undefined ? !!emitCfg.trailEnabled : (trailAlpha > 0);
  const trailPersistence = emitCfg.trailPersistence !== undefined ? emitCfg.trailPersistence : Math.round(trailAlpha * 100);
  const trailOpacity = emitCfg.trailOpacity !== undefined ? emitCfg.trailOpacity : 100;
  const trailSoftness = emitCfg.trailSoftness !== undefined ? emitCfg.trailSoftness : 0;

  const trailCanvas = document.createElement('canvas');
  trailCanvas.width = frameSize;
  trailCanvas.height = frameSize;
  const trailCtx = trailCanvas.getContext('2d');
  trailCtx.imageSmoothingEnabled = false;

  let trailFrame = 0;
  let trailSweepCounter = 0;

  function persistenceToLifetimeFrames(p) {
    if (p >= 100) return Infinity;
    if (p <= 0) return 0;
    const t = p / 100;
    return Math.round(3 + Math.pow(t, 2.2) * 360);
  }

  function trailFadeAlphaForLifetime(lifetime) {
    if (!Number.isFinite(lifetime)) return 0;
    if (lifetime <= 0) return 1;
    const targetAlpha = 1 / 255;
    return Math.max(0, Math.min(1, 1 - Math.pow(targetAlpha, 1 / Math.max(1, lifetime))));
  }

  function resolveParticleDisplayColor(p) {
    let drawR = p.r;
    let drawG = p.g;
    let drawB = p.b;

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

    return { r: drawR, g: drawG, b: drawB };
  }

  function drawTrailParticle(ctx, p) {
    const alpha = Math.max(0, Math.min(1, p.alpha));
    if (alpha <= 0.002 || p.size <= 0.2) return;
    const color = resolveParticleDisplayColor(p);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
    drawParticleShape(ctx, p.shape, Math.round(p.x), Math.round(p.y), Math.max(1, Math.round(p.size)));
  }

  function clearTransparentTrailPixels() {
    const img = trailCtx.getImageData(0, 0, frameSize, frameSize);
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
    if (dirty) trailCtx.putImageData(img, 0, 0);
  }

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

  function spawnPoint() {
    const size = Math.max(1, emitCfg.emitterSize || 18);
    const radialSize = frameSize * (size / 100);
    switch (emitCfg.emitterShape) {
      case 'line': {
        const hw = frameSize * (size / 100);
        const angle = ((emitCfg.emitterAngle || 0) * Math.PI) / 180;
        const t = (Math.random() * 2 - 1) * hw;
        return [centerX + t * Math.cos(angle), centerY + t * Math.sin(angle)];
      }
      case 'circle': {
        const a = Math.random() * Math.PI * 2;
        return [centerX + Math.cos(a) * radialSize, centerY + Math.sin(a) * radialSize];
      }
      case 'disk': {
        const radius = radialSize * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        return [centerX + Math.cos(a) * radius, centerY + Math.sin(a) * radius];
      }
      case 'square': {
        const angle = ((emitCfg.emitterAngle || 0) * Math.PI) / 180;
        const dx = (Math.random() * 2 - 1) * radialSize;
        const dy = (Math.random() * 2 - 1) * radialSize;
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

  function spawnParticleToPool(x, y) {
    const particle = createParticle(x, y, emitCfg);
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].alive) { pool[i] = particle; return; }
    }
    pool.push(particle);
  }

  function spawnDeathParticle(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const spd = emitCfg.deathSpeed * (0.6 + Math.random() * 0.8);
    const miniCfg = {
      ...emitCfg,
      speed: spd,
      speedVariance: 0,
      spread: 360,
      direction: 0,
      particleSize: Math.max(1, emitCfg.deathSize || 2),
      sizeVariance: 0,
      lifetime: 20 + Math.floor(Math.random() * 12),
      fade: 1,
      shrink: 0.6,
      turbulence: 0,
      drag: 0.9,
      bounce: false,
      velocityDecay: 0,
      deathCount: 0,
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

  function resetPool() {
    for (const particle of pool) particle.alive = false;
    loopTimer = 0;
    pulseTimer = 0;
    emitCfg._spawnAccum = 0;
    trailFrame = 0;
    trailSweepCounter = 0;
    trailCtx.clearRect(0, 0, frameSize, frameSize);
  }

  function liveCountLocal() {
    let count = 0;
    for (const particle of pool) {
      if (particle.alive) count++;
    }
    return count;
  }

  function tick() {
    const deathSparks = emitCfg.deathCount > 0 ? [] : null;

    for (const particle of pool) {
      if (particle.alive) {
        updateParticle(particle);
        if (!particle.alive && deathSparks && !particle.isDeathParticle) {
          deathSparks.push({ x: particle.x, y: particle.y });
        }
      }
    }

    if (deathSparks) {
      for (const { x, y } of deathSparks) {
        const n = Math.min(emitCfg.deathCount, 8);
        for (let d = 0; d < n; d++) spawnDeathParticle(x, y);
      }
    }

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

  function drawFrame() {
    frameCtx.globalCompositeOperation = 'source-over';
    frameCtx.globalAlpha = 1;
    if (transparentBg) {
      frameCtx.clearRect(0, 0, frameSize, frameSize);
    } else {
      const { r, g, b } = hexToRgb(bgHex);
      frameCtx.fillStyle = `rgb(${r},${g},${b})`;
      frameCtx.fillRect(0, 0, frameSize, frameSize);
    }

    if (trailEnabled && trailPersistence > 0 && trailOpacity > 0) {
      trailFrame++;
      const lifetime = persistenceToLifetimeFrames(trailPersistence);
      if (lifetime !== Infinity) {
        const fadeAlpha = trailFadeAlphaForLifetime(lifetime);
        if (fadeAlpha >= 1) {
          trailCtx.clearRect(0, 0, frameSize, frameSize);
        } else if (fadeAlpha > 0) {
          trailCtx.save();
          trailCtx.globalCompositeOperation = 'destination-out';
          trailCtx.globalAlpha = fadeAlpha;
          trailCtx.fillStyle = '#000';
          trailCtx.fillRect(0, 0, frameSize, frameSize);
          trailCtx.restore();

          trailSweepCounter++;
          if (trailSweepCounter >= 24) {
            trailSweepCounter = 0;
            clearTransparentTrailPixels();
          }
        }
      }

      trailCtx.save();
      trailCtx.globalCompositeOperation = 'source-over';
      for (const particle of pool) {
        if (particle.alive) drawTrailParticle(trailCtx, particle);
      }
      trailCtx.restore();

      frameCtx.save();
      frameCtx.globalAlpha = Math.max(0, Math.min(1, trailOpacity / 100));
      if (trailSoftness > 0) {
        const blurPx = (trailSoftness / 100) * 3;
        frameCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
      }
      frameCtx.drawImage(trailCanvas, 0, 0);
      frameCtx.restore();
    } else {
      trailCtx.clearRect(0, 0, frameSize, frameSize);
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
