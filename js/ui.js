/**
 * ui.js
 * Wires all DOM controls to the emitter/renderer state.
 * Covers all v0.2 features: gradient, turbulence, loop, drag emitter.
 */

// ── Slider display sync ────────────────────────────────────────────────────

function initSliderDisplays() {
  document.querySelectorAll('.val-display').forEach(display => {
    const id     = display.dataset.for;
    const slider = document.getElementById(id);
    if (!slider) return;
    const update = () => {
      const v = parseFloat(slider.value);
      display.textContent = Number.isInteger(v) ? v : v.toFixed(2);
    };
    slider.addEventListener('input', update);
    update();
  });
}

// ── Palette grid ───────────────────────────────────────────────────────────

function buildPaletteGrid(colors) {
  const grid = document.getElementById('palette-grid');
  grid.innerHTML = '';
  colors.forEach(hex => {
    const div = document.createElement('div');
    div.className        = 'pal-swatch';
    div.style.background = hex;
    div.title            = hex;
    div.addEventListener('click', () => {
      setSingleColor(hex);
      grid.querySelectorAll('.pal-swatch').forEach(s => s.classList.remove('active'));
      div.classList.add('active');
      pushConfig();
    });
    grid.appendChild(div);
  });
  const first = grid.querySelector('.pal-swatch');
  if (first) first.classList.add('active');
}

function setSingleColor(hex) {
  activeColor = hex;
  document.getElementById('color-picker').value                  = hex;
  document.getElementById('swatch-current-color').style.background = hex;
  document.getElementById('swatch-hex').textContent              = hex;
}

// ── initUI ─────────────────────────────────────────────────────────────────

function initUI() {
  initSliderDisplays();
  applyPreset('fire');   // fire preset + multi-color on startup

  // ── Palette presets ───────────────────────────────────────────────────
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  // ── Single colour picker ──────────────────────────────────────────────
  document.getElementById('color-picker').addEventListener('input', e => {
    setSingleColor(e.target.value);
    pushConfig();
  });

  // ── Multi-colour toggle ───────────────────────────────────────────────
  document.getElementById('multi-color').addEventListener('change', pushConfig);

  // ── BG colour ─────────────────────────────────────────────────────────
  document.getElementById('bg-color').addEventListener('input', e => {
    setRendererBg(e.target.value);
    pushConfig();
  });

  // ── Trail alpha ───────────────────────────────────────────────────────
  document.getElementById('trail-alpha').addEventListener('input', e => {
    setTrailAlpha(parseFloat(e.target.value));
  });

  // ── Blend mode ────────────────────────────────────────────────────────
  document.getElementById('blend-mode').addEventListener('change', e => {
    setBlendMode(e.target.value);
    pushConfig();
  });

  // ── Feature 2: Gradient ───────────────────────────────────────────────
  const useGradientEl    = document.getElementById('use-gradient');
  const gradientPickersEl = document.getElementById('gradient-pickers');

  useGradientEl.addEventListener('change', () => {
    gradientPickersEl.classList.toggle('hidden', !useGradientEl.checked);
    pushConfig();
  });

  document.getElementById('gradient-start').addEventListener('input', pushConfig);
  document.getElementById('gradient-end').addEventListener('input',   pushConfig);

  // ── Feature 3: Turbulence ─────────────────────────────────────────────
  // Wired below in the directControls loop.

  // ── Feature 5: Loop toggle ────────────────────────────────────────────
  document.getElementById('loop-toggle').addEventListener('change', pushConfig);

  // ── Emitter mode / burst ──────────────────────────────────────────────
  document.getElementById('emitter-mode').addEventListener('change', () => {
    updateBurstRowVisibility();
    pushConfig();
  });
  document.getElementById('btn-burst').addEventListener('click', () => {
    cfg.burstPending = true;
  });

  // ── All slider/select controls → emitter config ───────────────────────
  const directControls = [
    'emitter-shape',
    'particle-count', 'spawn-rate', 'speed', 'spread', 'direction', 'gravity', 'turbulence',
    'particle-size', 'particle-shape', 'start-alpha',
    'lifetime', 'fade', 'shrink',
  ];
  directControls.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',  pushConfig);
    el.addEventListener('change', pushConfig);
  });

  // ── Export ────────────────────────────────────────────────────────────
  document.getElementById('btn-export').addEventListener('click',        triggerExport);
  document.getElementById('btn-export-bottom').addEventListener('click', triggerExport);
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('export-modal').classList.add('hidden');
  });

  // ── GIF Export ────────────────────────────────────────────────────────
  document.getElementById('btn-export-gif-top').addEventListener('click', triggerGifExport);
  document.getElementById('btn-export-gif').addEventListener('click',     triggerGifExport);
  document.getElementById('btn-close-gif-modal').addEventListener('click', () => {
    document.getElementById('gif-modal').classList.add('hidden');
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); document.getElementById(isRunning ? 'btn-pause' : 'btn-play').click(); }
    if (e.code === 'KeyR')  document.getElementById('btn-reset').click();
    if (e.code === 'KeyB')  document.getElementById('btn-burst')?.click();
  });

  // Initial state
  pushConfig();
  updateBurstRowVisibility();
  startEmitterPosHUD();
}

// ── Preset application ─────────────────────────────────────────────────────

function applyPreset(name) {
  const colors = PALETTES[name];
  if (!colors) return;
  activePalette = [...colors];
  buildPaletteGrid(activePalette);
  setSingleColor(activePalette[0]);
  pushConfig();
}

// ── Burst row visibility ───────────────────────────────────────────────────

function updateBurstRowVisibility() {
  const mode = document.getElementById('emitter-mode').value;
  document.getElementById('burst-row').classList.toggle('hidden', mode !== 'burst');
}

// ── Emitter position HUD ───────────────────────────────────────────────────

/**
 * Poll the emitter position every 200 ms and update the footer readout.
 * This is a light-weight display helper — no performance impact.
 */
function startEmitterPosHUD() {
  const el = document.getElementById('emitter-pos-display');
  if (!el) return;
  setInterval(() => {
    if (emitterX >= 0 && emitterY >= 0) {
      el.textContent = `emitter: ${emitterX}, ${emitterY}`;
    } else {
      el.textContent = 'emitter: center';
    }
  }, 200);
}

// ── Full config push ───────────────────────────────────────────────────────

/**
 * Read every control value and push the complete config to the emitter.
 * Also syncs the renderer state that lives outside the emitter object.
 */
function pushConfig() {
  const v = id => document.getElementById(id)?.value ?? '';
  const n = id => parseFloat(v(id))  || 0;
  const i = id => parseInt(v(id), 10) || 0;
  const b = id => document.getElementById(id)?.checked ?? false;

  const blendVal = v('blend-mode');

  setEmitterConfig({
    // Emitter shape/mode
    emitterShape:  v('emitter-shape'),
    emitterMode:   v('emitter-mode'),
    count:         i('particle-count'),
    spawnRate:     i('spawn-rate') || 60,

    // Movement
    speed:         n('speed'),
    spread:        n('spread'),
    direction:     n('direction'),
    gravity:       n('gravity'),
    turbulence:    n('turbulence'),    // Feature 3

    // Appearance
    particleSize:  i('particle-size'),
    particleShape: v('particle-shape'),
    blendMode:     blendVal,
    startAlpha:    n('start-alpha') || 1,

    // Lifetime
    lifetime:      i('lifetime'),
    fade:          n('fade'),
    shrink:        n('shrink'),

    // Colour
    multiColor:    b('multi-color'),

    // Feature 2: gradient
    useGradient:   b('use-gradient'),
    gradientStart: v('gradient-start'),
    gradientEnd:   v('gradient-end'),

    // Feature 5: loop
    loop:          b('loop-toggle'),

    // Canvas / export helpers
    bgColor:       v('bg-color'),
  });

  // Sync renderer-owned state
  setBlendMode(blendVal);
  setTrailAlpha(n('trail-alpha'));
  setRendererBg(v('bg-color'));
}

// ── Export ─────────────────────────────────────────────────────────────────

function triggerGifExport() {
  const fps      = parseInt(document.getElementById('gif-fps').value, 10)      || 15;
  const duration = parseFloat(document.getElementById('gif-duration').value)   || 2;
  startGifExport({ fps, duration }, { ...getEmitterConfig() });
}

function triggerExport() {
  const emitSnap = { ...getEmitterConfig() };
  startExport({
    frames:    parseInt(document.getElementById('export-frames').value,     10) || 16,
    frameSize: parseInt(document.getElementById('export-frame-size').value, 10) || 128,
    cols:      parseInt(document.getElementById('export-cols').value,       10) || 4,
  }, emitSnap);
}
