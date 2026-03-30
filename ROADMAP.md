# PixelDust — Development Roadmap

> A free, browser-based pixel particle effect creator.

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
- [x] Loop preview toggle (auto-reset after 1.5× lifetime)
- [x] BG colour picker, Trail fade control
- [x] FPS + live particle count HUD

### v0.3 — Export + Controls + Presets (current)
- [x] **Animated GIF export** — gif.js CDN, progress modal, download
- [x] **Spawn rate (p/s)** — particles-per-second independent of max count
- [x] **Particle opacity** — starting alpha slider
- [x] **Particle rotation / spin** — per-particle spin speed with rotation slider
- [x] **Speed multiplier** — 0.1× slow-mo to 3× fast-forward (tick accumulator)
- [x] **8 full effect presets** — Fire, Snow, Explosion, Sparkle, Magic, Smoke, Confetti, Portal
- [x] **Preset keyboard shortcuts** — keys 1–8 switch presets instantly
- [x] **Keyboard shortcuts modal** — ⌨ Keys button shows all shortcuts
- [x] **Save / Load config** — JSON export and import of full effect parameters
- [x] **Shareable URL** — base64-encodes config into URL hash, copies to clipboard
- [x] **Emoji palette preset buttons** — 🔥🧊✨🌿⬜🌅
- [x] **GitHub Pages deploy** — auto-deploys to Pages on push to main

---

## Up Next

### v0.4 — UX Polish
- [ ] **Undo / Redo** — simple config history stack (Ctrl+Z / Ctrl+Y)
- [ ] **Full-screen preview** — hide panels, focus canvas (F key)
- [ ] **Size variance slider** — randomize particle size within a range
- [ ] **Emitter path** — emitter follows a bezier curve (comet, shooting star)
- [ ] **Individual frame ZIP** — download each sprite sheet frame as its own PNG (JSZip)

### v0.5 — Social + Discovery
- [ ] Community gallery — sharable effect showcase via URL hash links
- [ ] README with live demo link + GIF previews of each preset
- [ ] itch.io listing (free browser tool)
- [ ] r/gamedev / r/pixelart launch post

---

## Technical Notes
- Vanilla JS + script tags — intentional (zero build step, offline-capable)
- Migrate to **Vite + ES modules** when codebase exceeds ~2000 LOC
- GIF encoding uses gif.js Web Workers — off main thread
- URL sharing: `JSON.stringify(cfg)` → base64 → `location.hash`
- Multi-emitter: introduce `EffectStack` owning array of `Emitter` instances
