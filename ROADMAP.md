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
- [x] Particle shapes: Star, Sparkle, Diamond, Cross (in addition to Square, Circle)
- [x] Draggable emitter position on canvas (click/drag)
- [x] Wind / turbulence slider
- [x] Colour gradient over lifetime (start → end colour lerp)
- [x] Burst mode with manual trigger button
- [x] Loop preview toggle (auto-reset after 1.5× lifetime)
- [x] Touch support on canvas
- [x] BG colour picker
- [x] FPS + live particle count HUD

### v0.3 — Export + Tuning (this session)
- [x] **Animated GIF export** — capture live simulation, encode with gif.js, download
- [x] **Spawn rate (p/s)** — independent slider controlling particles-per-second
- [x] **Particle opacity** — starting alpha separate from fade-out
- [x] **Emoji palette presets** — 🔥 Fire, 🧊 Ice, ✨ Magic, 🌿 Nature, ⬜ Mono, 🌅 Sunset
- [x] **GitHub Pages deploy** — auto-deploy to Pages on push to main

---

## Up Next

### v0.4 — Presets & Sharing
- [ ] **Effect presets** — named full-config presets: Snow, Explosion, Sparkle Rain, Smoke, Confetti
- [ ] **Save / Load config** — JSON export/import of full effect parameters
- [ ] **Shareable URL** — encode config as base64 in URL hash (no backend)
- [ ] **Undo / Redo** — simple config history stack

### v0.5 — Advanced Controls
- [ ] **Rotation** — per-particle spin over lifetime
- [ ] **Speed multiplier** — slow-mo / fast-forward preview
- [ ] **Emitter path** — emitter follows a bezier curve (comet, shooting star effects)
- [ ] **Layered effects** — multiple emitters composited on one canvas
- [ ] **Individual frame ZIP** — download each frame as its own PNG (via JSZip)

### v1.0 — Polish + Launch
- [ ] Full-screen preview mode (hide panels)
- [ ] 20+ named effect presets
- [ ] README + live demo link on GitHub
- [ ] itch.io listing (free browser tool)
- [ ] Product Hunt / r/gamedev launch

---

## Technical Notes
- Current: vanilla JS + script tags — intentional (zero build step, offline-capable)
- Migrate to **Vite + ES modules** once codebase exceeds ~1500 LOC
- GIF encoding uses gif.js Web Workers — already off main thread
- URL sharing: `JSON.stringify(cfg)` → base64 → `location.hash`
- Multi-emitter: introduce `EffectStack` owning array of `Emitter` instances
