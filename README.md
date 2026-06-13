# InfinRun 🚀

A 3-lane spaceship **math runner** in real 3D, built mobile-first. A chase camera
follows your ship down a winding neon track. Instead of dodging, you **fly into
digits and operators** to build a running calculation that matches the **TARGET**
number — then it gives you a new one. Swipe to pick which token you grab.

**Play:** https://whtspc.github.io/infinrun/

## How to play

- A **TARGET** number is shown at the top. Build it with the tokens you collect.
- Tokens are **digits** (`0`–`9`) and **operators** (`+ − × ÷`). Collect a digit
  to build a number (`1` then `2` → `12`); collect an operator to apply your held
  number to the running total. It's a live, left-to-right calculator (no
  precedence).
- Match the target exactly to score and get a new target. Overshooting is fine —
  use `−` and `÷` to come back.
- A `÷` that wouldn't divide evenly is illegal and **resets your expression**.
- Rows always leave at least one empty lane, so you can skip a token you don't want.

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
