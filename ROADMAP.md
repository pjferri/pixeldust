# PixelDust — Development & Monetization Roadmap

> A free, browser-based pixel particle effect creator. Built in the open,
> monetized through a premium itch.io release.

---

## Phase 1 — Free Web Tool (Launch)

**Goal:** Ship a polished, genuinely useful tool and start building an audience.

### Core Features (v0.1 — this commit)
- [x] Canvas-based particle system (vanilla JS, no dependencies)
- [x] Pixel-perfect rendering (crisp squares/circles, no anti-aliasing)
- [x] Emitter shapes: Point, Line, Circle
- [x] Emitter modes: Continuous, Burst, Trail
- [x] Full controls: count, speed, spread, direction, gravity, size, lifetime, fade, shrink
- [x] Pixel-art colour palette with 6 presets (Fire, Ice, Magic, Nature, Mono, Sunset)
- [x] Multi-colour mode (random from palette per particle)
- [x] Blend modes: Normal, Add (Glow), Multiply, Screen
- [x] Motion trail effect (configurable persistence)
- [x] Sprite sheet PNG export (configurable frames, frame size, columns)
- [x] Dark Aseprite-inspired UI
- [x] Keyboard shortcuts (Space = play/pause, R = reset)

### v0.2 Goals (Polish before sharing)
- [ ] More particle shapes: Star, Sparkle, Triangle
- [ ] Emitter position: drag to reposition emitter on canvas
- [ ] Wind / turbulence parameter
- [ ] Colour gradient over lifetime (spawn colour → death colour)
- [ ] Better burst mode: manual trigger button + auto-loop option
- [ ] Mobile-friendly layout tweak (touch support on canvas)

### Deployment
- Deploy to **GitHub Pages** (free, zero infra).
  - `gh-pages` branch auto-deployed from `main` via GitHub Actions.
  - Custom domain optional: `pixeldust.app` (~$12/yr on Namecheap).
- Alternatively **Netlify** for instant preview deploys per PR.

### Audience Building
The tool is only valuable if people find it. Prioritize:

1. **Twitter/X launch thread** — record a short screen capture showing Fire,
   Magic, and Explosion presets. Dev tools content performs well.
2. **Reddit posts** in r/gamedev, r/pixelart, r/webdev — lead with the free
   angle, link the live tool, ask for feedback.
3. **itch.io page (free tier)** — list it as a free browser tool. itch.io has
   game dev traffic built-in and will index the project.
4. **Open source it** — a clean repo with good README attracts stars, which
   compound into organic discovery.

**Success metric for Phase 1:** 500 unique users in the first month, a handful
of people asking for features (signals genuine engagement, not just bounce traffic).

---

## Phase 2 — Polish + Premium Prep

**Goal:** Turn the free tool into something a professional game developer
would actually reach for. Build the features that justify a $10 price tag.

### Feature Priority

#### Must-have for premium viability
- **GIF export** — the #1 requested feature from every tool like this.
  Use a pure-JS GIF encoder (e.g. gif.js) so there's no server dependency.
- **Save / Load effect configs** — JSON export/import so users can share
  parameter sets. This also enables the preset library.
- **Preset library** — 20+ named effects shipped by default:
  `fire`, `magic_sparkle`, `snow`, `explosion`, `confetti`, `blood`,
  `smoke`, `water_splash`, `lightning`, `portal_warp`, etc.
  Each preset should look immediately usable in a game.

#### High value, lower effort
- **Individual frame export** — ZIP download of each frame as its own PNG.
  Use JSZip (lightweight, MIT). Critical for devs who don't want sprite sheets.
- **Effect JSON sharing** — "Copy link" that encodes the config as a URL hash.
  Zero backend, but enables community sharing.
- **Loop preview mode** — play the effect in a true loop, useful for GIF-style
  effects like fire and snow.
- **Emitter path** — allow the emitter to follow a bezier path over time
  (creates comet, shooting star, trail effects).

#### UX improvements
- **Undo / Redo** — simple config history stack, invaluable for tweaking.
- **Full-screen preview** — hide panels, focus on the canvas.
- **Dark/light colour scheme toggle** — some people genuinely prefer light mode.

### Community Angle
A "share your effect" feature (even just URL hashes + a Tweets) creates
social proof that makes the premium version easier to sell. Consider a simple
gallery page (`/gallery`) seeded with a dozen showcase effects.

**Success metric for Phase 2:** Average session time > 3 minutes (users are
actually tweaking effects, not just landing and leaving). Gallery has 50+
user-submitted configs.

---

## Phase 3 — Premium & Monetization

**Goal:** Earn revenue from the audience built in Phases 1–2.

### What the Premium Version Includes

The free/premium split should be **generous free, clear premium value** —
not hobbled free. People who pay should feel they got something real, not
just an unlock code.

| Feature                        | Free | Premium |
|-------------------------------|------|---------|
| All basic controls             | ✓    | ✓       |
| Colour palettes + presets      | ✓    | ✓       |
| PNG sprite sheet export        | ✓    | ✓       |
| Core preset library (10 fx)    | ✓    | ✓       |
| GIF export                     | ✗    | ✓       |
| Individual frame ZIP export    | ✗    | ✓       |
| Full preset library (50+ fx)   | ✗    | ✓       |
| Save / load configs            | ✗    | ✓       |
| Emitter path animation         | ✗    | ✓       |
| Layered effects (multi-emitter)| ✗    | ✓       |
| Priority support / Discord     | ✗    | ✓       |

The key premium features — GIF export, layered effects, the full preset library
— are valuable enough to justify the price without making the free tier feel broken.

### Sales Channels

**itch.io ($10 one-time)**
- Primary channel. itch.io is the natural home for game-dev tools.
- It has built-in discoverability (game jam assets, tool searches).
- Collect emails at checkout (itch.io supports this).
- Run 50% launch sale for the first 2 weeks to drive social proof reviews.
- Price point: **$9.99**. Matches the inspiration tool, feels low-friction.

**Gumroad (optional)**
- Good for bundles (PixelDust + asset packs from other creators).
- Slightly better analytics than itch.io.
- Lower discovery, but works well if you already have a mailing list.

**Patreon / Ko-fi (optional, Phase 3b)**
- Only worth pursuing if you want to build a community / regular update cadence.
- Tier: $3/mo = access to beta features. $8/mo = includes all future premium content.
- Best if you enjoy making devlogs / posting updates. Don't start this until
  you have at least a few hundred engaged free users.

### Revenue Projections

These are rough, honest estimates — not hype.

| Monthly Free Users | Conversion Rate | Price  | Monthly Revenue |
|-------------------|----------------|--------|----------------|
| 500               | 1%             | $10    | $50            |
| 500               | 3%             | $10    | $150           |
| 2,000             | 1%             | $10    | $200           |
| 2,000             | 3%             | $10    | $600           |
| 5,000             | 2%             | $10    | $1,000         |
| 10,000            | 2%             | $10    | $2,000         |

1–3% conversion is realistic for a niche tool with a clear use case and a
low price point. The lever is traffic — which is why Phase 1's audience
building matters more than it might seem.

A realistic Phase 3 target: **$200–500/month passive** after 6 months of
Phase 1+2 work. That's not life-changing, but it funds the domain, covers
coffee, and proves the model. With a game jam partnership or a good Product
Hunt launch, a spike to $1k+ in a single month is plausible.

### Timeline (rough)
- **Month 1** — Phase 1 launch, gather feedback
- **Month 2–3** — Phase 2 polish, build preset library, GIF export
- **Month 4** — Soft launch premium on itch.io, reach out to pixel art communities
- **Month 6** — Evaluate traffic/conversion, decide whether Patreon is worth it

---

## Technical Debt & Future Architecture Notes

- The current vanilla JS + script-tag approach is intentional: zero build step,
  easy to hack on, works offline. When the codebase grows past ~1500 LOC,
  migrate to **Vite + ES modules** (no framework needed, just bundler + HMR).
- If GIF export gets slow, move the encoding to a **Web Worker** to keep the UI
  responsive during export.
- For the "share config via URL" feature: JSON.stringify the config → base64 →
  store in `location.hash`. No backend needed, links are portable.
- If layered effects (multiple emitters) are added, introduce a simple
  `EffectStack` class that owns an array of `Emitter` instances.
