# Pocketbook · Mockups

Working source for the prototype. Two ways to view:

## Option A — `pocketbook-bundled.html`

Single self-contained HTML file. Just double-click it to open in a browser. Best for sharing without a server.

## Option B — `source/`

The raw multi-file React + Tailwind prototype. To run:

```bash
cd source
python3 -m http.server 8000
# open http://localhost:8000 in your browser
```

You'll land on a design canvas with:

- **Logo explorations** — 6 logo directions (D is the adopted one)
- **Design system** — the spec doc rendered inline
- **Interactive prototype** — the live app, click around
- **All 9 screens** — every screen at full bleed for review
- **Light mode parity** — a subset in the light theme

## Why class names and structure matter

Each file under `source/screens/` is one screen of the app. The JSX layout, Tailwind class names, and component composition are the spec. Re-implement these in your framework of choice — every class name resolves to a token defined in `02-design-tokens.md`.

## Files

| File | Contents |
|---|---|
| `source/index.html` | Tailwind config + CSS variables + script loader |
| `source/app.jsx` | The app shell (sidebar / header / main islands) |
| `source/main.jsx` | Design canvas root — renders every screen |
| `source/data.jsx` | Seed data + formatters |
| `source/icons.jsx` | Lucide-style inline icon set |
| `source/primitives.jsx` | Button, Card, Input, Badge, Sheet, etc. |
| `source/spec.jsx` | The spec doc rendered as React |
| `source/screens/dashboard.jsx` | The Dashboard screen |
| `source/screens/transactions.jsx` | The Transactions screen |
| `source/screens/add-transaction.jsx` | The right-side Add Tx sheet |
| `source/screens/recurring.jsx` | Recurring rules |
| `source/screens/renewals.jsx` | Upcoming renewals timeline |
| `source/screens/categories.jsx` | Categories management |
| `source/screens/insights.jsx` | AI Insights |
| `source/screens/settings.jsx` | Settings (FX, security, AI) |
| `source/screens/login.jsx` | Login |
