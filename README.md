# InfinRun 🚀

A 3-lane spaceship infinite runner in **real 3D** (Subway-Surfers style), built
mobile-first. A chase camera follows your ship down a neon track while asteroids
rush toward you — swipe (or tap the screen sides) to switch lanes. The longer you
survive, the faster it gets.

**Play:** https://whtspc.github.io/infinrun/

## Controls

- **Mobile:** swipe ◀ / ▶, or tap the left / right half of the screen
- **Desktop:** arrow keys (or `A` / `D`), or click the left / right half

## Tech

WebGL 3D via [Three.js](https://threejs.org/), with plain HTML/CSS for the UI —
no build step. Three.js is loaded at runtime from a CDN through an
[import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap)
in `index.html`, so the project stays a static site.

| File | Purpose |
| --- | --- |
| `index.html` | Markup, HUD / overlays, Three.js import map |
| `style.css` | Layout and neon UI styling |
| `game.js` | ES module: 3D scene, game loop, input, spawning |
| `manifest.webmanifest` + `icon.svg` | Add-to-home-screen / installable PWA |

> **Removing the runtime CDN dependency (optional):** download
> `three.module.min.js` into a `vendor/` folder and change the import map's
> `"three"` entry to `"./vendor/three.module.js"`. Then the site needs no
> third-party requests at all.

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
