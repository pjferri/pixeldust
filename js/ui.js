/**
 * ui.js
 * Wires all DOM controls to the emitter/renderer state.
 * v0.8: color-mode dropdown, ghost glow fix, export UX improvements.
 * v0.9: speed variance, velocity decay, death particles, grow mode.
 * v0.1.0: emitter-size, emitter-angle, ring shape, crosshair shape extent.
 * v0.1.3: randomizer polish, new particle shapes, and appearance/control refinements.
 * v0.1.5: color panel redesign, native-picker cleanup, and layout polish.
 * v0.1.6: expanded emitter shapes with arc controls and export/crosshair parity.
 * v0.1.7: vortex force control and galaxy preset.
 * v0.1.8: export and rendering mechanics overhaul.
 * v0.1.9: fade-to color sync fix, unified render modal polish.
 * v0.1.10: twinkle control and preset refresh.
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

// Tracks which palette slot is currently selected (for editing via color picker)
let _activePaletteIdx = 0;
let _activeGradientIdx = 0;

const COLOR_INPUT_FALLBACKS = {
  'color-picker': '#ffff00',
  'gradient-start': '#ffff00',
  'gradient-end': '#ff0000',
  'bg-color': '#0c0c0e',
  'shadow-color': '#120018',
};

function normalizeHexColor(hex, fallback = '#ffffff') {
  const candidate = typeof hex === 'string' ? hex.trim() : '';
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate.toLowerCase();
  return fallback.toLowerCase();
}

function syncBgPresetSelection(hex) {
  const normalized = normalizeHexColor(hex, COLOR_INPUT_FALLBACKS['bg-color']);
  document.querySelectorAll('.bg-swatch').forEach(swatch => {
    const swatchHex = normalizeHexColor(swatch.dataset.color || '', '#000000');
    swatch.classList.toggle('active', swatchHex === normalized);
  });
}

function openNativeColorPicker(id) {
  const input = document.getElementById(id);
  if (!input) return;
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
  } catch (_) {
    // Fall back to click() if showPicker is unavailable or blocked.
  }
  input.click();
}

function buildPaletteGrid(colors, activeIdx = 0) {
  const grid = document.getElementById('palette-grid');
  const clampedIdx = colors.length
    ? Math.max(0, Math.min(activeIdx, colors.length - 1))
    : 0;
  grid.innerHTML = '';
  colors.forEach((hex, idx) => {
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'pal-swatch';
    input.value = hex;
    if (idx === clampedIdx) input.classList.add('active');
    input.addEventListener('click', () => {
      _activePaletteIdx = idx;
      grid.querySelectorAll('.pal-swatch').forEach(s => s.classList.remove('active'));
      input.classList.add('active');
    });
    input.addEventListener('input', (e) => {
      activePalette[idx] = e.target.value;
      _activePaletteIdx = idx;
      pushConfig();
      updateGradientPreview();
    });
    grid.appendChild(input);
  });
  _activePaletteIdx = clampedIdx;
}

function setSingleColor(hex) {
  activeColor = normalizeHexColor(hex, COLOR_INPUT_FALLBACKS['color-picker']);
  document.getElementById('color-picker').value = activeColor;
  // Sync gradient-start so single+fade mode works correctly
  document.getElementById('gradient-start').value = activeColor;
}

function updateGradientPreview() {
  const bar = document.getElementById('gradient-bar');
  if (!bar) return;
  const isFade = document.getElementById('fade-to-toggle')?.checked ?? false;
  if (!isFade) return;

  const toggle = document.querySelector('#color-mode-toggle .seg-btn.active');
  const isPalette = toggle ? toggle.dataset.mode === 'palette' : true;

  const stops = getGradientStops();

  if (isPalette && activePalette.length) {
    // Show first palette color fading through stops
    const allColors = [activePalette[0], ...stops];
    const cssStops = allColors.map((c, i) => c + ' ' + Math.round(i / (allColors.length - 1) * 100) + '%');
    bar.style.background = 'linear-gradient(to right, ' + cssStops.join(', ') + ')';
  } else {
    const startColor = document.getElementById('color-picker')?.value || '#ffff00';
    const allColors = [startColor, ...stops];
    const cssStops = allColors.map((c, i) => c + ' ' + Math.round(i / (allColors.length - 1) * 100) + '%');
    bar.style.background = 'linear-gradient(to right, ' + cssStops.join(', ') + ')';
  }
}

function syncColorUIFromMode(mode) {
  // Sync segmented toggle
  const isPalette = mode === 'palette' || mode === 'palette-fade';
  document.querySelectorAll('#color-mode-toggle .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === (isPalette ? 'palette' : 'single'));
  });
  // Sync fade checkbox
  const isFade = mode === 'gradient' || mode === 'palette-fade';
  const fadeToggle = document.getElementById('fade-to-toggle');
  if (fadeToggle) fadeToggle.checked = isFade;
  // Hidden select
  const cmEl = document.getElementById('color-mode');
  if (cmEl) cmEl.value = mode;
  // Rebuild gradient stops UI if fade is on
  if (isFade) buildGradientStops(gradientStops, _activeGradientIdx);
  updateColorModeUI();
}

function applyColorValueToTarget(targetId, rawHex) {
  const input = document.getElementById(targetId);
  if (!input) return;
  const fallback = COLOR_INPUT_FALLBACKS[targetId] || '#ffffff';
  const hex = normalizeHexColor(rawHex, input.value || fallback);
  input.value = hex;

  if (targetId === 'color-picker') {
    const mode = document.getElementById('color-mode')?.value || 'palette';
    if ((mode === 'palette' || mode === 'palette-fade') &&
        _activePaletteIdx >= 0 && _activePaletteIdx < activePalette.length) {
      activePalette[_activePaletteIdx] = hex;
      buildPaletteGrid(activePalette, _activePaletteIdx);
      updateGradientPreview();
      return;
    }
    setSingleColor(hex);
    return;
  }

  if (targetId === 'bg-color') {
    setRendererBg(hex);
    syncBgPresetSelection(hex);
  } else if (targetId === 'shadow-color') {
    setShadowColor(hex);
  }
}

// ── Gradient stops grid ────────────────────────────────────────────────────

function buildGradientStops(stops, activeIdx = _activeGradientIdx) {
  const container = document.getElementById('gradient-stops');
  if (!container) return;
  const clampedIdx = stops.length
    ? Math.max(0, Math.min(activeIdx, stops.length - 1))
    : 0;
  container.innerHTML = '';
  stops.forEach((hex, idx) => {
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'grad-stop';
    input.value = hex;
    if (idx === clampedIdx) input.classList.add('active');
    const selectStop = () => {
      _activeGradientIdx = idx;
      container.querySelectorAll('.grad-stop').forEach(s => s.classList.remove('active'));
      input.classList.add('active');
    };
    input.addEventListener('click', selectStop);
    input.addEventListener('focus', selectStop);
    input.addEventListener('input', (e) => {
      _activeGradientIdx = idx;
      gradientStops[idx] = e.target.value;
      setGradientStops(gradientStops);
      // Sync first stop to hidden gradient-end for compat
      document.getElementById('gradient-end').value = gradientStops[0];
      updateGradientPreview();
      pushConfig();
    });
    container.appendChild(input);
  });
  _activeGradientIdx = clampedIdx;
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
  const toggle = document.querySelector('#color-mode-toggle .seg-btn.active');
  const isPalette = toggle ? toggle.dataset.mode === 'palette' : true;
  const isFade = document.getElementById('fade-to-toggle')?.checked ?? false;

  // Show/hide sections
  document.getElementById('single-color-row').classList.toggle('hidden', isPalette);
  document.getElementById('palette-area').classList.toggle('hidden', !isPalette);

  // Fade-to sub-panel
  document.getElementById('fade-to-panel').classList.toggle('hidden', !isFade);

  // Derive color-mode value for backward compat
  let mode;
  if (isPalette && isFade) mode = 'palette-fade';
  else if (isPalette) mode = 'palette';
  else if (isFade) mode = 'gradient';
  else mode = 'single';

  const cmEl = document.getElementById('color-mode');
  if (cmEl) cmEl.value = mode;

  // Sync hidden checkboxes
  const mcEl = document.getElementById('multi-color');
  const ugEl = document.getElementById('use-gradient');
  if (mcEl) mcEl.checked = isPalette;
  if (ugEl) ugEl.checked = isFade;

  // In single mode, sync gradient-start with color-picker
  if (!isPalette) {
    const cp = document.getElementById('color-picker');
    const gs = document.getElementById('gradient-start');
    if (cp) cp.value = normalizeHexColor(activeColor, COLOR_INPUT_FALLBACKS['color-picker']);
    if (cp && gs) gs.value = cp.value;
  }

  // Sync gradient-end from first stop for compat
  if (gradientStops.length) {
    document.getElementById('gradient-end').value = gradientStops[0];
  }

  updateGradientPreview();
}

// ── Death params visibility ────────────────────────────────────────────────

function updateDeathParamsVisibility() {
  const count = parseInt(document.getElementById('death-count')?.value || '0', 10);
  const row   = document.getElementById('death-params-row');
  if (row) row.classList.toggle('hidden', count === 0);
}

function updateTrailParamsVisibility() {
  const enabled = document.getElementById('trail-enabled')?.checked ?? true;
  const params  = document.getElementById('trail-params');
  if (params) params.classList.toggle('hidden', !enabled);
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
  const arcRow    = document.getElementById('emitter-arc-row');
  const showSize  = shape !== 'point';
  const showAngle = shape === 'line' || shape === 'square' || shape === 'triangle' || shape === 'arc';
  const showArc   = shape === 'arc';
  if (sizeRow)  sizeRow.classList.toggle('hidden', !showSize);
  if (angleRow) angleRow.classList.toggle('hidden', !showAngle);
  if (arcRow)   arcRow.classList.toggle('hidden', !showArc);
}

// ── initUI ─────────────────────────────────────────────────────────────────

function initUI() {
  initSliderDisplays();
  buildEffectPresetBar();
  // loop-toggle is now hidden (loop preview moved to render modal)

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

  // ── Color mode dropdown ───────────────────────────────────────────────
  document.getElementById('color-picker').addEventListener('input', e => {
    applyColorValueToTarget('color-picker', e.target.value);
    pushConfig();
    updateGradientPreview();
  });

  document.getElementById('bg-color').addEventListener('input', e => {
    applyColorValueToTarget('bg-color', e.target.value);
    pushConfig();
  });

  document.getElementById('shadow-color').addEventListener('input', e => {
    applyColorValueToTarget('shadow-color', e.target.value);
    pushConfig();
  });

  document.getElementById('gradient-start').addEventListener('input', e => {
    applyColorValueToTarget('gradient-start', e.target.value);
    pushConfig();
  });

  document.getElementById('gradient-end').addEventListener('input', e => {
    applyColorValueToTarget('gradient-end', e.target.value);
    pushConfig();
  });

  // ── Color mode segmented toggle ──────────────────────────────────────
  document.querySelectorAll('#color-mode-toggle .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#color-mode-toggle .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateColorModeUI();
      pushConfig();
    });
  });

  // ── Fade-to toggle ───────────────────────────────────────────────────
  document.getElementById('fade-to-toggle').addEventListener('change', () => {
    updateColorModeUI();
    if (document.getElementById('fade-to-toggle').checked) {
      buildGradientStops(gradientStops, _activeGradientIdx);
    }
    pushConfig();
  });

  // ── Gradient stop add/remove ─────────────────────────────────────────
  document.getElementById('grad-add').addEventListener('click', () => {
    const randomHex = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    gradientStops.push(randomHex);
    _activeGradientIdx = gradientStops.length - 1;
    setGradientStops(gradientStops);
    buildGradientStops(gradientStops, _activeGradientIdx);
    document.getElementById('gradient-end').value = gradientStops[0];
    updateGradientPreview();
    pushConfig();
  });
  document.getElementById('grad-remove').addEventListener('click', () => {
    if (gradientStops.length <= 1) return;
    gradientStops.splice(_activeGradientIdx, 1);
    _activeGradientIdx = Math.min(_activeGradientIdx, gradientStops.length - 1);
    setGradientStops(gradientStops);
    buildGradientStops(gradientStops, _activeGradientIdx);
    document.getElementById('gradient-end').value = gradientStops[0];
    updateGradientPreview();
    pushConfig();
  });

  // ── Palette add/remove buttons ───────────────────────────────────────
  document.getElementById('pal-add').addEventListener('click', () => {
    const randomHex = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    activePalette.push(randomHex);
    _activePaletteIdx = activePalette.length - 1;
    buildPaletteGrid(activePalette, _activePaletteIdx);
    pushConfig();
    updateGradientPreview();
  });
  document.getElementById('pal-remove').addEventListener('click', () => {
    if (activePalette.length <= 1) return; // Keep at least 1
    activePalette.splice(_activePaletteIdx, 1);
    _activePaletteIdx = Math.min(_activePaletteIdx, activePalette.length - 1);
    buildPaletteGrid(activePalette, _activePaletteIdx);
    pushConfig();
    updateGradientPreview();
  });

  // Initial visibility sync
  updateColorModeUI();
  buildGradientStops(gradientStops, _activeGradientIdx);

  // ── BG colour ─────────────────────────────────────────────────────────

  // ── Trail controls ─────────────────────────────────────────────────────
  document.getElementById('trail-enabled').addEventListener('change', e => {
    setTrailEnabled(e.target.checked);
    updateTrailParamsVisibility();
    pushConfig();
  });
  document.getElementById('trail-persistence').addEventListener('input', e => {
    setTrailPersistence(parseInt(e.target.value, 10));
    // Sync hidden legacy trail-alpha for save/load compat
    document.getElementById('trail-alpha').value = (parseInt(e.target.value, 10) / 100).toFixed(2);
    pushConfig();
  });
  document.getElementById('trail-opacity').addEventListener('input', e => {
    setTrailOpacity(parseInt(e.target.value, 10));
    pushConfig();
  });
  document.getElementById('trail-softness').addEventListener('input', e => {
    setTrailSoftness(parseInt(e.target.value, 10));
    pushConfig();
  });
  updateTrailParamsVisibility();

  // ── Forces / Gravity Wells ────────────────────────────────────────────
  document.getElementById('mouse-force-enabled').addEventListener('change', e => {
    const on = e.target.checked;
    document.getElementById('mouse-force-params').style.display = on ? '' : 'none';
    const str = parseFloat(document.getElementById('mouse-force-strength').value);
    const rad = parseInt(document.getElementById('mouse-force-radius').value, 10);
    setMouseForce(on, str, rad);
  });
  document.getElementById('mouse-force-strength').addEventListener('input', e => {
    const str = parseFloat(e.target.value);
    const rad = parseInt(document.getElementById('mouse-force-radius').value, 10);
    setMouseForce(document.getElementById('mouse-force-enabled').checked, str, rad);
  });
  document.getElementById('mouse-force-radius').addEventListener('input', e => {
    const str = parseFloat(document.getElementById('mouse-force-strength').value);
    const rad = parseInt(e.target.value, 10);
    setMouseForce(document.getElementById('mouse-force-enabled').checked, str, rad);
  });

  let _placingWells = false;
  document.getElementById('btn-place-well').addEventListener('click', () => {
    _placingWells = !_placingWells;
    document.getElementById('btn-place-well').classList.toggle('active', _placingWells);
    setCanvasInteractionMode(_placingWells ? 'force' : 'emitter');
    const str = parseFloat(document.getElementById('well-strength').value);
    const rad = parseInt(document.getElementById('well-radius').value, 10);
    setPendingForceWell(str, rad);
  });
  document.getElementById('well-strength').addEventListener('input', () => {
    const str = parseFloat(document.getElementById('well-strength').value);
    const rad = parseInt(document.getElementById('well-radius').value, 10);
    setPendingForceWell(str, rad);
  });
  document.getElementById('well-radius').addEventListener('input', () => {
    const str = parseFloat(document.getElementById('well-strength').value);
    const rad = parseInt(document.getElementById('well-radius').value, 10);
    setPendingForceWell(str, rad);
  });
  document.getElementById('btn-clear-wells').addEventListener('click', () => {
    clearForceWells();
    _updateForceWellList();
  });

  // Callback when a well is placed from the canvas click handler
  window._onForceWellsChanged = _updateForceWellList;

  function _updateForceWellList() {
    const wells = getForceWells();
    const container = document.getElementById('force-well-list');
    if (wells.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = wells.map((w, i) => {
      const type = w.strength > 0 ? '⊕' : '⊖';
      const color = w.strength > 0 ? '#5cf' : '#f66';
      return `<span style="color:${color};cursor:pointer" title="Click to remove" data-well-idx="${i}">${type} (${Math.round(w.x)},${Math.round(w.y)}) str:${w.strength}</span>`;
    }).join('&nbsp;&nbsp;');
    container.querySelectorAll('[data-well-idx]').forEach(el => {
      el.addEventListener('click', () => {
        removeForceWell(parseInt(el.dataset.wellIdx, 10));
        _updateForceWellList();
      });
    });
  }

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

  // ── Gradient pickers (always wired; visibility controlled by color-mode) ──

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
    'emitter-shape', 'emitter-size', 'emitter-angle', 'emitter-arc',
    'particle-count', 'spawn-rate', 'speed', 'spread', 'direction', 'gravity', 'turbulence', 'drag', 'wind', 'bounce',
    'orbit', 'speed-variance', 'velocity-decay',
    'particle-size', 'size-variance', 'particle-shape', 'start-alpha', 'twinkle', 'rotation', 'hue-variation', 'effect-strength',
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

  // ── Unified Render & Export ──────────────────────────────────────────
  document.getElementById('btn-render').addEventListener('click', triggerRender);
  document.getElementById('btn-render-top').addEventListener('click', triggerRender);
  document.getElementById('btn-close-render').addEventListener('click', closeRenderModal);

  // Render modal playback controls
  document.getElementById('render-play-btn').addEventListener('click', () => {
    _previewPlaying ? stopPreviewPlayback() : startPreviewPlayback();
  });
  document.getElementById('render-stop-btn').addEventListener('click', () => {
    stopPreviewPlayback();
    _previewFrame = 0;
    drawPreviewFrame(0);
  });
  document.getElementById('render-scrubber').addEventListener('input', e => {
    stopPreviewPlayback();
    const idx = parseInt(e.target.value, 10);
    _previewFrame = idx;
    drawPreviewFrame(idx);
  });
  document.getElementById('render-speed').addEventListener('input', e => {
    _previewSpeed = parseFloat(e.target.value);
    document.getElementById('render-speed-val').textContent = _previewSpeed.toFixed(2) + '\u00d7';
  });
  document.getElementById('render-loop').addEventListener('change', e => {
    _previewLoop = e.target.checked;
  });
  document.getElementById('render-reverse').addEventListener('change', e => {
    _previewReverse = e.target.checked;
  });

  // Export format switch
  document.getElementById('render-export-format').addEventListener('change', updateExportFormatUI);
  document.getElementById('render-export-btn').addEventListener('click', runExport);

  // ── Save / Load / Share ───────────────────────────────────────────────
  document.getElementById('btn-save-cfg').addEventListener('click', saveConfig);
  document.getElementById('load-cfg-input').addEventListener('change', loadConfig);
  document.getElementById('btn-share').addEventListener('click', shareConfig);

  // ── Background color presets ─────────────────────────────────────────────
  document.querySelectorAll('.bg-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.dataset.color;
      applyColorValueToTarget('bg-color', color);
      pushConfig();
    });
  });

  // ── Center emitter ────────────────────────────────────────────────────────
  document.getElementById('btn-center-emitter').addEventListener('click', () => {
    centerEmitter();
  });

  // ── Randomize ──────────────────────────────────────────────────────────
  document.getElementById('btn-randomize').addEventListener('click', randomizeSettings);
  document.getElementById('btn-save-preset').addEventListener('click', saveAsCustomPreset);
  document.getElementById('preset-name-ok').addEventListener('click', confirmSavePreset);
  document.getElementById('preset-name-cancel').addEventListener('click', cancelSavePreset);
  document.getElementById('preset-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmSavePreset();
    if (e.key === 'Escape') cancelSavePreset();
  });
  document.getElementById('name-preset-modal').addEventListener('click', e => {
    if (e.target.id === 'name-preset-modal') cancelSavePreset();
  });

  // ── Keyboard shortcuts panel ──────────────────────────────────────────
  const shortcutsModal = document.getElementById('shortcuts-modal');
  const openShortcuts  = () => shortcutsModal.classList.remove('hidden');
  const closeShortcuts = () => shortcutsModal.classList.add('hidden');
  const closeOverlays  = () => {
    closeShortcuts();
    closeRenderModal();
    cancelSavePreset();
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
    // Copy canvas snapshot to clipboard (Ctrl+C) — only when not in a text input
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        copyCanvasToClipboard();
      }
      return;
    }

    if (e.code === 'Escape') { e.preventDefault(); closeOverlays(); return; }

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space')  { e.preventDefault(); document.getElementById(isRunning ? 'btn-pause' : 'btn-play').click(); }
    if (e.code === 'KeyR')   document.getElementById('btn-reset').click();
    if (e.code === 'KeyB')   document.getElementById('btn-burst')?.click();
    if (e.code === 'KeyF')   toggleFullscreen();
    if (e.key  === '?')      { e.preventDefault(); shortcutsModal.classList.contains('hidden') ? openShortcuts() : closeShortcuts(); }
    if (e.code === 'KeyE')   triggerRender();
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
  container.innerHTML = '';
  Object.entries(EFFECT_PRESETS).forEach(([key, preset], idx) => {
    const btn = document.createElement('button');
    btn.className   = 'effect-preset-btn';
    btn.textContent = preset.label;
    btn.title       = `${preset.label} (key: ${idx + 1})`;
    btn.dataset.key = key;
    btn.addEventListener('click', () => applyEffectPreset(key));
    container.appendChild(btn);
  });

  // ── Custom user presets ──────────────────────────────────────────────
  const custom = getCustomPresets();
  const customKeys = Object.keys(custom);
  if (customKeys.length) {
    const sep = document.createElement('span');
    sep.className = 'preset-sep';
    sep.textContent = '|';
    container.appendChild(sep);
    customKeys.forEach(key => {
      const p = custom[key];
      const wrap = document.createElement('span');
      wrap.className = 'custom-preset-wrap';
      const btn = document.createElement('button');
      btn.className = 'effect-preset-btn custom-preset-btn';
      btn.textContent = p.label;
      btn.title = p.label + ' (custom)';
      btn.dataset.key = key;
      btn.addEventListener('click', () => applyCustomPreset(key));
      const del = document.createElement('button');
      del.className = 'custom-preset-del';
      del.textContent = '\u00d7';
      del.title = 'Delete preset';
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteCustomPreset(key, del); });
      wrap.appendChild(btn);
      wrap.appendChild(del);
      container.appendChild(wrap);
    });
  }
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
  set('emitter-arc',    c.emitterArc ?? 120);
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
  set('orbit',          c.orbit ?? 0);
  set('particle-size',  c.particleSize);
  set('particle-shape', c.particleShape);
  set('hue-variation',  c.hueVariation ?? 0);
  set('blend-mode',     canonicalEffectMode(c.blendMode));
  set('effect-strength', c.effectStrength ?? 1);
  set('shadow-color',   c.shadowColor || '#120018');
  set('size-variance',  c.sizeVariance ?? 0);
  set('start-alpha',    c.startAlpha);
  set('twinkle',        c.twinkle ?? 0);
  set('rotation',       c.rotation ?? 0);
  set('lifetime',       c.lifetime);
  set('fade',           c.fade);
  set('shrink',         c.shrink);
  set('bg-color',       c.bgColor);
  // Trail system: set new trail properties (backward-compat from trailAlpha)
  set('trail-alpha',    c.trailAlpha);
  setCheck('trail-enabled', c.trailEnabled !== undefined ? c.trailEnabled : (c.trailAlpha > 0));
  set('trail-persistence',  c.trailPersistence !== undefined ? c.trailPersistence : Math.round((c.trailAlpha || 0.12) * 100));
  set('trail-opacity',      c.trailOpacity !== undefined ? c.trailOpacity : 100);
  set('trail-softness',     c.trailSoftness !== undefined ? c.trailSoftness : 0);
  set('gradient-start', c.gradientStart || '#ffff00');
  set('gradient-end',   c.gradientEnd   || '#ff0000');

  // Restore gradient stops from preset (or derive from gradientEnd)
  if (c.gradientStops && c.gradientStops.length) {
    setGradientStops(c.gradientStops);
  } else {
    setGradientStops([c.gradientEnd || '#ff0000']);
  }

  set('speed-variance',  c.speedVariance ?? 0);
  set('velocity-decay',  c.velocityDecay ?? 0);
  set('death-count',     c.deathCount ?? 0);
  set('death-speed',     c.deathSpeed ?? 2);
  set('death-size',      c.deathSize ?? 2);
  set('pulse-interval',  c.pulseInterval ?? 2);

  setCheck('loop-toggle',   c.loop ?? false);
  setCheck('bounce',        c.bounce ?? false);

  updateEffectControls();
  updateTrailParamsVisibility();

  if (!c.multiColor) {
    setSingleColor(c.singleColor || c.gradientStart || activeColor);
  }

  // Sync color-mode dropdown from preset flags, then update visibility
  syncColorUIFromMode(colorModeFromFlags(!!c.multiColor, !!c.useGradient));

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
  _activePaletteIdx = 0;
  updateGradientPreview();
  pushConfig();
}

// ── Burst row visibility ───────────────────────────────────────────────────

function updateBurstRowVisibility() {
  const mode = document.getElementById('emitter-mode').value;
  document.getElementById('burst-row').classList.toggle('hidden', mode !== 'burst');
  const pRow = document.getElementById('pulse-interval-row');
  if (pRow) pRow.classList.toggle('hidden', mode !== 'pulse');
  // Spawn rate only applies to continuous mode; hide it for burst and pulse
  const rRow = document.getElementById('spawn-rate-row');
  if (rRow) rRow.classList.toggle('hidden', mode !== 'continuous');
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
    emitterArc:    parseFloat(document.getElementById('emitter-arc')?.value ?? '120') || 120,
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
    orbit:         n('orbit'),
    bounce:        b('bounce'),
    particleSize:  i('particle-size'),
    sizeVariance:  i('size-variance'),
    particleShape: v('particle-shape'),
    hueVariation:  n('hue-variation'),
    blendMode:     blendVal,
    effectStrength,
    shadowColor,
    startAlpha:    n('start-alpha') || 1,
    twinkle:       n('twinkle'),
    rotation:      n('rotation'),
    lifetime:      i('lifetime'),
    fade:          n('fade'),
    shrink:        n('shrink'),
    multiColor:    getColorModeFlags().multiColor,
    useGradient:   getColorModeFlags().useGradient,
    gradientStart: v('gradient-start'),
    gradientEnd:   v('gradient-end'),
    gradientStops: [...getGradientStops()],
    loop:          b('loop-toggle'),
    bgColor:       v('bg-color'),
    trailAlpha:      n('trail-alpha'),
    trailEnabled:    b('trail-enabled'),
    trailPersistence: i('trail-persistence'),
    trailOpacity:    i('trail-opacity'),
    trailSoftness:   i('trail-softness'),
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
  // Apply new trail settings
  setTrailEnabled(b('trail-enabled'));
  setTrailPersistence(i('trail-persistence'));
  setTrailOpacity(i('trail-opacity'));
  setTrailSoftness(i('trail-softness'));
  setRendererBg(v('bg-color'));

  // Queue a history snapshot (debounced so fast slider drags collapse)
  _schedulePush();
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
    emitterArc:    parseFloat(document.getElementById('emitter-arc')?.value ?? '120') || 120,
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
    orbit:         n('orbit'),
    bounce:        b('bounce'),
    particleSize:  i('particle-size'),
    sizeVariance:  i('size-variance'),
    particleShape: v('particle-shape'),
    hueVariation:  n('hue-variation'),
    blendMode:     canonicalEffectMode(v('blend-mode')),
    effectStrength: getEffectStrengthValue(),
    shadowColor:   getShadowColorValue(),
    startAlpha:    n('start-alpha'),
    twinkle:       n('twinkle'),
    rotation:      n('rotation'),
    lifetime:      i('lifetime'),
    fade:          n('fade'),
    shrink:        n('shrink'),
    bgColor:       v('bg-color'),
    trailAlpha:    n('trail-alpha'),
    trailEnabled:    b('trail-enabled'),
    trailPersistence: i('trail-persistence'),
    trailOpacity:    i('trail-opacity'),
    trailSoftness:   i('trail-softness'),
    colorMode:     v('color-mode'),
    multiColor:    getColorModeFlags().multiColor,
    useGradient:   getColorModeFlags().useGradient,
    gradientStart: v('gradient-start'),
    gradientEnd:   gradientStops[0] || v('gradient-end'),
    gradientStops: [...getGradientStops()],
    loop:          b('loop-toggle'),
    // Save emitter position as canvas-relative fractions so it round-trips
    // correctly even if the canvas is resized between save and load.
    emitterPX:     (() => { const c = getCanvas(); return (c && emitterX >= 0) ? emitterX / c.width  : 0.5; })(),
    emitterPY:     (() => { const c = getCanvas(); return (c && emitterY >= 0) ? emitterY / c.height : 0.5; })(),
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
  set('emitter-arc',    snap.emitterArc ?? 120);
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
  set('orbit',          snap.orbit ?? 0);
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
  set('twinkle',        snap.twinkle ?? 0);
  set('rotation',       snap.rotation ?? 0);
  set('lifetime',       snap.lifetime);
  set('fade',           snap.fade);
  set('shrink',         snap.shrink);
  set('bg-color',       snap.bgColor);
  set('trail-alpha',    snap.trailAlpha);
  // Restore new trail properties (with backward-compat defaults from trailAlpha)
  setCheck('trail-enabled', snap.trailEnabled !== undefined ? snap.trailEnabled : (snap.trailAlpha > 0));
  set('trail-persistence', snap.trailPersistence !== undefined ? snap.trailPersistence : Math.round((snap.trailAlpha || 0.12) * 100));
  set('trail-opacity',     snap.trailOpacity !== undefined ? snap.trailOpacity : 100);
  set('trail-softness',    snap.trailSoftness !== undefined ? snap.trailSoftness : 0);
  set('gradient-start', snap.gradientStart);
  set('gradient-end',   snap.gradientEnd);

  // Restore gradient stops
  if (snap.gradientStops && snap.gradientStops.length) {
    setGradientStops(snap.gradientStops);
  } else if (snap.gradientEnd) {
    setGradientStops([snap.gradientEnd]);
  }

  setCheck('loop-toggle',  snap.loop);

  // Restore color-mode dropdown from snapshot flags
  const restoredMode = snap.colorMode || colorModeFromFlags(!!snap.multiColor, !!snap.useGradient);
  syncColorUIFromMode(restoredMode);
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
  updateTrailParamsVisibility();
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
  // Flash button feedback
  const btn = document.getElementById('btn-save-cfg');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Saved!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  }
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


// ── Custom User Presets (localStorage) ────────────────────────────────────

const CUSTOM_PRESETS_KEY = 'pixeldust_custom_presets';

function getCustomPresets() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY)) || {};
  } catch { return {}; }
}

function saveCustomPresets(presets) {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

function saveAsCustomPreset() {
  // Show inline naming UI instead of prompt() to avoid blocking
  const modal = document.getElementById('name-preset-modal');
  const input = document.getElementById('preset-name-input');
  if (!modal || !input) return;
  input.value = '';
  modal.classList.remove('hidden');
  input.focus();
}

function confirmSavePreset() {
  const input = document.getElementById('preset-name-input');
  const modal = document.getElementById('name-preset-modal');
  const name = (input?.value || '').trim();
  if (!name) return;
  modal.classList.add('hidden');
  const key = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const presets = getCustomPresets();
  presets[key] = {
    label: name,
    snapshot: getFullSnapshot(),
    palette: [...activePalette],
    gradientStops: [...gradientStops],
  };
  saveCustomPresets(presets);
  buildEffectPresetBar();
  // Flash feedback
  const btn = document.getElementById('btn-save-preset');
  if (btn) {
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 1200);
  }
}

function cancelSavePreset() {
  document.getElementById('name-preset-modal')?.classList.add('hidden');
}

function deleteCustomPreset(key, delBtn) {
  const presets = getCustomPresets();
  if (!presets[key]) return;
  // Two-click delete: first click arms, second click confirms
  if (!delBtn || delBtn.dataset.armed) {
    delete presets[key];
    saveCustomPresets(presets);
    buildEffectPresetBar();
    return;
  }
  // Arm the button — show confirmation state
  delBtn.dataset.armed = '1';
  delBtn.textContent = '\u2713';           // checkmark
  delBtn.title = 'Click again to confirm delete';
  delBtn.style.opacity = '1';
  delBtn.style.background = '#cc3333';
  // Disarm after 2 seconds if not clicked again
  setTimeout(() => {
    if (delBtn.dataset.armed) {
      delete delBtn.dataset.armed;
      delBtn.textContent = '\u00d7';
      delBtn.title = 'Delete preset';
      delBtn.style.background = '';
      delBtn.style.opacity = '';
    }
  }, 2000);
}

function applyCustomPreset(key) {
  const presets = getCustomPresets();
  const preset = presets[key];
  if (!preset) return;
  // Highlight
  document.querySelectorAll('.effect-preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.key === key);
  });
  applySnapshot(preset.snapshot);
  if (preset.palette && preset.palette.length) {
    activePalette = [...preset.palette];
    buildPaletteGrid(activePalette);
  }
  if (preset.gradientStops && preset.gradientStops.length) {
    setGradientStops(preset.gradientStops);
    buildGradientStops(gradientStops, 0);
  }
  updateGradientPreview();
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

function triggerRender() {
  const frames      = parseInt(document.getElementById('render-frames').value, 10)      || 30;
  const frameSize   = parseInt(document.getElementById('render-frame-size').value, 10)  || 128;
  const fps         = parseInt(document.getElementById('render-fps').value, 10)         || 15;
  const transparentBg = document.getElementById('render-transparent')?.checked ?? false;

  // Pass emitter position as proportional coordinates so the simulator
  // places the emitter at the same relative position within the frame
  const cvs = getCanvas();
  const emitPX = (cvs && emitterX >= 0) ? emitterX / cvs.width  : 0.5;
  const emitPY = (cvs && emitterY >= 0) ? emitterY / cvs.height : 0.5;

  const emitCfg = { ...getEmitterConfig(), _emitterPX: emitPX, _emitterPY: emitPY };
  captureFrames({ frames, frameSize, fps, transparentBg }, emitCfg);
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
  const chosenEmitterShape = pick(['point', 'point', 'line', 'circle', 'disk', 'square', 'triangle', 'arc']);
  set('emitter-shape',  chosenEmitterShape);
  set('emitter-size',   rng(8, 40, 1));
  set('emitter-angle',  rng(0, 360, 1));
  set('emitter-arc',    rng(30, 300, 5));
  set('emitter-mode',   pick(['continuous', 'continuous', 'continuous', 'burst', 'pulse'])); // weight continuous
  set('pulse-interval', rng(0.5, 6, 0.5));
  set('speed-mult',     1);
  set('particle-count', rng(30, 300, 10));
  set('spawn-rate',     rng(20, 200, 10));
  set('speed',          speedUncurve(rng(0.5, 8, 0.5)).toFixed(2));
  set('spread',         rng(5, 360, 5));
  set('direction',      rng(0, 359, 1));
  set('gravity',        rng(-0.5, 0.5, 0.05));
  set('turbulence',     rng(0, 1.5, 0.05));
  set('drag',           rng(0.88, 1.0, 0.005));
  set('wind',           rng(-0.2, 0.2, 0.01));
  set('orbit',          Math.random() < 0.45 ? rng(-2, 2, 0.05) : 0);
  set('hue-variation',  rng(0, 45, 1));
  set('particle-size',  rng(1, 10, 1));
  set('size-variance',  rng(0, 4, 1));
  set('particle-shape', pick(['square', 'circle', 'triangle', 'diamond', 'cross', 'heart', 'star', 'sparkle', 'ring']));
  const chosenBlendMode = pick(['normal', 'glow', 'glow', 'glow', 'prism', 'shadow']);
  set('blend-mode', chosenBlendMode);
  set('effect-strength', chosenBlendMode === 'normal' ? 0 : rng(0.35, 2.6, 0.05));
  set('shadow-color', chosenBlendMode === 'shadow'
    ? pick(['#120018', '#1a0f2e', '#102033', '#2a1010', '#0f2416'])
    : '#120018');
  set('start-alpha',    rng(0.3, 1, 0.05));
  set('twinkle',        Math.random() < 0.35 ? rng(0.15, 1.4, 0.05) : 0);
  set('rotation',       rng(0, 15, 0.5));
  set('lifetime',       rng(20, 200, 5));
  set('fade',           rng(0.2, 1, 0.05));
  set('shrink',         rng(0, 0.8, 0.05));
  // Trail system
  setCheck('trail-enabled', Math.random() > 0.15); // 85% chance trails are on
  set('trail-persistence',  rng(5, 60, 1));
  set('trail-opacity',      rng(50, 100, 5));
  set('trail-softness',     Math.random() < 0.3 ? rng(5, 40, 5) : 0); // 30% chance of softness
  // Sync legacy trail-alpha for compat
  const _trailP = parseInt(document.getElementById('trail-persistence')?.value || '12', 10);
  set('trail-alpha', (_trailP / 100).toFixed(2));

  // Randomize gradient stops BEFORE syncing color UI so the fade-to panel shows correct colours
  const randomHex = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  const numStops = Math.random() < 0.3 ? 2 : 1; // 30% chance of multi-stop
  const newStops = [];
  for (let s = 0; s < numStops; s++) newStops.push(randomHex());
  setGradientStops(newStops);
  set('gradient-end', newStops[0]);

  // Randomize color mode (weighted: palette most common, gradient and palette-fade less so)
  const colorModes = ['single', 'palette', 'palette', 'palette', 'gradient', 'palette-fade'];
  const chosenMode = pick(colorModes);
  syncColorUIFromMode(chosenMode);

  set('speed-variance', rng(0, 0.6, 0.05));
  set('velocity-decay', rng(0, 0.5, 0.05));
  set('death-count',    Math.random() < 0.2 ? rng(1, 4, 1) : 0); // 20% chance of death sparks
  set('death-speed',    rng(1, 4, 0.5));
  set('death-size',     rng(1, 4, 1));

  setCheck('loop-toggle', false);  // no-op if element removed
  setCheck('bounce', Math.random() < 0.3);

  // Random palette
  const paletteNames = Object.keys(PALETTES);
  applyPalette(pick(paletteNames));

  // Rebuild fade-to stop inputs & gradient bar with the new random colours + palette
  buildGradientStops(gradientStops, _activeGradientIdx);
  updateGradientPreview();

  updateBurstRowVisibility();
  updateDeathParamsVisibility();
  updateEmitterShapeRows();
  updateTrailParamsVisibility();
  centerEmitter();

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