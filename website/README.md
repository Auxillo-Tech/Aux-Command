# Aux Command website kit

A ready-to-deploy marketing landing page for **auxillo.tech**, built with the
same visual language as the application (Auxillo indigo→cyan on deep navy,
Inter + JetBrains Mono, glass panels).

## Contents

- `index.html` — self-contained landing page (inline CSS + a tiny tab script,
  no build step, no external requests).
- `assets/` — the Aux Command product logo and the Auxillo wordmark.
- `screenshots/` — real product screenshots captured from the running app:
  - `01-welcome.png` — welcome / hero screen
  - `02-tiled-highlight.png` — tiled terminals with keyword log highlighting
  - `03-palette.png` — command palette

## Preview locally

```bash
cd website
python3 -m http.server 8080
# open http://127.0.0.1:8080
```

## Deploy

The page is fully static — host it anywhere:

- **GitHub Pages**: push `website/` to a `gh-pages` branch or point Pages at it.
- **Netlify / Vercel / Cloudflare Pages**: set the publish directory to `website`.
- **Any web server**: copy `website/` to the document root.

Point the `auxillo.tech` domain at the host and it is live.

## Updating for a release

- Refresh the screenshots (run the app, capture the surfaces you want).
- Update the version strings in the install snippets in `index.html`.
- Keep the copy honest — it should describe only what the shipped release does.

## Copy

The headline and section copy live directly in `index.html`. The core message:

> **Every remote system, one Linux workspace.** Aux Command unifies SSH, SFTP,
> FTP, tunnels, RDP, VNC, Mosh, Telnet and serial consoles into one polished
> workstation — free, open source, no paid tiers, no telemetry.
