# Pocketbook Logo · Guidelines

The Pocketbook mark is a **half-circle gauge arc with a dot beneath**, directly referencing the "Income used" meter on the dashboard. Simple, geometric, app-icon friendly.

## Files in this folder

| File | Use |
|---|---|
| `pocketbook-logo.svg` | **Primary.** Blue `#2A6FDB` mark on a light surface. |
| `pocketbook-logo-dark.svg` | Lighter blue `#5C8AFA` for placement on dark surfaces. |
| `pocketbook-logo-mono.svg` | Single-colour version using `currentColor` — pulls from text colour for embeds in docs. |
| `pocketbook-wordmark.svg` | Horizontal lockup: mark + "Pocketbook" wordmark, light backgrounds. |
| `pocketbook-wordmark-dark.svg` | Same lockup for dark backgrounds. |
| `pocketbook-favicon.svg` | Self-contained favicon with the dark backdrop tile, sized for 32px. |
| `png/` | PNG renders at 16, 32, 64, 128, 256, 512 (both light and dark variants). |
| `explorations/` | The five rejected directions, archived for reference. |

## Colours

```
Light primary:  #2A6FDB   hsl(220 90% 56%)
Dark primary:   #5C8AFA   hsl(220 95% 66%)
Dark bg tile:   #0E0F12   hsl(230 10% 6%)
```

Always pull from `--primary` token in product UI; the hard-coded hex above is for use outside the app (presentations, marketing pages, GitHub README).

## Clear space

Minimum clear space around the mark equals **the height of the dot** (≈ 2 viewBox units, scaled with the logo). No copy, no other graphics inside that zone.

```
  ┌──────────────┐
  │      ↕       │
  │  ╭───────╮   │
  │←→│ LOGO  │←→ │
  │  ╰───────╯   │
  │      ↕       │
  └──────────────┘
```

## Minimum sizes

- **Icon-only:** 16×16 px (favicon). Don't go smaller.
- **Wordmark:** 120 px wide. Below that, use icon-only.

## What not to do

❌ Don't rotate the arc — the open side must face up.
❌ Don't fill the arc area.
❌ Don't change the stroke weight.
❌ Don't separate the dot from the arc.
❌ Don't apply gradients to the mark.
❌ Don't place on a busy photographic background — use the favicon variant with its tile if you need a backdrop.
❌ Don't use the green income colour — only `--primary` blue.

## CSS embed (preferred)

For React/web product surfaces, copy the inline SVG from `pocketbook-logo-mono.svg` and let `currentColor` follow your `text-primary`:

```jsx
<span className="text-primary">
  <PocketbookLogo />
</span>
```

## Origin

The arc echoes the dashboard's **Income used** gauge meter — when a user sees the logo and then the dashboard, the visual rhyme reinforces the brand. The dot is the "needle" of the meter. The chosen direction was `D` from the [logo explorations](./explorations/).
