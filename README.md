# InfinRun 🚀

A 3-lane spaceship infinite runner, built mobile-first as a zero-dependency web app.
Dodge incoming asteroids by swiping (or tapping the screen sides) to switch lanes.
The longer you survive, the faster it gets.

**Play:** https://whtspc.github.io/infinrun/

## Controls

- **Mobile:** swipe ◀ / ▶, or tap the left / right half of the screen
- **Desktop:** arrow keys (or `A` / `D`), or click the left / right half

## Tech

Plain HTML + CSS + Canvas 2D — no frameworks, no build step. Everything is static:

| File | Purpose |
| --- | --- |
| `index.html` | Markup + HUD / overlays |
| `style.css` | Layout and neon UI styling |
| `game.js` | Game loop, input, spawning, rendering |
| `manifest.webmanifest` + `icon.svg` | Add-to-home-screen / installable PWA |

## Run locally

It's a static site, so any web server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly mostly works too, but a local server is closer to production
(and avoids `file://` quirks with the manifest).

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` auto-publishes on every push. **One-time setup:**

1. Go to the repo on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

That's it. The next push runs the workflow and your site goes live at
`https://<user>.github.io/infinrun/`. You can watch the run under the **Actions** tab.
