# Pocketbook — Engineering Handoff

A self-hosted personal finance app. This folder is the design-to-engineering bridge: tokens, components, mockups, and the rules of how it should feel.

## Folder map

| File | What it gives you |
|---|---|
| `01-visual-identity.md` | The one-sentence vibe + brand references. Read this first. |
| `02-design-tokens.md` | Colour palette (HSL, both themes), type, radius, spacing, shadows. |
| `03-design-system.md` | The whole system in one file — use as the single source of truth. |
| `04-component-map.md` | shadcn primitives in use + custom finance-specific components. |
| `05-interaction-notes.md` | Motion, micro-states, "the half-page that decides if it feels right." |
| `logo/` | The brand mark — SVG, PNG (16/32/64/128/256/512), favicon, wordmark, guidelines, rejected explorations. |
| `mockups/` | Working HTML+JSX prototype. Class names & structure live here. |
| `mockups/pocketbook-bundled.html` | Single self-contained file. Double-click to view. |
| `mockups/source/` | The raw source files, ready to run via a local server. |

## What the build needs to match

Order of importance, most critical first:

1. **The tokens.** Class names in the mockups all resolve to CSS variables in `02-design-tokens.md`. Wire those before anything else.
2. **The component map.** Use shadcn for everything in `04`'s "base layer." Build the "custom" components yourself — they're finance-specific and don't exist in shadcn.
3. **The screen structure.** Open `mockups/source/screens/*.jsx` and use the JSX as the structural source of truth — tag tree, class names, layout.
4. **The interaction notes.** Anything that moves or changes state on the screen is described in `05`. If it's not in there, it doesn't move.

## How to run the mockup locally

```bash
cd mockups/source
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `mockups/pocketbook-bundled.html` directly in a browser.

## Stack

- **shadcn/ui** primitives → custom Pocketbook components
- **Tailwind CSS** with custom design tokens
- **Geist** (Vercel) + **Geist Mono** for type
- **React 18** for the prototype (replace with your framework — class names are framework-agnostic)
