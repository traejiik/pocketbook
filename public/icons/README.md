# App icons (PWA)

These PNGs back the web app manifest (`app/manifest.ts`) and the iOS home-screen
install (`apple-touch-icon`, wired in `app/layout.tsx`). Drop the real brand assets
here with the exact filenames below.

Brand reference: the gauge logomark in `public/wordmark-dark.svg` (arc + dot,
`#5C8AFA`) centered on the dark shell background `#0E0F14`.

| File | Size | Purpose | Notes |
|---|---|---|---|
| `icon-192.png` | 192×192 | any | standard install icon |
| `icon-512.png` | 512×512 | any | install icon / Android splash source |
| `icon-maskable-192.png` | 192×192 | maskable | logo within ~80% safe zone, solid background |
| `icon-maskable-512.png` | 512×512 | maskable | same, opaque |
| `apple-touch-icon.png` | 180×180 | iOS home screen | opaque, no alpha (iOS rounds corners itself) |

Until these files exist the manifest/metadata still validate, but the icon URLs will
404 and the app will not be installable.
