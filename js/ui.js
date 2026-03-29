/**
 * ui.js
 * Wires all DOM controls to the emitter/renderer state.
 * Also builds the colour palette UI and applies the fire preset on startup.
 */

// ── Slider value display sync ──────────────────────────────────────────────

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
    update(); // set initial text
  });
}

// ── Palette grid ───────────────────────────────────────────────────────────

function buildPaletteGrid(colors) {
  const grid = document.getElementById('palette-grid');
  grid.innerHTML = '';

  colors.forEach((hex, i) => {
    const div = document.createElement('div');
    div.className        = 'pal-swatch';
    div.style.background = hex;
    div.title            = hex;

    div.addEventListener('click', () => {
      // Update single-colour picker
      setSingleColor(hex);
      // Highlight selected swatch
      grid.querySelectorAll('.pal-swatch').forEach(s => s.classList.remove('active'));
      div.classList.add('active');
      pushConfig();
    });

    grid.appendChild(div);
  });

  // Highlight first swatch by default
  const first = grid.querySelector('.pal-swatch');
  if (first) first.classList.add('active');
}

/** Update the colour picker input + swatch display + activeColor. */
function setSingleColor(hex) {
  activeColor = hex;
  const picker = document.getElementById('color-picker');
  picker.value = hex;
  document.getElementById('swatch-current-color').style.background = hex;
  document.getElementById('swatch-hex').textContent = hex;
}

// ── initUI ─────────────────────────────────────────────────────────────────

function initUI() {
  initSliderDisplays();

  // Apply fire preset on startup for a great first impression
  applyPreset('fire');

  // ── Palette preset buttons ────────────────────────────────────────────
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
    });
  });

  // ── Color picker ──────────────────────────────────────────────────────
  document.getElementById('color-picker').addEventListener('input', e => {
    setSingleColor(e.target.value);
    pushConfig();
  });

  // ── Multi-colour toggle ───────────────────────────────────────────────
  document.getElementById('multi-color').addEventListener('change', pushConfig);

  // ── Background colour ─────────────────────────────────────────────────
  document.getElementById('bg-color').addEventListener('input', e => {
    setRendererBg(e.target.value);
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

  // ── Emitter mode: show/hide burst button ─────────────────────────────
  const modeSelect = document.getElementById('emitter-mode');
  modeSelect.addEventListener('change', () => {
    updateBurstRowVisibility();
    pushConfig();
  });

  // ── Burst trigger button ──────────────────────────────────────────────
  document.getElementById('btn-burst').addEventListener('click', () => {
    cfg.burstPending = true;
  });

  // ── All other sliders/selects → emitter config ────────────────────────
  const directControls = [
    'emitter-shape',
    'particle-count', 'speed', 'spread', 'direction', 'gravity',
    'particle-size', 'particle-shape',
    'lifetime', 'fade', 'shrink',
  ];
  directControls.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',  pushConfig);
    el.addEventListener('change', pushConfig);
  });

  // ── Export ────────────────────────────────────────────────────────────
  document.getElementById('btn-export').addEventListener('click', triggerExport);
  document.getElementById('btn-export-bottom').addEventListener('click', triggerExport);

  // ── Close export modal ────────────────────────────────────────────────
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('export-modal').classList.add('hidden');
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      document.getElementById(isRunning ? 'btn-pause' : 'btn-play').click();
    }
    if (e.code === 'KeyR') {
      document.getElementById('btn-reset').click();
    }
    if (e.code === 'KeyB') {
      document.getElementById('btn-burst')?.click();
    }
  });

  // Push initial full config
  pushConfig();
  updateBurstRowVisibility();
}

// ── Preset application ─────────────────────────────────────────────────────

/**
 * Apply a named preset: update the palette grid, single colour picker,
 * and push the updated config to the emitter.
 */
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
  const mode    = document.getElementById('emitter-mode').value;
  const burstRow = document.getElementById('burst-row');
  burstRow.classList.toggle('hidden', mode !== 'burst');
}

// ── Config push ────────────────────────────────────────────────────────────

/**
 * Read every control and push the complete config snapshot to the emitter.
 * Also syncs renderer state (blend mode, trail) that lives outside the emitter.
 */
function pushConfig() {
  const v = id => document.getElementById(id)?.value ?? '';
  const n = id => parseFloat(v(id))  || 0;
  const i = id => parseInt(v(id), 10) || 0;

  const blendVal = v('blend-mode');

  setEmitterConfig({
    emitterShape:  v('emitter-shape'),
    emitterMode:   v('emitter-mode'),
    count:         i('particle-count'),

    speed:         n('speed'),
    spread:        n('spread'),
    direction:     n('direction'),
    gravity:       n('gravity'),

    particleSize:  i('particle-size'),
    particleShape: v('particle-shape'),
    blendMode:     blendVal,

    lifetime:      i('lifetime'),
    fade:          n('fade'),
    shrink:        n('shrink'),

    multiColor:    document.getElementById('multi-color').checked,
    bgColor:       document.getElementById('bg-color').value,
  });

  // Sync renderer state
  setBlendMode(blendVal);
  setTrailAlpha(n('trail-alpha'));
  setRendererBg(v('bg-color'));
}

// ── Export ─────────────────────────────────────────────────────────────────

function triggerExport() {
  const emitSnap = { ...getEmitterConfig() };

  const exportCfg = {
    frames:    parseInt(document.getElementById('export-frames').value,     10) || 16,
    frameSize: parseInt(document.getElementById('export-frame-size').value, 10) || 128,
    cols:      parseInt(document.getElementById('export-cols').value,       10) || 4,
  };

  startExport(exportCfg, emitSnap);
}
