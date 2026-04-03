/**
 * palettes.js
 * Colour palette presets for PixelDust.
 * Each preset is an array of hex colour strings.
 * The "active" palette drives multi-colour particle spawning.
 */

const PALETTES = {
  fire: [
    '#ffff00', '#ffdd00', '#ffaa00', '#ff7700',
    '#ff4400', '#dd2200', '#aa1100', '#ff6622',
  ],
  ice: [
    '#ffffff', '#cce8ff', '#88ccff', '#44aaee',
    '#2288cc', '#1166aa', '#0044aa', '#aaddff',
  ],
  magic: [
    '#ff88ff', '#cc44ff', '#8822ee', '#6600cc',
    '#ff44cc', '#ff22aa', '#ffaaff', '#cc22ff',
  ],
  nature: [
    '#44ff44', '#22dd22', '#00aa00', '#228822',
    '#aaff44', '#88dd22', '#ffff44', '#005500',
  ],
  mono: [
    '#ffffff', '#dddddd', '#aaaaaa', '#888888',
    '#555555', '#333333', '#111111', '#eeeeee',
  ],
  sunset: [
    '#ff9966', '#ff6644', '#ff3366', '#ff0066',
    '#ffcc44', '#ff8844', '#dd4422', '#ffaa22',
  ],
  ocean: [
    '#00eeff', '#00bbcc', '#0088aa', '#006688',
    '#004466', '#aaeeff', '#55ddee', '#0044aa',
  ],
  aurora: [
    '#7df9ff', '#42d6ff', '#00b8d9', '#4cff9a',
    '#7dffcf', '#c77dff', '#ff7ad9', '#e9fff8',
  ],
  candy: [
    '#ff6fb5', '#ff8fab', '#ffb3c6', '#ffd6a5',
    '#fff1a8', '#caffbf', '#9bf6ff', '#bdb2ff',
  ],
  storm: [
    '#f3f6ff', '#c9d6ea', '#93a8c7', '#5f7391',
    '#34435e', '#1b2338', '#5fd1ff', '#8ef9f3',
  ],
  forest: [
    '#e8f5c8', '#a8d672', '#5fa84a', '#2f6b3b',
    '#1f4a2b', '#7b4f2a', '#c48b3a', '#f7d774',
  ],
  retro: [
    '#ff5e5b', '#ffb400', '#fff3b0', '#00cecb',
    '#00a6a6', '#3d5a80', '#98c1d9', '#ee6c4d',
  ],
  royal: [
    '#f7f2ff', '#d8c4ff', '#a67cff', '#6f4bff',
    '#3521a1', '#1c144d', '#ffd166', '#ffef9f',
  ],
  lava: [
    '#ff2200', '#dd1100', '#880000', '#660000',
    '#ff5500', '#aa2200', '#ff8800', '#331100',
  ],
  neon: [
    '#ff00ff', '#00ffff', '#ff0066', '#00ff66',
    '#6600ff', '#ff6600', '#ffff00', '#0066ff',
  ],
};

// Default single colour when multi-colour is off
let activeColor = '#ff6b35';

// Active palette colours (used when multi-colour is on)
let activePalette = [...PALETTES.fire];

/**
 * Pick a random colour from the active palette.
 * Falls back to activeColor if palette is empty.
 */
function randomPaletteColor() {
  if (!activePalette.length) return activeColor;
  return activePalette[Math.floor(Math.random() * activePalette.length)];
}

/**
 * Convert a hex string (#rrggbb) to an {r,g,b} object.
 */
function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

// ── Gradient stops (fade-to destination colours) ──────────────────────────
let gradientStops = ['#ff0000'];
let gradientStopsRgb = [{ r: 255, g: 0, b: 0 }];

function setGradientStops(stops) {
  gradientStops = stops.length ? [...stops] : ['#ff0000'];
  gradientStopsRgb = gradientStops.map(hexToRgb);
}

function getGradientStops() {
  return gradientStops;
}

function getGradientStopsRgb() {
  return gradientStopsRgb;
}
