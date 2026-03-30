# PixelDust

A browser-based **pixel particle effect creator** for game developers. Design fire, snow, explosions, magic sparkles, and more — then export as a sprite sheet PNG or animated GIF.

---

## Features

### Particle Controls
- **Count** — Max simultaneous particles (1-500)
- **Rate (p/s)** — Spawn rate in particles per second
- **Speed** — Initial velocity magnitude
- **Spread** — Cone angle for velocity direction
- **Direction** — Base direction (270 = up, 90 = down)
- **Gravity** — Per-frame Y acceleration (negative = float up)
- **Turbulence** — Random velocity jitter for organic feel
- **Speed multiplier** — Slow-motion to 3x speed

### Appearance
- **Shape** — Square, Circle, Diamond, Cross, Star, Sparkle
- **Size (px)** — Particle diameter in pixels
- **Size variance** — Random size offset per particle
- **Opacity** — Starting alpha (0.1-1.0)
- **Spin** — Per-frame rotation speed
- **Blend mode** — Normal, Add (Glow), Multiply, Screen
- **Fade** — Alpha decay over lifetime
- **Shrink** — Size decay over lifetime

### Color
- **Color picker** — single color for all particles
- **Multi-color** — pick randomly from the active palette each spawn
- **Gradient** — lerp each particle from start color to end color over its lifetime
- **Palette presets** — Fire, Ice, Magic, Nature, Mono, Sunset

### Emitter
- **Shape** — Point, Line, Circle
- **Mode** — Continuous, Burst, Trail
- **Click or drag** the canvas to reposition the emitter

### Canvas
- **BG Color** — canvas background
- **Trail fade** — lower = longer motion trails
- **Loop preview** — auto-resets the effect for seamless looping
- **Fullscreen** — press F to hide panels for distraction-free preview

### Export
- **Sprite Sheet PNG** — Grid of frames at 64/128/256 px, up to 64 frames
- **Animated GIF** — Up to 5 seconds at up to 30 fps, 256x256 px
- **JSON config** — Save / load full effect settings
- **Shareable URL** — Base64-encoded config in the URL hash

---

## Effect Presets

Press 1-8 to quickly load a preset:

1. Fire
2. Snow
3. Explosion
4. Sparkle
5. Magic
6. Smoke
7. Confetti
8. Portal

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `R` | Reset particles |
| `B` | Fire burst (burst mode) |
| `F` | Toggle fullscreen preview |
| `Z` | Randomize all settings |
| `E` | Export sprite sheet |
| `G` | Export GIF |
| `S` | Save config JSON |
| `?` | Toggle shortcuts panel |
| `Esc` | Close modal / panel |
| `1`-`8` | Select effect preset |
| Click/drag canvas | Move emitter |

---

## Running Locally

No build step needed — plain HTML/CSS/JS.

```bash
# Option 1: VS Code Live Server
# Install the "Live Server" extension, right-click index.html -> Open with Live Server

# Option 2: Python
python -m http.server 8080

# Option 3: Node
npx serve .
```

---

## Project Structure

```
pixeldust/
├── index.html          # UI layout and modals
├── style.css           # Dark pixel-art theme
├── README.md
├── ROADMAP.md
└── js/
    ├── main.js         # Boot + animation loop
    ├── emitter.js      # Particle pool and spawn logic
    ├── particle.js     # Per-particle data + update tick
    ├── renderer.js     # Canvas drawing, crosshair, interaction
    ├── ui.js           # DOM wiring, presets, save/load, randomize
    ├── presets.js      # Effect preset definitions
    ├── palettes.js     # Color palette presets
    └── exporter.js     # Sprite sheet PNG + animated GIF export
```
