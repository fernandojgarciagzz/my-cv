# fernandogarciag.com

Personal portfolio and creative hub for Fernando García — Engineer, Product Manager, and Agentic AI Solutions Architect at Salesforce.

**Live site:** [fernandogarciag.com](https://fernandogarciag.com)

---

## Pages

| Page | Description |
|------|-------------|
| [`index.html`](index.html) | Main portfolio — galaxy hero, tagline with three proof numbers, agent morph, then one chapter per section: about, experience, skills, tools, education, hobbies, books, dashboards, contact |
| [`playground.html`](playground.html) | AI Agent Runner — an endless-runner game with keyboard and touch/swipe controls |
| [`music.html`](music.html) | Roho — a custom music player for original tracks with vinyl aesthetics and MediaSession API |
| [`dashboards.html`](dashboards.html) | Live data dashboards (e.g., The AI Race — benchmarks, pricing, and capabilities across top AI companies) |

## Features

- **Space layer** — a Three.js spiral galaxy (60k particles, 22k on mobile) and a twinkling star field on a fixed canvas behind the whole page. Scroll drives the camera: the galaxy is the hero, then pulls back and settles behind the chapters. Static SVG stars when WebGL is unavailable
- **Dark-first** with light mode, persisted across all pages (localStorage key `theme`)
- **Claude Mode** — flipping the record switches the page and the galaxy to a warm amber palette
- **One typographic system** — Space Grotesk for display, Inter for text, a six-step type scale defined as CSS custom properties, one accent color per theme
- **Chapters** — every section has a sticky label and one headline; the original copy, timeline, skill bars, and cards live inside them
- **Agent showcase morph** — scroll-driven 3D point cloud (~5400 particles) that transitions between four forms: Intelligence → Agents → Process → Orchestration. Three.js and `showcase.js` load only when the section is near the viewport; a static SVG fallback shows when WebGL or motion is unavailable
- **Reduced motion** — `prefers-reduced-motion` disables all scroll-driven animation and shows the final state of every reveal
- **Vinyl Easter egg** — click the profile photo to flip it into a spinning vinyl record, plays "Hatua Kwa Hatua" (audio and the easter-egg script load after first paint)
- **Reader** — a Kindle-style widget with seven book notes
- **Robot Easter egg** — an animated robot runner that becomes the hero playground button
- **Roho music player** — full album experience with play/pause, seek, progress bars, track artwork, drag-to-seek on mobile, and CarPlay/MediaSession metadata
- **AI Agent Runner game** — endless runner with jump (Space/ArrowUp/swipe up) and crouch (ArrowDown/swipe down), obstacles, score tracking, high score persistence, sound effects, mute toggle
- **PWA support** — manifest.json, app icons (180/192/512), standalone display mode
- **Responsive design** — mobile-first layouts across all pages

## Tech Stack

- Pure HTML, CSS, and vanilla JavaScript — no frameworks, no build step
- [Three.js r128](https://threejs.org/) (CDN) for the galaxy space layer and the lazy-loaded agent showcase morph
- Google Fonts: Space Grotesk, Inter (index.html); the other pages keep their own font sets
- [Font Awesome 6.5](https://fontawesome.com/) for icons on the secondary pages
- GitHub Pages hosting with custom domain (`CNAME`)

## Testing

Playwright tests cover the main page (structure, lazy loading, reduced motion, blank-viewport checks at three sizes) and the playground game across desktop and mobile viewports:

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
    index.spec.js       # Main page: structure, lazy loading, reduced motion, viewports
    playground.spec.js
  assets/
    js/
      galaxy.js       # Space layer: spiral galaxy + star field, scroll-driven camera, theme-aware
      extras.js       # Easter eggs (vinyl + Claude Mode, robot runner, reader) — loaded after first paint
      showcase.js     # Agent showcase: scroll-driven 4-form point cloud morph — lazy-loaded
  *.mp3               # Original music tracks (Roho album)
```

## License

All Rights Reserved. See [LICENSE](LICENSE) for details.
