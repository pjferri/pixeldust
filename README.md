# PixelDust

A browser-based pixel-art particle effect designer. Design an effect with live preview, then export it as a PNG spritesheet (with JSON frame metadata), animated GIF, video, or single frame — ready to drop into a game engine or animation tool.

No build step, no framework — plain HTML/CSS/JS on a `<canvas>`.

## Running it

Open `index.html` directly in a browser, or serve it locally:

```
npm install
npm start
```

An internet connection is only needed for GIF export (gif.js is loaded from a CDN).

## Features

- 24 built-in effect presets (fire, snow, explosion, portal, galaxy, and more) plus savable custom presets
- Emitter shapes (point, line, circle, disk, square, triangle, arc) with continuous, burst, and pulse modes
- Physics: gravity, wind, drag, turbulence, vortex, velocity decay, wall bounce, gravity wells, and interactive mouse force
- 9 particle shapes, glow/prism/shadow render styles, twinkle, spin, hue variation
- Color palettes, multi-stop fade-to gradients, and 15 palette presets
- Unity-style point-history trail system with length in seconds (up to permanent “paint mode”), opacity, and trail-softness controls
- Custom image particles: upload any image to use as the particle + trail sprite, with optional color tinting
- Standalone Soften effect that blurs the whole composed effect
- WYSIWYG canvas: pick a canvas size (default big, or 64/128/256/512 sprite sizes shown zoomed with crisp pixels) and renders capture it pixel-for-pixel — no separate frame settings
- Render pipeline: renders start from a clean reset, live spritesheet layout preview, animated preview with scrubber, and export to spritesheet + JSON, GIF, video (MP4/WebM), or PNG
- Save/load configs as JSON, shareable URLs, undo/redo, keyboard shortcuts (press `?` in the app)

## Project structure

| File | Purpose |
|---|---|
| `js/palettes.js` | Color palettes and gradient stop state |
| `js/trails.js` | Shared point-history trail system + custom particle image |
| `js/particle.js` | Particle creation, per-frame physics, force wells |
| `js/emitter.js` | Particle pool, spawn logic, emitter config |
| `js/renderer.js` | Canvas drawing, trails, effect styles, canvas interaction |
| `js/presets.js` | Built-in effect presets |
| `js/exporter.js` | Offline render simulator and export encoders |
| `js/ui.js` | DOM wiring, undo/redo, save/load/share, randomizer |
| `js/main.js` | Boot + main animation loop |
