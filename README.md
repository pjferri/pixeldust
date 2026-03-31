# PixelDust

A browser-based **pixel particle effect creator** for game developers. Design fire, snow, explosions, magic sparkles, and more — then export as a sprite sheet PNG or animated GIF.

---

## Features

### Particle Physics
- **Count** — Max simultaneous particles (1–500)
- **Rate (p/s)** — Spawn rate in particles per second
- **Speed** — Initial velocity magnitude
- **Spread** — Cone angle for velocity direction
- **Direction** — Base direction (270 = up, 90 = down)
- **Gravity** — Per-frame Y acceleration (negative = float up)
- **Turbulence** — Random velocity jitter for organic feel
- **Air drag** — Velocity dampening per frame (0.85–1.0); makes smoke and rain feel right
- **Wind** — Constant horizontal force per frame
- **Bounce walls** — Particles reverse velocity when hitting canvas edges
- **Speed multiplier** — Slow-motion to 3× fast-forward

### Appearance
- **Shape** — Square, Circle, Diamond, Cross, Star, Sparkle
- **Size (px)** — Particle diameter in pixels
- **Size variance** — Random size offset per particle
- **Opacity** — Starting alpha (0.1–1.0)
- **Spin** — Per-frame rotation speed
- **Hue variation** — Per-particle random hue offset
- **Effect mode** — Normal, Glow, Neon, Screen, Shadow (multi-pass rendering)
- **Effect amount** — Intensity of the chosen effect mode
- **Trail fade** — Controls motion persistence (lower = longer trails)
- **Fade** — Continuous alpha decay over lifetime (0 = none, 1 = full)
- **Shrink** — Size decay over lifetime

### Color
- **Color picker** — Single color for all particles
- **Multi-color** — Pick randomly from the active palette each spawn
- **Gradient** — Lerp each particle from start color to end color over its lifetime
- **Palette presets** — Fire, Ice, Magic, Nature, Mono, Sunset, Ocean, Lava, Neon

### Emitter
- **Shape** — Point, Line, Circle
- **Mode** — Continuous, Burst, Trail
- **Click or drag** the canvas to reposition the emitter
- **Center button** or `Home` key to snap emitter back to center

### Canvas
- **BG Color** — Canvas background with 5 quick preset swatches (Near Black, Dark Navy, Deep Purple, Dark Forest, Light)
- **Loop preview** — Auto-resets the effect for seamless looping
- **Fullscreen** — Press `F` to hide panels for distraction-free preview

### Export
- **Sprite Sheet PNG** — Grid of frames at 64/128/256 px, up to 64 frames, optional transparent background
- **Animated GIF** — Up to 5 seconds at up to 30 fps, 256×256 px
- **JSON config** — Save / load full effect settings
- **Shareable URL** — Base64-encoded config in the URL hash

---

## Effect Presets

Press `1`–`9` to quickly load a preset. All 18 presets are in the preset bar:

| # | Name | Description |
|---|------|-------------|
| 1 | Fire | Rising flames with gradient fade |
| 2 | Snow | Drifting snowflakes |
| 3 | Explosion | Burst of shrapnel |
| 4 | Sparkle | Glowing star sparkles |
| 5 | Magic | Floating star magic |
| 6 | Smoke | Soft smoke plume |
| 7 | Confetti | Spinning colorful confetti |
| 8 | Portal | Circular portal vortex |
| 9 | Rain | Driving rainfall |
| — | Healing | Rising nature stars |
| — | Electric | Chaotic lightning sparks |
| — | Waterfall | Cascading water |
| — | Firework | Burst firework star |
| — | Leaves | Drifting autumn leaves |
| — | Comet | Trail-mode comet tail |
| — | Bubbles | Floating transparent bubbles |
| — | Billiards | Bouncing pool balls |
| — | Laser | Bouncing laser beams |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `R` | Reset particles |
| `B` | Fire burst (burst mode) |
| `F` | Toggle fullscreen preview |
| `Z` | Randomize all settings |
| `Home` | Center emitter on canvas |
| `E` | Export sprite sheet |
| `G` | Export GIF |
| `S` | Save config JSON |
| `C` | Copy canvas to clipboard |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `?` | Toggle shortcuts panel |
| `Esc` | Close modal / panel |
| `1`–`9` | Select effect preset |
| Click/drag canvas | Move emitter |

---

## Running Locally

No build step needed — plain HTML/CSS/JS.

```bash
# Option 1: VS Code Live Server
# Install the "Live Server" extension, right-click index.html -> Open with Live Server

# Option 2: Node
npx serve .

# Option 3: Python
python3 -m http.server 8080
```

Then open `http://localhost:5500` (or whichever port) in your browser.

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
    ├── particle.js     # Per-particle data + update tick (drag, bounce, fade, turbulence)
    ├── renderer.js     # Canvas drawing, multi-pass glow/neon/screen/shadow
    ├── ui.js           # DOM wiring, presets, undo/redo, save/load, randomize
    ├── presets.js      # 18 effect preset definitions
    ├── palettes.js     # 9 color palette presets
    └── exporter.js     # Sprite sheet PNG + animated GIF export
```

---

## Built With

Vanilla JS — no runtime dependencies, no build step.
