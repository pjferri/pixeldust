# PixelDust — Development Roadmap

---

## Shipped ✓

### v0.1 — Core Engine
- [x] Canvas-based particle system (vanilla JS, no dependencies)
- [x] Pixel-perfect rendering (crisp squares/circles, no anti-aliasing)
- [x] Emitter shapes: Point, Line, Circle
- [x] Emitter modes: Continuous, Burst, Trail
- [x] Controls: count, speed, spread, direction, gravity, size, lifetime, fade, shrink
- [x] Pixel-art colour palettes: Fire, Ice, Magic, Nature, Mono, Sunset
- [x] Multi-colour mode (random from palette per particle)
- [x] Blend modes: Normal, Add (Glow), Multiply, Screen
- [x] Motion trail effect (configurable persistence)
- [x] Sprite sheet PNG export (configurable frames, frame size, columns)
- [x] Dark Aseprite-inspired UI
- [x] Keyboard shortcuts (Space = play/pause, R = reset, B = burst)

### v0.2 — Polish + Interactivity
- [x] Particle shapes: Star, Sparkle, Diamond, Cross
- [x] Draggable emitter position on canvas (click/drag + touch)
- [x] Wind / turbulence slider
- [x] Colour gradient over lifetime (start → end colour lerp)
- [x] Loop preview toggle (auto-reset after 1.5x lifetime)
- [x] BG colour picker, Trail fade control
- [x] FPS + live particle count HUD

### v0.3 — Export + Controls + Presets
- [x] Animated GIF export (gif.js CDN, progress modal, download)
- [x] Spawn rate (p/s) — particles-per-second independent of max count
- [x] Particle opacity — starting alpha slider
- [x] Particle rotation / spin — per-particle spin speed
- [x] Speed multiplier — 0.1x slow-mo to 3x fast-forward
- [x] 8 full effect presets — Fire, Snow, Explosion, Sparkle, Magic, Smoke, Confetti, Portal
- [x] Preset keyboard shortcuts — keys 1-8 switch presets instantly
- [x] Keyboard shortcuts modal
- [x] Save / Load config — JSON export and import of full effect parameters
- [x] Shareable URL — base64-encodes config into URL hash

### v0.4 — UX Polish
- [x] Full-screen preview — hide panels, focus canvas (F key)
- [x] Size variance slider — randomize particle size within a range
- [x] Transparent background export option for sprite sheets
- [x] Effect mode redesigned: glow/neon/screen/shadow (multi-pass rendering)
- [x] Effect strength slider — control intensity of glow/neon/screen/shadow

### v0.5 — Physics + Presets Expansion
- [x] **Air drag** — velocity dampening slider; makes smoke, rain, and feathers feel right
- [x] **Continuous fade** — fade slider is now truly continuous (was binary on/off before)
- [x] **5 new presets** — Rain, Healing, Electric, Waterfall, Firework (13 total)
- [x] **3 new palettes** — Ocean, Lava, Neon (9 total)
- [x] **Undo / Redo** — Ctrl+Z / Ctrl+Y with 60-step debounced history
- [x] **Copy canvas** — Ctrl+C or C copies current frame to clipboard as PNG
- [x] **Randomize improvements** — now randomizes drag, effect strength, gradient colors

---

## Up Next

### v0.6 — Advanced Physics + Export
- [ ] **Emitter path** — emitter follows a bezier or figure-8 path (comet, orbit)
- [ ] **Velocity dampening axis** — drag X and Y independently for more natural rain/snow
- [ ] **Individual frame ZIP** — download each sprite sheet frame as its own PNG (JSZip)
- [ ] **Higher res GIF** — option to export at 512x512
- [ ] **Particle death burst** — small burst when particle expires

### v0.7 — Discovery + Community
- [ ] Community gallery — sharable effect showcase via URL hash links
- [ ] itch.io listing with live demo and GIF previews of each preset
- [ ] r/gamedev / r/pixelart launch post

---

## Technical Notes
- Vanilla JS + script tags — intentional (zero build step, offline-capable)
- Migrate to **Vite + ES modules** when codebase exceeds ~3000 LOC
- GIF encoding uses gif.js Web Workers — off main thread
- URL sharing: JSON.stringify(cfg) -> base64 -> location.hash
- Undo history: debounced snapshots, 60-entry ring buffer
