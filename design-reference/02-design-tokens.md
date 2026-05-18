# 02 · Design Tokens

shadcn-convention CSS variables. Values are HSL (no `hsl()` wrapper — Tailwind's `<alpha-value>` slot handles that).

## Colour — Dark theme (default)

| Token | HSL | Hex preview | Use |
|---|---|---|---|
| `--background` | `230 10% 6%` | `#0E0F12` | Page bg |
| `--foreground` | `0 0% 96%` | `#F5F5F5` | Default text |
| `--card` | `232 9% 8.5%` | `#13151A` | Card surfaces, headers |
| `--card-foreground` | `0 0% 96%` | `#F5F5F5` | Text on cards |
| `--popover` | `232 9% 9%` | `#141619` | Popovers, dropdowns |
| `--popover-foreground` | `0 0% 96%` | `#F5F5F5` | Text on popovers |
| `--primary` | `220 95% 66%` | `#5C8AFA` | **Brand. CTAs, active, ring, logo.** |
| `--primary-foreground` | `230 30% 8%` | `#0F1320` | Text on primary |
| `--secondary` | `232 8% 13%` | `#1D1F23` | Secondary buttons, subtle fills |
| `--secondary-foreground` | `0 0% 96%` | `#F5F5F5` | Text on secondary |
| `--muted` | `232 8% 13%` | `#1D1F23` | Muted bgs |
| `--muted-foreground` | `232 6% 60%` | `#92959C` | Secondary text, labels |
| `--accent` | `232 8% 14%` | `#1F2125` | Hover fills |
| `--accent-foreground` | `0 0% 96%` | `#F5F5F5` | Text on accent |
| `--destructive` | `6 80% 60%` | `#E55B45` | Delete, danger |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | Text on destructive |
| `--success` | `152 60% 50%` | `#33CC85` | Success toasts, badges |
| `--border` | `232 8% 16%` | `#252830` | Hairlines |
| `--input` | `232 8% 16%` | `#252830` | Input borders |
| `--ring` | `220 95% 66%` | `#5C8AFA` | Focus ring (= primary) |

## Colour — Light theme

| Token | HSL | Hex preview | Use |
|---|---|---|---|
| `--background` | `30 14% 97%` | `#F8F6F3` | Page bg (warm cream) |
| `--foreground` | `240 8% 10%` | `#181A1F` | Default text |
| `--card` | `0 0% 100%` | `#FFFFFF` | Card surfaces |
| `--card-foreground` | `240 8% 10%` | `#181A1F` | Text on cards |
| `--popover` | `0 0% 100%` | `#FFFFFF` | Popovers |
| `--popover-foreground` | `240 8% 10%` | `#181A1F` | Text on popovers |
| `--primary` | `220 90% 56%` | `#2A6FDB` | **Brand.** |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary |
| `--secondary` | `240 5% 94%` | `#EEEEF0` | Secondary fills |
| `--secondary-foreground` | `240 8% 14%` | `#212329` | Text on secondary |
| `--muted` | `240 5% 94%` | `#EEEEF0` | Muted bgs |
| `--muted-foreground` | `240 4% 42%` | `#65676E` | Secondary text |
| `--accent` | `240 5% 92%` | `#E8E9EC` | Hover fills |
| `--accent-foreground` | `240 8% 14%` | `#212329` | Text on accent |
| `--destructive` | `6 78% 50%` | `#CC3D24` | Delete, danger |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | Text on destructive |
| `--success` | `145 55% 38%` | `#2C8F58` | Success |
| `--border` | `240 6% 88%` | `#DEDFE3` | Hairlines |
| `--input` | `240 6% 88%` | `#DEDFE3` | Input borders |
| `--ring` | `220 90% 56%` | `#2A6FDB` | Focus ring |

## Semantic — Finance

These never collapse into `--primary` or `--destructive`. They have their own job: showing whether money moved in, out, or sideways.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--income` | `152 60% 52%` | `152 55% 38%` | Positive deltas, income txs, gauge fill, success rings |
| `--expense` | `14 85% 64%` | `14 80% 50%` | Negative deltas, expense txs, warning notification dot |
| `--savings` | `220 95% 66%` | `220 90% 56%` | Savings txs, savings goals (== primary blue) |
| `--neutral` | `232 6% 60%` | `240 4% 42%` | Unsigned monetary text, "no change" |

**Why they're separate from `--primary` and `--destructive`:**
`--primary` is for action affordances — buttons, links, active nav. Bleeding it into "positive" semantics would mean every approved button looks like a positive number. `--destructive` is for delete/danger, not for money you legitimately spent. The split keeps deltas honest.

## Typography

**Geist Sans** for UI · **Geist Mono** for figures, dates, model IDs, file paths.
Numeric font features: `font-feature-settings: 'tnum' 1, 'ss01' 1;` on all monetary displays (utility class `.tabular`).

| Name | Size / leading | Weight | Use |
|---|---|---|---|
| `text-xs` | 12 / 16 | 400 | Micro labels, mono captions |
| `text-sm` | 13 / 18 | 500 | UI controls, button text |
| `text-base` | 14 / 22 | 400 | Body, insights paragraph |
| `text-lg` | 15 / 22 | 600 | Card titles |
| `text-xl` | 18 / 24 | 600 | Section headers |
| `text-2xl` | 22 / 28 | 600 | Screen titles |
| `text-3xl` | 28 / 34 | 600 | KPI numerics, hero amounts |

Hero KPI values can go up to **44px / 600** with the currency suffix in `--muted-foreground` at 16px.

## Radius

```css
--radius: 0.625rem; /* 10px base */
```

| Class | Pixels | Use |
|---|---|---|
| `rounded-sm` | 6px | Tiny chips, indicators |
| `rounded-md` | 8px | Buttons, inputs, small cards |
| `rounded-lg` | 10px | Standard cards (legacy) |
| `rounded-2xl` | 16px | **Island shells (sidebar, header, content cards)** |
| `rounded-full` | — | Pills, nav items, avatar, badges, CTAs |

## Spacing

Tailwind's default 4px multiple grid. **No override.**

Common pairs: `gap-2 / gap-3 / gap-4` for grids, `space-y-5 / space-y-6` for vertical rhythm, `px-5 py-5` inside cards, `px-6 / px-8` for screen containers.

## Shadows

Three levels, dark-mode-tuned (longer offsets, lower alpha in light mode):

```css
--shadow-1: 0 1px 0 rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.45);  /* hairline lift */
--shadow-2: 0 6px 16px rgba(0,0,0,0.45);                          /* hover, popovers */
--shadow-3: 0 22px 60px rgba(0,0,0,0.55);                         /* sheets, modals */
```

Tailwind classes: `shadow-pb-1`, `shadow-pb-2`, `shadow-pb-3`.

## How they apply in Tailwind

```js
// tailwind.config.js — extend.colors
border: 'hsl(var(--border) / <alpha-value>)',
foreground: 'hsl(var(--foreground) / <alpha-value>)',
primary: { DEFAULT: 'hsl(var(--primary) / <alpha-value>)', foreground: 'hsl(var(--primary-foreground) / <alpha-value>)' },
// ...etc for all tokens above
income: 'hsl(var(--income) / <alpha-value>)',
expense: 'hsl(var(--expense) / <alpha-value>)',
savings: 'hsl(var(--savings) / <alpha-value>)',
```

Then in templates: `bg-card text-foreground border-border text-income` etc.
