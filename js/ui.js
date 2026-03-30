/**
 * ui.js
 * Wires all DOM controls to the emitter/renderer state.
 * v0.3: effect presets, save/load JSON, shareable URL.
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
  document.getElementById('color-picker').value                     = hex;
  document.getElementById('swatch-current-color').style.background  = hex;
  document.getElementById('swatch-hex').textContent                 = hex;
}

// ── initUI ─────────────────────────────────────────────────────────────────

function initUI() {
  initSliderDisplays();
  buildEffectPresetBar();

  // Load from URL hash if present, else default fire preset
  if (!loadFromHash()) {
    applyEffectPreset('fire');
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

  // ── Gradient ─────────────────────────────────────────────────────────
  const useGradientEl     = document.getElementById('use-gradient');
  const gradientPickersEl = document.getElementById('gradient-pickers');
  useGradientEl.addEventListener('change', () => {
    gradientPickersEl.classList.toggle('hidden', !useGradientEl.checked);
    pushConfig();
  });
  document.getElementById('gradient-start').addEventListener('input', pushConfig);
  document.getElementById('gradient-end').addEventListener('input',   pushConfig);

  // ── Loop toggle ───────────────────────────────────────────────────────
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

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); document.getElementById(isRunning ? 'btn-pause' : 'btn-play').click(); }
    if (e.code === 'KeyR')  document.getElementById('btn-reset').click();
    if (e.code === 'KeyB')  document.getElementById('btn-burst')?.click();
  });

  pushConfig();
  updateBurstRowVisibility();
  startEmitterPosHUD();
}

// ── Effect preset bar ──────────────────────────────────────────────────────

function buildEffectPresetBar() {
  const container = document.getElementById('effect-preset-btns');
  Object.entries(EFFECT_PRESETS).forEach(([key, preset]) => {
    const btn = document.createElement('button');
    btn.className   = 'effect-preset-btn';
    btn.textContent = preset.label;
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
  set('particle-count', c.count);
  set('spawn-rate',     c.spawnRate);
  set('speed',          c.speed);
  set('spread',         c.spread);
  set('direction',      c.direction);
  set('gravity',        c.gravity);
  set('turbulence',     c.turbulence);
  set('particle-size',  c.particleSize);
  set('particle-shape', c.particleShape);
  set('blend-mode',     c.blendMode);
  set('start-alpha',    c.startAlpha);
  set('lifetime',       c.lifetime);
  set('fade',           c.fade);
  set('shrink',         c.shrink);
  set('bg-color',       c.bgColor);
  set('trail-alpha',    c.trailAlpha);
  set('gradient-start', c.gradientStart || '#ffff00');
  set('gradient-end',   c.gradientEnd   || '#ff0000');

  setCheck('multi-color',   c.multiColor);
  setCheck('use-gradient',  c.useGradient);
  setCheck('loop-toggle',   false);

  // Show/hide gradient pickers
  document.getElementById('gradient-pickers').classList.toggle('hidden', !c.useGradient);

  // Apply palette
  if (palette && PALETTES[palette]) applyPalette(palette);

  // Re-sync all val-display spans
  document.querySelectorAll('.val-display').forEach(display => {
    const slider = document.getElementById(display.dataset.for);
    if (slider) {
      const v = parseFloat(slider.value);
      display.textContent = Number.isInteger(v) ? v : v.toFixed(2);
    }
  });

  updateBurstRowVisibility();
  resetParticles();
  clearCanvas();
  pushConfig();

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

  const blendVal = v('blend-mode');

  setEmitterConfig({
    emitterShape:  v('emitter-shape'),
    emitterMode:   v('emitter-mode'),
    count:         i('particle-count'),
    spawnRate:     i('spawn-rate') || 60,
    speed:         n('speed'),
    spread:        n('spread'),
    direction:     n('direction'),
    gravity:       n('gravity'),
    turbulence:    n('turbulence'),
    particleSize:  i('particle-size'),
    particleShape: v('particle-shape'),
    blendMode:     blendVal,
    startAlpha:    n('start-alpha') || 1,
    lifetime:      i('lifetime'),
    fade:          n('fade'),
    shrink:        n('shrink'),
    multiColor:    b('multi-color'),
    useGradient:   b('use-gradient'),
    gradientStart: v('gradient-start'),
    gradientEnd:   v('gradient-end'),
    loop:          b('loop-toggle'),
    bgColor:       v('bg-color'),
  });

  setBlendMode(blendVal);
  setTrailAlpha(n('trail-alpha'));
  setRendererBg(v('bg-color'));
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
    count:         i('particle-count'),
    spawnRate:     i('spawn-rate'),
    speed:         n('speed'),
    spread:        n('spread'),
    direction:     n('direction'),
    gravity:       n('gravity'),
    turbulence:    n('turbulence'),
    particleSize:  i('particle-size'),
    particleShape: v('particle-shape'),
    blendMode:     v('blend-mode'),
    startAlpha:    n('start-alpha'),
    lifetime:      i('lifetime'),
    fade:          n('fade'),
    shrink:        n('shrink'),
    bgColor:       v('bg-color'),
    trailAlpha:    n('trail-alpha'),
    multiColor:    b('multi-color'),
    useGradient:   b('use-gradient'),
    gradientStart: v('gradient-start'),
    gradientEnd:   v('gradient-end'),
    loop:          b('loop-toggle'),
    palette:       activePalette,
  };
}

function applySnapshot(snap) {
  const set      = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
  const setCheck = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.checked = !!val; };

  set('emitter-shape',  snap.emitterShape);
  set('emitter-mode',   snap.emitterMode);
  set('particle-count', snap.count);
  set('spawn-rate',     snap.spawnRate);
  set('speed',          snap.speed);
  set('spread',         snap.spread);
  set('direction',      snap.direction);
  set('gravity',        snap.gravity);
  set('turbulence',     snap.turbulence);
  set('particle-size',  snap.particleSize);
  set('particle-shape', snap.particleShape);
  set('blend-mode',     snap.blendMode);
  set('start-alpha',    snap.startAlpha);
  set('lifetime',       snap.lifetime);
  set('fade',           snap.fade);
  set('shrink',         snap.shrink);
  set('bg-color',       snap.bgColor);
  set('trail-alpha',    snap.trailAlpha);
  set('gradient-start', snap.gradientStart);
  set('gradient-end',   snap.gradientEnd);

  setCheck('multi-color',  snap.multiColor);
  setCheck('use-gradient', snap.useGradient);
  setCheck('loop-toggle',  snap.loop);

  document.getElementById('gradient-pickers').classList.toggle('hidden', !snap.useGradient);

  if (snap.palette && snap.palette.length) {
    activePalette = [...snap.palette];
    buildPaletteGrid(activePalette);
    setSingleColor(activePalette[0]);
  }

  document.querySelectorAll('.val-display').forEach(display => {
    const slider = document.getElementById(display.dataset.for);
    if (slider) {
      const v = parseFloat(slider.value);
      display.textContent = Number.isInteger(v) ? v : v.toFixed(2);
    }
  });

  updateBurstRowVisibility();
  resetParticles();
  clearCanvas();
  pushConfig();
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

// ── Export ─────────────────────────────────────────────────────────────────

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
  }, { ...getEmitterConfig() });
}
