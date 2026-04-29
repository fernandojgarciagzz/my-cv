# fernandogarciag.com

Personal portfolio and creative hub for Fernando García — Engineer, Product Manager, and Agentic AI Solutions Architect at Salesforce.

**Live site:** [fernandogarciag.com](https://fernandogarciag.com)

---

## Pages

| Page | Description |
|------|-------------|
| [`index.html`](index.html) | Main portfolio — hero, about, experience timeline, skills, tools, education, hobbies, and contact |
| [`playground.html`](playground.html) | AI Agent Runner — an endless-runner game with keyboard and touch/swipe controls |
| [`music.html`](music.html) | Roho — a custom music player for original tracks with vinyl aesthetics and MediaSession API |
| [`dashboards.html`](dashboards.html) | Live data dashboards (e.g., The AI Race — benchmarks, pricing, and capabilities across top AI companies) |

## Features

- **Dark mode** with localStorage persistence across all pages
- **Claude Mode** — warm Anthropic-inspired color palette on the main portfolio
- **3D hero background** via Spline iframe
- **Interactive perspective grid** — Three.js floor grid with distance falloff, travelling ripple, scroll-direction-aware flow, and cursor-tracking hover glow (raycast onto the grid plane)
- **Agent showcase morph** — sticky scroll-driven 3D point cloud (~5400 particles) that transitions between four forms: Intelligence (folded brain) → Agents (4 bust silhouettes in a square) → Process (DNA helix) → Orchestration (icosahedron engine + core)
- **Scroll-driven animations** — reveal on scroll, parallax hero, scroll progress bar, side navigation dots
- **Vinyl Easter egg** — click the profile photo to flip it into a spinning vinyl record, plays "Hatua Kwa Hatua"
- **Book Chat agent** — click the Books hobby tag to open a chat-style book recommendation widget
- **Robot Easter egg** — an animated robot runner in the hero playground button
- **Roho music player** — full album experience with play/pause, seek, progress bars, track artwork, drag-to-seek on mobile, and CarPlay/MediaSession metadata
- **AI Agent Runner game** — endless runner with jump (Space/ArrowUp/swipe up) and crouch (ArrowDown/swipe down), obstacles, score tracking, high score persistence, sound effects, mute toggle
- **PWA support** — manifest.json, app icons (180/192/512), standalone display mode
- **Anti-copy protection** — text selection disabled, right-click disabled
- **Responsive design** — mobile-first layouts across all pages

## Tech Stack

- Pure HTML, CSS, and vanilla JavaScript — no frameworks, no build step
- [Three.js r128](https://threejs.org/) (CDN) for the perspective grid background and the agent showcase morph
- [Spline](https://spline.design/) for 3D hero background
- [Font Awesome 6.5](https://fontawesome.com/) for icons
- Google Fonts: Space Grotesk, Inter, JetBrains Mono, Covered By Your Grace
- GitHub Pages hosting with custom domain (`CNAME`)

## Testing

Playwright tests cover the playground game across desktop and mobile viewports:

```bash
npx playwright test
```

Tests include: theme loading, canvas sizing, keyboard/touch controls, dark mode toggle, mute toggle, high score persistence, speed curve validation, and multi-viewport responsiveness (iPhone SE through Desktop 1440p).

Config: [`playwright.config.js`](playwright.config.js) — runs a local Python HTTP server on port 8080, tests on Chromium and WebKit.

## Project Structure

```
my-cv/
  index.html          # Main portfolio page
  playground.html     # AI Agent Runner game
  music.html          # Roho album player
  dashboards.html     # Live dashboards page
  photo.png           # Profile photo
  icon-180.png        # Apple touch icon
  icon-192.png        # PWA icon (192x192)
  icon-512.png        # PWA icon (512x512)
  manifest.json       # PWA manifest
  CNAME               # Custom domain (fernandogarciag.com)
  LICENSE             # All Rights Reserved
  playwright.config.js
  tests/
    playground.spec.js
  assets/
    js/
      animations.js   # Interactive perspective grid background
      showcase.js     # Agent showcase: scroll-driven 4-form point cloud morph
  *.mp3               # Original music tracks (Roho album)
```

## License

All Rights Reserved. See [LICENSE](LICENSE) for details.
