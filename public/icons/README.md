# App icons (PWA)

These files back the web app manifest (`app/manifest.ts`), the iOS home-screen
install (`apple-touch-icon`, wired in `app/layout.tsx`) and the SVG favicon
(`favicon.svg`, also wired in `app/layout.tsx`; `app/favicon.ico` is the fallback).

Brand reference: the Bookmark P mark, white on Pocketbook Blue `#2F5DDA` (the app's
light `--primary`). The icons use the small-cut drawing of the mark (every edge on a
16-unit grid). `public/` serves only these files and the README wordmarks
(`public/wordmark-{light,dark}.svg`); the masters, guidelines and the
`src/build.py` generator live outside the repo in the brand kit.

| File | Size | Purpose | Notes |
|---|---|---|---|
| `icon-192.png` | 192×192 | any | rounded blue tile, transparent corners |
| `icon-512.png` | 512×512 | any | install icon / Android splash source |
| `icon-maskable-192.png` | 192×192 | maskable | full-bleed blue, mark at 60% so it stays inside the ~80% safe zone |
| `icon-maskable-512.png` | 512×512 | maskable | same, opaque |
| `apple-touch-icon.png` | 180×180 | iOS home screen | full-bleed, opaque, no alpha (iOS rounds corners itself) |
| `favicon.svg` | vector | browser tab | `#2F5DDA`, switches to `#7B9AEF` under `prefers-color-scheme: dark` |

The manifest's `background_color`/`theme_color` stay on the dark shell background
`#0E0F14`; only the icon artwork is blue.
