/**
 * ui.js
 * Wires all DOM controls to the emitter/renderer state.
 * v0.8: color-mode dropdown, ghost glow fix, export UX improvements.
 * v0.9: speed variance, velocity decay, death particles, grow mode.
 * v0.1.0: emitter-size, emitter-angle, ring shape, crosshair shape extent.
 * v0.1.2: appearance polish, shadow-color controls, and sub-control spacing cleanup.
 */

// ── Undo / Redo ────────────────────────────────────────────────────────────

const _history = [];
let _historyIdx = -1;
const _MAX_HISTORY = 60;
let _pushDebounceTimer = null;
let _restoringHistory = false;   // guard: blocks _schedulePush during undo/redo

function _commitHistory() {
  if (_restoringHistory) return;  // never overwrite history during a restore
  // Truncate any forward-redo states
  _history.splice(_historyIdx + 1);
  _history.push(getFullSnapshot());
  if (_history.length > _MAX_HISTORY) _history.shift();
  _historyIdx = _history.length - 1;
}

function _schedulePush() {
  if (_restoringHistory) return;  // ignore pushConfig calls triggered by applySnapshot
  clearTimeout(_pushDebounceTimer);
  _pushDebounceTimer = setTimeout(_commitHistory, 400);
}

function undo() {
  if (_historyIdx <= 0) return;
  _historyIdx--;
  _applyHistoryEntry(_history[_historyIdx]);
}

function redo() {
  if (_historyIdx >= _history.length - 1) return;
  _historyIdx++;
  _applyHistoryEntry(_history[_historyIdx]);
}

function _applyHistoryEntry(snap) {
  clearTimeout(_pushDebounceTimer);
  _restoringHistory = true;
  try {
    applySnapshot(snap);
  } finally {
    _restoringHistory = false;
  }
}

// ── Speed curve (quadratic for finer low-end control) ──────────────────────
function speedCurve(raw)   { return raw * raw / 10; }
function speedUncurve(spd) { return Math.sqrt(Math.max(0, spd) * 10); }

// ── Slider display sync ────────────────────────────────────────────────────

function initSliderDisplays() {
  document.querySelectorAll('.val-display').forEach(display => {
    const id     = display.dataset.for;
    const slider = document.getElementById(id);
    if (!slider) return;
    const update = () => {
      let v = parseFloat(slider.value);
      if (id === 'speed') v = speedCurve(v);
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
  document.getElementById('color-picker').value                     = hex;
  document.getElementById('swatch-current-color').style.background  = hex;
  document.getElementById('swatch-hex').textContent                 = hex;
}

// ── Color mode ─────────────────────────────────────────────────────────────
// Maps the "Color source" dropdown to the underlying multiColor + useGradient flags.

/**
 * Read the color-mode dropdown and return the corresponding flag values.
 */
function getColorModeFlags() {
  const mode = document.getElementById('color-mode')?.value || 'palette';
  return {
    multiColor:  mode === 'palette' || mode === 'palette-fade',
    useGradient: mode === 'gradient' || mode === 'palette-fade',
  };
}

/**
 * Derive the color-mode dropdown value from flag values (for undo/load/preset restore).
 */
function colorModeFromFlags(multiColor, useGradient) {
  if (multiColor && useGradient) return 'palette-fade';
  if (multiColor)                return 'palette';
  if (useGradient)               return 'gradient';
  return 'single';
}

/**
 * Show/hide the relevant color sub-controls based on the current color-mode.
 */
function updateColorModeUI() {
  const mode = document.getElementById('color-mode')?.value || 'palette';
  const showSingle   = mode === 'single';
  const showPalette  = mode === 'palette' || mode === 'palette-fade';
  const showGradStart = mode === 'gradient';
  const showGradEnd  = mode === 'gradient' || mode === 'palette-fade';

  document.getElementById('color-picker-wrap').classList.toggle('hidden', !showSingle);
  document.getElementById('palette-area').classList.toggle('hidden', !showPalette);
  document.getElementById('gradient-start-row').classList.toggle('hidden', !showGradStart);
  document.getElementById('gradient-end-row').classList.toggle('hidden', !showGradEnd);

  // Update hint text
  const hint = document.getElementById('gradient-hint');
  if (hint) {
    hint.textContent = mode === 'palette-fade'
      ? 'Each particle picks a palette color and fades to the end color over its lifetime.'
      : 'Particles lerp from start color → end color over their lifetime.';
  }

  // Sync hidden checkboxes so pushConfig reads correct values
  const flags = getColorModeFlags();
  const mcEl = document.getElementById('multi-color');
  const ugEl = document.getElementById('use-gradient');
  if (mcEl) mcEl.checked = flags.multiColor;
  if (ugEl) ugEl.checked = flags.useGradient;
}

// ── Death params visibility ────────────────────────────────────────────────

function updateDeathParamsVisibility() {
  const count = parseInt(document.getElementById('death-count')?.value || '0', 10);
  const row   = document.getElementById('death-params-row');
  if (row) row.classList.toggle('hidden', count === 0);
}

const EFFECT_MODE_META = {
  normal: {
    usesStrength: false,
    usesShadowColor: false,
    description: 'Draws the particle shape cleanly with no extra bloom or compositing.',
  },
  glow: {
    usesStrength: true,
    usesShadowColor: false,
    description: 'Lower intensity stays soft and airy. Higher intensity pushes into a brighter, punchier bloom.',
  },
  prism: {
    usesStrength: true,
    usesShadowColor: false,
    description: 'Adds separated spectral fringes for a more stylized chromatic effect.',
  },
  shadow: {
    usesStrength: true,
    usesShadowColor: true,
    description: 'Adds a visible offset under-shadow for depth and weight.',
  },
};

function canonicalEffectMode(mode) {
  if (typeof normalizeEffectMode === 'function') {
    return normalizeEffectMode(mode);
  }
  return mode || 'normal';
}

function getEffectStrengthValue(fallback = 1) {
  const raw = parseFloat(document.getElementById('effect-strength')?.value ?? '');
  return Number.isFinite(raw) ? raw : fallback;
}

function getShadowColorValue(fallback = '#120018') {
  const raw = document.getElementById('shadow-color')?.value ?? '';
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function updateEffectControls() {
  const modeEl = document.getElementById('blend-mode');
  const paramsRow = document.getElementById('effect-params-row');
  const strengthRow = document.getElementById('effect-strength-row');
  const shadowRow = document.getElementById('shadow-color-row');
  const slider = document.getElementById('effect-strength');
  const shadowInput = document.getElementById('shadow-color');
  if (!modeEl || !paramsRow || !strengthRow || !shadowRow || !slider || !shadowInput) return;

  const mode = canonicalEffectMode(modeEl.value || 'normal');
  if (modeEl.value !== mode) modeEl.value = mode;

  const meta = EFFECT_MODE_META[mode] || EFFECT_MODE_META.normal;
  Array.from(modeEl.options).forEach(option => {
    const optionMeta = EFFECT_MODE_META[canonicalEffectMode(option.value)] || EFFECT_MODE_META.normal;
    option.title = optionMeta.description;
  });

  paramsRow.classList.toggle('hidden', !meta.usesStrength && !meta.usesShadowColor);
  strengthRow.classList.toggle('hidden', !meta.usesStrength);
  shadowRow.classList.toggle('hidden', !meta.usesShadowColor);
  slider.disabled = !meta.usesStrength;
  shadowInput.disabled = !meta.usesShadowColor;
  modeEl.title = meta.description;
}

// ── Emitter shape rows visibility ──────────────────────────────────────────

function updateEmitterShapeRows() {
  const shape     = document.getElementById('emitter-shape')?.value || 'point';
  const sizeRow   = document.getElementById('emitter-size-row');
  const angleRow  = document.getElementById('emitter-angle-row');
  const showSize  = shape === 'line' || shape === 'circle';
  const showAngle = shape === 'line';
  if (sizeRow)  sizeRow.classList.toggle('hidden', !showSize);
  if (angleRow) angleRow.classList.toggle('hidden', !showAngle);
}

// ── initUI ─────────────────────────────────────────────────────────────────

function initUI() {
  initSliderDisplays();
  buildEffectPresetBar();
  document.getElementById('loop-toggle').closest('.ctrl-row').title = 'Restarts the effect periodically so you can preview seamless loops.';

  // Load from URL hash if present, else keep the neutral point-emitter defaults
  if (!loadFromHash()) {
    applyPalette('fire');
    document.querySelectorAll('.effect-preset-btn').forEach(b => b.classList.remove('active'));
    clearCanvas();
  }

  // ── Palette colour presets (right-panel swatches) ─────────────────────
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPalette(btn.dataset.preset));
  });

  // ── Single colour picker ──────────────────────────────────────────────
  document.getElementById('color-picker').addEventListener('input', e => {
    setSingleColor(e.target.value);
    pushConfig();
  });

  // ── Color mode dropdown ───────────────────────────────────────────────
  const colorModeEl = document.getElementById('color-mode');
  colorModeEl.addEventListener('change', () => {
    updateColorModeUI();
    pushConfig();
  });
  // Initial visibility sync
  updateColorModeUI();

  // ── BG colour ─────────────────────────────────────────────────────────
  document.getElementById('bg-color').addEventListener('input', e => {
    setRendererBg(e.target.value);
    pushConfig();
  });

  // ── Trail alpha ───────────────────────────────────────────────────────
  document.getElementById('trail-alpha').addEventListener('input', e => {
    setTrailAlpha(parseFloat(e.target.value));
    pushConfig();
  });

  // ── Blend mode ────────────────────────────────────────────────────────
  document.getElementById('blend-mode').addEventListener('change', e => {
    const mode = canonicalEffectMode(e.target.value);
    e.target.value = mode;
    updateEffectControls();
    setBlendMode(mode);
    pushConfig();
  });
  document.getElementById('effect-strength').addEventListener('input', e => {
    setEffectStrength(parseFloat(e.target.value));
    pushConfig();
  });
  document.getElementById('shadow-color').addEventListener('input', e => {
    setShadowColor(e.target.value);
    pushConfig();
  });

  // ── Gradient pickers (always wired; visibility controlled by color-mode) ──
  document.getElementById('gradient-start').addEventListener('input', pushConfig);
  document.getElementById('gradient-end').addEventListener('input',   pushConfig);

  updateEffectControls();

  // ── Speed multiplier ─────────────────────────────────────────────────
  document.getElementById('speed-mult').addEventListener('input', e => {
    setSpeedMult(parseFloat(e.target.value));
  });

  // ── Loop toggle ───────────────────────────────────────────────────────
  document.getElementById('loop-toggle').addEventListener('change', pushConfig);
  document.getElementById('show-crosshair').addEventListener('change', () => { /* renderer reads this live */ });

  // ── Emitter mode / burst ──────────────────────────────────────────────
  document.getElementById('emitter-mode').addEventListener('change', () => {
    updateBurstRowVisibility();
    pushConfig();
  });
  document.getElementById('btn-burst').addEventListener('click', () => {
    cfg.burstPending = true;
  });

  // ── Emitter shape → show/hide size & angle rows ───────────────────────
  document.getElementById('emitter-shape').addEventListener('change', () => {
    updateEmitterShapeRows();
    // directControls loop also calls pushConfig on change
  });

  // ── All slider/select controls → emitter config ───────────────────────
  const directControls = [
    'emitter-shape', 'emitter-size', 'emitter-angle',
    'particle-count', 'spawn-rate', 'speed', 'spread', 'direction', 'gravity', 'turbulence', 'drag', 'wind', 'bounce',
    'speed-variance', 'velocity-decay',
    'particle-size', 'size-variance', 'particle-shape', 'start-alpha', 'rotation', 'hue-variation', 'effect-strength',
    'lifetime', 'fade', 'shrink',
    'death-count', 'death-speed', 'death-size',
    'pulse-interval',
  ];
  directControls.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',  pushConfig);
    el.addEventListener('change', pushConfig);
  });

  // ── Death params visibility ───────────────────────────────────────────────
  const deathCountEl = document.getElementById('death-count');
  if (deathCountEl) {
    deathCountEl.addEventListener('input', updateDeathParamsVisibility);
    updateDeathParamsVisibility();
  }

  // ── Sprite sheet export ───────────────────────────────────────────────
  document.getElementById('btn-export').addEventListener('click',        triggerExport);
  document.getElementById('btn-export-bottom').addEventListener('click', triggerExport);
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('export-modal').classList.add('hidden');
  });

  // ── GIF export ────────────────────────────────────────────────────────
  document.getElementById('btn-export-gif-top').addEventListener('click', triggerGifExport);
  document.getElementById('btn-export-gif').addEventListener('click',     triggerGifExport);
  document.getElementById('btn-close-gif-modal').addEventListener('click', () => {
    document.getElementById('gif-modal').classList.add('hidden');
  });

  // ── Save / Load / Share ───────────────────────────────────────────────
  document.getElementById('btn-save-cfg').addEventListener('click', saveConfig);
  document.getElementById('load-cfg-input').addEventListener('change', loadConfig);
  document.getElementById('btn-share').addEventListener('click', shareConfig);

  // ── Background color presets ─────────────────────────────────────────────
  document.querySelectorAll('.bg-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.dataset.color;
      document.getElementById('bg-color').value = color;
      setRendererBg(color);
      clearCanvas();
      document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      pushConfig();
    });
  });

  // ── Center emitter ────────────────────────────────────────────────────────
  document.getElementById('btn-center-emitter').addEventListener('click', () => {
    centerEmitter();
  });

  // ── Randomize ──────────────────────────────────────────────────────────
  document.getElementById('btn-randomize').addEventListener('click', randomizeSettings);

  // ── Keyboard shortcuts panel ──────────────────────────────────────────
  const shortcutsModal = document.getElementById('shortcuts-modal');
  const openShortcuts  = () => shortcutsModal.classList.remove('hidden');
  const closeShortcuts = () => shortcutsModal.classList.add('hidden');
  const closeOverlays  = () => {
    closeShortcuts();
    document.getElementById('export-modal').classList.add('hidden');
    document.getElementById('gif-modal').classList.add('hidden');
  };
  document.getElementById('btn-shortcuts').addEventListener('click', openShortcuts);
  document.getElementById('btn-close-shortcuts').addEventListener('click', closeShortcuts);
  shortcutsModal.addEventListener('click', e => { if (e.target === shortcutsModal) closeShortcuts(); });

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  const presetKeys = Object.keys(EFFECT_PRESETS); // ordered by insertion
  document.addEventListener('keydown', e => {
    // Undo / Redo — handle before input check so Ctrl+Z works globally
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
      e.preventDefault(); undo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
      e.preventDefault(); redo(); return;
    }
    // Copy canvas snapshot to clipboard (Ctrl+C)
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
      copyCanvasToClipboard(); return;
    }

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space')  { e.preventDefault(); document.getElementById(isRunning ? 'btn-pause' : 'btn-play').click(); }
    if (e.code === 'KeyR')   document.getElementById('btn-reset').click();
    if (e.code === 'KeyB')   document.getElementById('btn-burst')?.click();
    if (e.code === 'KeyF')   toggleFullscreen();
    if (e.key  === '?')      { e.preventDefault(); shortcutsModal.classList.contains('hidden') ? openShortcuts() : closeShortcuts(); }
    if (e.code === 'Escape') { e.preventDefault(); closeOverlays(); }
    if (e.code === 'KeyE')   triggerExport();
    if (e.code === 'KeyG')   triggerGifExport();
    if (e.code === 'KeyZ')   randomizeSettings();
    if (e.code === 'KeyS')   { e.preventDefault(); saveConfig(); }
    if (e.code === 'KeyC')   copyCanvasToClipboard();
    if (e.code === 'Home')   { e.preventDefault(); centerEmitter(); }
    // 1–9: switch effect preset
    const digit = parseInt(e.key, 10);
    if (digit >= 1 && digit <= presetKeys.length) {
      applyEffectPreset(presetKeys[digit - 1]);
    }
  });

  pushConfig();
  updateBurstRowVisibility();
  updateEmitterShapeRows();
  startEmitterPosHUD();

  // Seed undo history with initial state
  setTimeout(_commitHistory, 100);
}

// ── Effect preset bar ──────────────────────────────────────────────────────

function buildEffectPresetBar() {
  const container = document.getElementById('effect-preset-btns');
  Object.entries(EFFECT_PRESETS).forEach(([key, preset], idx) => {
    const btn = document.createElement('button');
    btn.className   = 'effect-preset-btn';
    btn.textContent = preset.label;
    btn.title       = `${preset.label} (key: ${idx + 1})`;
    btn.dataset.key = key;
    btn.addEventListener('click', () => applyEffectPreset(key));
    container.appendChild(btn);
  });
}

/**
 * Apply a full effect preset by name.
 * Sets all slider/select DOM values then calls pushConfig().
 */
function applyEffectPreset(name) {
  const preset = EFFECT_PRESETS[name];
  if (!preset) return;

  const { cfg: c, palette } = preset;

  // Highlight active preset button
  document.querySelectorAll('.effect-preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.key === name);
  });

  // ── Set slider/select values in DOM ─────────────────────────────────
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  const setCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };

  set('emitter-shape',  c.emitterShape);
  set('emitter-mode',   c.emitterMode);
  set('emitter-size',   c.emitterSize ?? 18);
  set('emitter-angle',  c.emitterAngle ?? 0);
  set('speed-mult',     c.speedMult ?? 1);
  set('particle-count', c.count);
  set('spawn-rate',     c.spawnRate);
  set('speed',          speedUncurve(c.speed).toFixed(2));
  set('spread',         c.spread);
  set('direction',      c.direction);
  set('gravity',        c.gravity);
  set('turbulence',     c.turbulence);
  set('drag',           c.drag ?? 1);
  set('wind',           c.wind ?? 0);
  set('particle-size',  c.particleSize);
  set('particle-shape', c.particleShape);
  set('hue-variation',  c.hueVariation ?? 0);
  set('blend-mode',     canonicalEffectMode(c.blendMode));
  set('effect-strength', c.effectStrength ?? 1);
  set('shadow-color',   c.shadowColor || '#120018');
  set('size-variance',  c.sizeVariance ?? 0);
  set('start-alpha',    c.startAlpha);
  set('rotation',       c.rotation ?? 0);
  set('lifetime',       c.lifetime);
  set('fade',           c.fade);
  set('shrink',         c.shrink);
  set('bg-color',       c.bgColor);
  set('trail-alpha',    c.trailAlpha);
  set('gradient-start', c.gradientStart || '#ffff00');
  set('gradient-end',   c.gradientEnd   || '#ff0000');

  set('speed-variance',  c.speedVariance ?? 0);
  set('velocity-decay',  c.velocityDecay ?? 0);
  set('death-count',     c.deathCount ?? 0);
  set('death-speed',     c.deathSpeed ?? 2);
  set('death-size',      c.deathSize ?? 2);
  set('pulse-interval',  c.pulseInterval ?? 2);

  setCheck('loop-toggle',   c.loop ?? false);
  setCheck('bounce',        c.bounce ?? false);

  updateEffectControls();

  // Sync color-mode dropdown from preset flags, then update visibility
  set('color-mode', colorModeFromFlags(!!c.multiColor, !!c.useGradient));
  updateColorModeUI();

  // Apply palette
  if (palette && PALETTES[palette]) applyPalette(palette);

  // Re-sync all val-display spans
  document.querySelectorAll('.val-display').forEach(display => {
    const slider = document.getElementById(display.dataset.for);
    if (slider) {
      let v = parseFloat(slider.value);
      if (display.dataset.for === 'speed') v = speedCurve(v);
      display.textContent = Number.isInteger(v) ? v : v.toFixed(2);
    }
  });

  updateBurstRowVisibility();
  updateDeathParamsVisibility();
  updateEmitterShapeRows();
  resetParticles();
  clearCanvas();
  pushConfig();

  // Move emitter to preset's canonical position
  if (c.emitterPX !== undefined && c.emitterPY !== undefined) {
    const cvs = getCanvas();
    if (cvs) setEmitterPos(cvs.width * c.emitterPX, cvs.height * c.emitterPY);
  }

  // Burst mode: fire immediately
  if (c.emitterMode === 'burst') {
    setTimeout(() => { cfg.burstPending = true; }, 100);
  }
}

// ── Palette presets (colour swatches only) ─────────────────────────────────

function applyPalette(name) {
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
  const pRow = document.getElementById('pulse-interval-row');
  if (pRow) pRow.classList.toggle('hidden', mode !== 'pulse');
}

// ── Emitter position HUD ───────────────────────────────────────────────────

function startEmitterPosHUD() {
  const el = document.getElementById('emitter-pos-display');
  if (!el) return;
  setInterval(() => {
    el.textContent = (emitterX >= 0 && emitterY >= 0)
      ? `emitter: ${emitterX}, ${emitterY}`
      : 'emitter: center';
  }, 200);
}

// ── Full config push ───────────────────────────────────────────────────────

function pushConfig() {
  const v = id => document.getElementById(id)?.value ?? '';
  const n = id => parseFloat(v(id))   || 0;
  const i = id => parseInt(v(id), 10) || 0;
  const b = id => document.getElementById(id)?.checked ?? false;

  const blendVal = canonicalEffectMode(v('blend-mode'));
  const effectStrength = getEffectStrengthValue();
  const shadowColor = getShadowColorValue();

  setEmitterConfig({
    emitterShape:  v('emitter-shape'),
    emitterMode:   v('emitter-mode'),
    emitterSize:   parseFloat(document.getElementById('emitter-size')?.value ?? '18') || 18,
    emitterAngle:  parseFloat(document.getElementById('emitter-angle')?.value ?? '0') || 0,
    speedMult:     n('speed-mult') || 1,
    count:         i('particle-count'),
    spawnRate:     i('spawn-rate') || 60,
    speed:         speedCurve(n('speed')),
    spread:        n('spread'),
    direction:     n('direction'),
    gravity:       n('gravity'),
    turbulence:    n('turbulence'),
    drag:          parseFloat(document.getElementById('drag')?.value ?? '1') || 1,
    wind:          n('wind'),
    bounce:        b('bounce'),
    particleSize:  i('particle-size'),
    sizeVariance:  i('size-variance'),
    particleShape: v('particle-shape'),
    hueVariation:  n('hue-variation'),
    blendMode:     blendVal,
    effectStrength,
    shadowColor,
    startAlpha:    n('start-alpha') || 1,
    rotation:      n('rotation'),
    lifetime:      i('lifetime'),
    fade:          n('fade'),
    shrink:        n('shrink'),
    multiColor:    getColorModeFlags().multiColor,
    useGradient:   getColorModeFlags().useGradient,
    gradientStart: v('gradient-start'),
    gradientEnd:   v('gradient-end'),
    loop:          b('loop-toggle'),
    bgColor:       v('bg-color'),
    trailAlpha:    n('trail-alpha'),
    speedVariance: n('speed-variance'),
    velocityDecay: n('velocity-decay'),
    deathCount:    i('death-count'),
    deathSpeed:    parseFloat(document.getElementById('death-speed')?.value ?? '2') || 2,
    deathSize:     i('death-size') || 2,
    pulseInterval: parseFloat(document.getElementById('pulse-interval')?.value ?? '2') || 2,
  });

  setSpeedMult(n('speed-mult') || 1);
  setBlendMode(blendVal);
  setEffectStrength(effectStrength);
  setShadowColor(shadowColor);
  setTrailAlpha(n('trail-alpha'));
  setRendererBg(v('bg-color'));

  // Queue a history snapshot (debounced so fast slider drags collapse)
  _schedulePush();

  // Clear ghost trails from any previous config state.
  // Safe to call every push — it's just one opaque fillRect per frame.
  clearCanvas();
}

// ── Save / Load / Share ────────────────────────────────────────────────────

function getFullSnapshot() {
  const v = id => document.getElementById(id)?.value ?? '';
  const n = id => parseFloat(v(id));
  const i = id => parseInt(v(id), 10);
  const b = id => document.getElementById(id)?.checked ?? false;
  return {
    emitterShape:  v('emitter-shape'),
    emitterMode:   v('emitter-mode'),
    emitterSize:   parseFloat(document.getElementById('emitter-size')?.value ?? '18') || 18,
    emitterAngle:  parseFloat(document.getElementById('emitter-angle')?.value ?? '0') || 0,
    speedMult:     n('speed-mult'),
    count:         i('particle-count'),
    spawnRate:     i('spawn-rate'),
    speed:         speedCurve(n('speed')),
    spread:        n('spread'),
    direction:     n('direction'),
    gravity:       n('gravity'),
    turbulence:    n('turbulence'),
    drag:          n('drag') || 1,
    wind:          n('wind'),
    bounce:        b('bounce'),
    particleSize:  i('particle-size'),
    sizeVariance:  i('size-variance'),
    particleShape: v('particle-shape'),
    hueVariation:  n('hue-variation'),
    blendMode:     canonicalEffectMode(v('blend-mode')),
    effectStrength: getEffectStrengthValue(),
    shadowColor:   getShadowColorValue(),
    startAlpha:    n('start-alpha'),
    rotation:      n('rotation'),
    lifetime:      i('lifetime'),
    fade:          n('fade'),
    shrink:        n('shrink'),
    bgColor:       v('bg-color'),
    trailAlpha:    n('trail-alpha'),
    colorMode:     v('color-mode'),
    multiColor:    getColorModeFlags().multiColor,
    useGradient:   getColorModeFlags().useGradient,
    gradientStart: v('gradient-start'),
    gradientEnd:   v('gradient-end'),
    loop:          b('loop-toggle'),
    palette:       activePalette,
    singleColor:   activeColor,
    speedVariance: n('speed-variance'),
    velocityDecay: n('velocity-decay'),
    deathCount:    i('death-count'),
    deathSpeed:    parseFloat(v('death-speed')) || 2,
    deathSize:     i('death-size') || 2,
    pulseInterval: parseFloat(v('pulse-interval')) || 2,
  };
}

function applySnapshot(snap) {
  const set      = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
  const setCheck = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.checked = !!val; };

  set('emitter-shape',  snap.emitterShape);
  set('emitter-mode',   snap.emitterMode);
  set('emitter-size',   snap.emitterSize ?? 18);
  set('emitter-angle',  snap.emitterAngle ?? 0);
  set('speed-mult',     snap.speedMult ?? 1);
  set('particle-count', snap.count);
  set('spawn-rate',     snap.spawnRate);
  set('speed',          speedUncurve(snap.speed).toFixed(2));
  set('spread',         snap.spread);
  set('direction',      snap.direction);
  set('gravity',        snap.gravity);
  set('turbulence',     snap.turbulence);
  set('drag',           snap.drag ?? 1);
  set('wind',           snap.wind ?? 0);
  setCheck('bounce',    snap.bounce ?? false);
  set('speed-variance',  snap.speedVariance ?? 0);
  set('velocity-decay',  snap.velocityDecay ?? 0);
  set('death-count',     snap.deathCount ?? 0);
  set('death-speed',     snap.deathSpeed ?? 2);
  set('death-size',      snap.deathSize ?? 2);
  set('pulse-interval',  snap.pulseInterval ?? 2);
  set('particle-size',  snap.particleSize);
  set('particle-shape', snap.particleShape);
  set('hue-variation',  snap.hueVariation ?? 0);
  set('blend-mode',     canonicalEffectMode(snap.blendMode));
  set('effect-strength', snap.effectStrength ?? 1);
  set('shadow-color',   snap.shadowColor || '#120018');
  set('size-variance',  snap.sizeVariance ?? 0);
  set('start-alpha',    snap.startAlpha);
  set('rotation',       snap.rotation ?? 0);
  set('lifetime',       snap.lifetime);
  set('fade',           snap.fade);
  set('shrink',         snap.shrink);
  set('bg-color',       snap.bgColor);
  set('trail-alpha',    snap.trailAlpha);
  set('gradient-start', snap.gradientStart);
  set('gradient-end',   snap.gradientEnd);

  setCheck('loop-toggle',  snap.loop);

  // Restore color-mode dropdown from snapshot flags
  const restoredMode = snap.colorMode || colorModeFromFlags(!!snap.multiColor, !!snap.useGradient);
  const cmEl = document.getElementById('color-mode');
  if (cmEl) cmEl.value = restoredMode;
  updateColorModeUI();
  updateEffectControls();

  if (snap.palette && snap.palette.length) {
    activePalette = [...snap.palette];
    buildPaletteGrid(activePalette);
  }
  setSingleColor(snap.singleColor || activePalette[0] || activeColor);

  document.querySelectorAll('.val-display').forEach(display => {
    const slider = document.getElementById(display.dataset.for);
    if (slider) {
      let v = parseFloat(slider.value);
      if (display.dataset.for === 'speed') v = speedCurve(v);
      display.textContent = Number.isInteger(v) ? v : v.toFixed(2);
    }
  });

  updateBurstRowVisibility();
  updateDeathParamsVisibility();
  updateEmitterShapeRows();
  resetParticles();
  clearCanvas();
  pushConfig();

  // Restore emitter position if snapshot includes it
  if (snap.emitterPX !== undefined && snap.emitterPY !== undefined) {
    const cvs = getCanvas();
    if (cvs) setEmitterPos(cvs.width * snap.emitterPX, cvs.height * snap.emitterPY);
  }
}

function saveConfig() {
  const snap    = getFullSnapshot();
  const json    = JSON.stringify(snap, null, 2);
  const blob    = new Blob([json], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = 'pixeldust_config.json';
  a.click();
  URL.revokeObjectURL(url);
}

function loadConfig(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const snap = JSON.parse(ev.target.result);
      applySnapshot(snap);
      // Clear preset highlights since this is a custom config
      document.querySelectorAll('.effect-preset-btn').forEach(b => b.classList.remove('active'));
    } catch {
      alert('Failed to load config — invalid JSON file.');
    }
  };
  reader.readAsText(file);
  // Reset input so the same file can be re-loaded
  e.target.value = '';
}

function shareConfig() {
  const snap    = getFullSnapshot();
  const encoded = btoa(JSON.stringify(snap));
  const url     = `${location.origin}${location.pathname}#cfg=${encoded}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('btn-share');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

function loadFromHash() {
  const hash = location.hash;
  if (!hash.startsWith('#cfg=')) return false;
  try {
    const snap = JSON.parse(atob(hash.slice(5)));
    applySnapshot(snap);
    return true;
  } catch {
    return false;
  }
}

// ── Copy canvas to clipboard ───────────────────────────────────────────────

let _copyToastTimer = null;
function _showCopyToast() {
  const toast = document.getElementById('copy-toast');
  if (!toast) return;
  clearTimeout(_copyToastTimer);
  toast.classList.add('show');
  _copyToastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

function copyCanvasToClipboard() {
  const canvas = getCanvas();
  if (!canvas) return;
  canvas.toBlob(blob => {
    if (!blob) return;
    try {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(_showCopyToast)
        .catch(() => { /* clipboard permission denied — silent fail */ });
    } catch (_) { /* ClipboardItem not supported in this browser */ }
  });
}

// ── Export ─────────────────────────────────────────────────────────────────

// ── Fullscreen preview ─────────────────────────────────────────────────────

let _fullscreen = false;
function toggleFullscreen() {
  _fullscreen = !_fullscreen;
  document.getElementById('panel-left').style.display  = _fullscreen ? 'none' : '';
  document.getElementById('panel-right').style.display = _fullscreen ? 'none' : '';
  document.getElementById('preset-bar').style.display  = _fullscreen ? 'none' : '';
  document.getElementById('topbar').style.display      = _fullscreen ? 'none' : '';
  // Wait one frame for CSS layout to reflow before resizing canvas
  requestAnimationFrame(() => { sizeCanvas(); clearCanvas(); });
}

function triggerGifExport() {
  const fps      = parseInt(document.getElementById('gif-fps').value, 10)    || 15;
  const duration = parseFloat(document.getElementById('gif-duration').value) || 2;
  startGifExport({ fps, duration }, { ...getEmitterConfig() });
}

function triggerExport() {
  startExport({
    frames:    parseInt(document.getElementById('export-frames').value,     10) || 16,
    frameSize: parseInt(document.getElementById('export-frame-size').value, 10) || 128,
    cols:      parseInt(document.getElementById('export-cols').value,       10) || 4,
    transparentBg: document.getElementById('export-transparent')?.checked ?? false,
  }, { ...getEmitterConfig() });
}

// ── Randomize ─────────────────────────────────────────────────────────────

function randomizeSettings() {
  const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
  const rng   = (lo, hi, step) => {
    const steps = Math.round((hi - lo) / step);
    return lo + Math.round(Math.random() * steps) * step;
  };

  const set      = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

  // Sane ranges that still produce interesting results
  const chosenEmitterShape = pick(['point', 'point', 'line', 'circle']);
  set('emitter-shape',  chosenEmitterShape);
  set('emitter-size',   rng(8, 40, 1));
  set('emitter-angle',  rng(0, 180, 1));
  set('emitter-mode',   pick(['continuous', 'continuous', 'continuous', 'burst', 'pulse'])); // weight continuous
  set('pulse-interval', rng(0.5, 6, 0.5));
  set('speed-mult',     rng(0.5, 2, 0.05));
  set('particle-count', rng(30, 300, 10));
  set('spawn-rate',     rng(20, 200, 10));
  set('speed',          speedUncurve(rng(0.5, 8, 0.5)).toFixed(2));
  set('spread',         rng(5, 360, 5));
  set('direction',      rng(0, 359, 1));
  set('gravity',        rng(-0.5, 0.5, 0.05));
  set('turbulence',     rng(0, 1.5, 0.05));
  set('drag',           rng(0.88, 1.0, 0.005));
  set('wind',           rng(-0.2, 0.2, 0.01));
  set('hue-variation',  rng(0, 45, 1));
  set('particle-size',  rng(1, 10, 1));
  set('size-variance',  rng(0, 4, 1));
  set('particle-shape', pick(['square', 'circle', 'diamond', 'cross', 'star', 'sparkle', 'ring']));
  const chosenBlendMode = pick(['normal', 'glow', 'glow', 'glow', 'prism', 'shadow']);
  set('blend-mode', chosenBlendMode);
  set('effect-strength', chosenBlendMode === 'normal' ? 0 : rng(0.35, 2.6, 0.05));
  set('shadow-color', chosenBlendMode === 'shadow'
    ? pick(['#120018', '#1a0f2e', '#102033', '#2a1010', '#0f2416'])
    : '#120018');
  set('start-alpha',    rng(0.3, 1, 0.05));
  set('rotation',       rng(0, 15, 0.5));
  set('lifetime',       rng(20, 200, 5));
  set('fade',           rng(0.2, 1, 0.05));
  set('shrink',         rng(0, 0.8, 0.05));
  set('trail-alpha',    rng(0.03, 0.25, 0.01));

  // Randomize color mode (weighted: palette most common, gradient and palette-fade less so)
  const colorModes = ['single', 'palette', 'palette', 'palette', 'gradient', 'palette-fade'];
  const chosenMode = pick(colorModes);
  set('color-mode', chosenMode);
  if (chosenMode === 'gradient' || chosenMode === 'palette-fade') {
    const randomHex = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    set('gradient-start', randomHex());
    set('gradient-end',   randomHex());
  }
  updateColorModeUI();
  updateEffectControls();

  set('speed-variance', rng(0, 0.6, 0.05));
  set('velocity-decay', rng(0, 0.5, 0.05));
  set('death-count',    Math.random() < 0.2 ? rng(1, 4, 1) : 0); // 20% chance of death sparks
  set('death-speed',    rng(1, 4, 0.5));
  set('death-size',     rng(1, 4, 1));

  setCheck('loop-toggle', false);
  setCheck('bounce', Math.random() < 0.3);

  // Random palette
  const paletteNames = Object.keys(PALETTES);
  applyPalette(pick(paletteNames));

  updateBurstRowVisibility();
  updateDeathParamsVisibility();
  updateEmitterShapeRows();

  // Re-sync all val-display spans
  document.querySelectorAll('.val-display').forEach(display => {
    const slider = document.getElementById(display.dataset.for);
    if (slider) {
      let v = parseFloat(slider.value);
      if (display.dataset.for === 'speed') v = speedCurve(v);
      display.textContent = Number.isInteger(v) ? v : v.toFixed(2);
    }
  });

  resetParticles();
  clearCanvas();
  pushConfig();

  const _rMode = document.getElementById('emitter-mode').value;
  if (_rMode === 'burst') {
    setTimeout(() => { cfg.burstPending = true; }, 100);
  }
}
