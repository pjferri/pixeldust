/**
 * ui.js
 * Wires all DOM controls to the emitter/renderer state.
 * Also builds the colour palette UI.
 */

// ── Slider value display sync ──────────────────────────────────────────────

/**
 * For every element with data-for="some-slider-id", sync its text
 * content with the slider's current value on input.
 */
function initSliderDisplays() {
  document.querySelectorAll('.val-display').forEach(display => {
    const id     = display.dataset.for;
    const slider = document.getElementById(id);
    if (!slider) return;

    const update = () => {
      const v = parseFloat(slider.value);
      // Show decimal places only when meaningful
      display.textContent = Number.isInteger(v) ? v : v.toFixed(2);
    };

    slider.addEventListener('input', update);
    update(); // initialise
  });
}

// ── Build colour palette grid ─────────────────────────────────────────────

/**
 * Render the palette swatches into #palette-grid.
 * Clicking a swatch sets it as the active colour and activates multi-colour
 * if more than one swatch is later toggled (handled separately).
 */
function buildPaletteGrid(colors) {
  const grid = document.getElementById('palette-grid');
  grid.innerHTML = '';

  colors.forEach(hex => {
    const div = document.createElement('div');
    div.className      = 'pal-swatch';
    div.style.background = hex;
    div.title          = hex;

    div.addEventListener('click', () => {
      // Update single colour picker + swatch display
      document.getElementById('color-picker').value = hex;
      document.getElementById('swatch-current-color').style.background = hex;
      document.getElementById('swatch-hex').textContent = hex;
      activeColor = hex;

      // Highlight selected
      grid.querySelectorAll('.pal-swatch').forEach(s => s.classList.remove('active'));
      div.classList.add('active');
    });

    grid.appendChild(div);
  });
}

// ── Wire all controls ──────────────────────────────────────────────────────

function initUI() {
  initSliderDisplays();

  // Build initial palette from the fire preset
  buildPaletteGrid(activePalette);

  // ── Palette preset buttons ────────────────────────────────────────────
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      if (PALETTES[key]) {
        activePalette = [...PALETTES[key]];
        buildPaletteGrid(activePalette);
        // Auto-set first colour as single picker colour
        activeColor = activePalette[0];
        document.getElementById('color-picker').value = activeColor;
        document.getElementById('swatch-current-color').style.background = activeColor;
        document.getElementById('swatch-hex').textContent = activeColor;
        pushConfig();
      }
    });
  });

  // ── Color picker ──────────────────────────────────────────────────────
  const colorPicker = document.getElementById('color-picker');
  colorPicker.addEventListener('input', () => {
    activeColor = colorPicker.value;
    document.getElementById('swatch-current-color').style.background = activeColor;
    document.getElementById('swatch-hex').textContent = activeColor;
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

  // ── All the sliders/selects that map directly to emitter config ───────
  const directControls = [
    'emitter-shape', 'emitter-mode',
    'particle-count', 'speed', 'spread', 'direction', 'gravity',
    'particle-size', 'particle-shape',
    'lifetime', 'fade', 'shrink',
  ];
  directControls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', pushConfig);
    if (el) el.addEventListener('change', pushConfig);
  });

  // ── Export buttons ────────────────────────────────────────────────────
  document.getElementById('btn-export').addEventListener('click', triggerExport);
  document.getElementById('btn-export-bottom').addEventListener('click', triggerExport);

  // ── Close modal ───────────────────────────────────────────────────────
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
    if (e.code === 'KeyB' && cfg.emitterMode === 'burst') {
      cfg.burstPending = true;
    }
  });

  // Push initial config to emitter
  pushConfig();
}

/**
 * Read all control values and push them to the emitter & renderer.
 */
function pushConfig() {
  const v = id => document.getElementById(id)?.value;
  const n = id => parseFloat(v(id)) || 0;
  const i = id => parseInt(v(id),   10) || 0;

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
    blendMode:     v('blend-mode'),

    lifetime:      i('lifetime'),
    fade:          n('fade'),
    shrink:        n('shrink'),

    multiColor:    document.getElementById('multi-color').checked,
    bgColor:       document.getElementById('bg-color').value,
  });

  setBlendMode(v('blend-mode'));
}

/**
 * Collect export config and kick off the exporter.
 */
function triggerExport() {
  // Take a snapshot of emitter config + extra info for the exporter
  const emitSnap = { ...getEmitterConfig() };

  const exportCfg = {
    frames:    parseInt(document.getElementById('export-frames').value, 10) || 16,
    frameSize: parseInt(document.getElementById('export-frame-size').value, 10) || 128,
    cols:      parseInt(document.getElementById('export-cols').value, 10) || 4,
  };

  startExport(exportCfg, emitSnap);
}
