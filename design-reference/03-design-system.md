# 03 · Design System (consolidated)

This is the whole system in one file. If you read nothing else, read this. For deep dives on each section, jump to the linked file.

---

## A. Visual identity → [`01-visual-identity.md`](./01-visual-identity.md)

**Vibe:** A quiet, dark-first money instrument — precision-engineered hairlines, tabular numerics, and a single electric-blue accent doing all the lifting.

**References:** Linear (density) · Things 3 (restraint) · Stripe Dashboard (numeric hierarchy) · Wise (FX honesty).

**Register:** calm, serious, dense, precise, quiet. Not playful, decorative, or airy.

**Brand mark:** Half-circle gauge arc (echoes the dashboard "Income used" meter), in primary blue.

---

## B. Tokens → [`02-design-tokens.md`](./02-design-tokens.md)

shadcn-convention CSS variables, HSL values (no `hsl()` wrapper).

### Colour roles

- `--background` / `--foreground` — page surface + text
- `--card` / `--card-foreground` — card surface
- `--primary` / `--primary-foreground` — **brand action colour, blue.** CTAs, active nav, focus ring, logo.
- `--secondary` — secondary fills
- `--muted` / `--muted-foreground` — quiet text + bgs
- `--accent` — hover states
- `--destructive` — danger/delete
- `--success` — success toasts
- `--border` / `--input` / `--ring` — hairlines + focus

### Semantic finance roles (separate from action colours)

- `--income` — green. Positive deltas, money in.
- `--expense` — red-orange. Negative deltas, money out.
- `--savings` — blue (= primary). Savings transactions.
- `--neutral` — grey. Unsigned amounts.

### Dark theme primary blue: `220 95% 66%` → `#5C8AFA`
### Light theme primary blue: `220 90% 56%` → `#2A6FDB`

### Type

**Geist Sans** for UI, **Geist Mono** for figures, dates, IDs, paths. Always `font-feature-settings: 'tnum' 1, 'ss01' 1` on monetary displays.

### Radius

`--radius: 0.625rem` (10px) base. Islands use `rounded-2xl` (16px). Pills use `rounded-full`.

### Shadows

`shadow-pb-1` (hairline lift) · `shadow-pb-2` (hover/popover) · `shadow-pb-3` (sheet/modal).

### Spacing

Tailwind default 4px grid. No overrides.

---

## C. Layout — the "island" shell

The app shell uses **three floating cards** with `rounded-2xl` borders and gaps between them:

```
┌──────────┐ ┌────────────────────────────────────┐
│          │ │ Header island (60-68px tall)       │
│ Sidebar  │ ├────────────────────────────────────┤
│ island   │ │                                    │
│ (220px)  │ │ Screen content area                │
│          │ │                                    │
└──────────┘ └────────────────────────────────────┘
```

- Outer wrapper: `p-3 gap-3` on the bg
- Each island: `bg-card border border-border rounded-2xl`
- The bg behind the islands is `--background`

This is **non-negotiable** structural choice — the islands carry the visual identity. Don't merge them into a single flat card.

---

## D. Components → [`04-component-map.md`](./04-component-map.md)

Two tiers:

1. **shadcn primitives** — used as-is with our token swap. Button, Card, Input, Sheet, Tabs, Dialog, Toast, etc.
2. **Custom finance components** — built on top. The important ones:
   - `AmountDisplay` — tabular numeric amount, signed, tone-coloured
   - `KpiBig` — dashboard's big KPI tile (44px value, delta pill)
   - `GaugeMeter` — the half-circle income-used gauge
   - `CategoryBadge` — pill with category-coloured dot
   - `PillBar` — vertical pill bar for the categories chart (solid / mid / hatched variants)
   - `Sheet` (drawer for Add Transaction)
   - `Segmented` (2–3 way view toggle)

---

## E. Interactions → [`05-interaction-notes.md`](./05-interaction-notes.md)

The motion + state rules that decide whether it feels right.

Highlights:

- **Add transaction** → opens as a right-side Sheet, not a modal. `N` to open, `⌘↵` to submit.
- **AI Insights** → three states (connecting / streaming / done). Real streaming, no fake typewriter.
- **Dashboard month switch** → 180ms crossfade with tweened numerics; bar chart uses FLIP for reordering.
- **Skeletons over spinners.** No "Loading…" text anywhere.
- **Optimistic writes** for Add Transaction.
- Keyboard shortcuts mirror Linear: `N` for new, `G` `D` for nav.

---

## F. Don't list — anti-patterns

- ❌ Gradient-heavy hero sections (one subtle radial in AI Insights card is the only exception)
- ❌ Emoji in body copy (flag emoji on the currency picker is the only exception)
- ❌ Illustrations on empty states
- ❌ Decorative drop caps, ornate dividers
- ❌ More than one accent colour competing for attention on a screen
- ❌ Exclamation marks in copy
- ❌ "Loading…" text
- ❌ Tooltips on obvious icons (only use them where the icon genuinely could mean two things)
- ❌ `text-center` on body paragraphs
- ❌ Justified text

---

## G. Acceptance bar

A screen passes review when:

1. It uses only tokens — no hard-coded hex except inside SVG illustrations.
2. Monetary text has tabular numerics. Always.
3. Every CTA can be reached by keyboard.
4. Focus rings are visible and use `--ring`.
5. Light and dark themes both look polished — not just "dark works, light is afterthought."
6. The screen has at most one primary action surface — the second one would be a secondary or outline button.
7. No element relies on hover alone to convey state.
