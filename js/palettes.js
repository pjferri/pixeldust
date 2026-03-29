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
