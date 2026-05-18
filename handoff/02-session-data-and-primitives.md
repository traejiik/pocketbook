# Session 2 — Data Layer + Primitives

Read `00-overview.md` first if you haven't — including the **Learning mode** section. Pause and teach when you reach a concept marked for this session in the concepts table.

This session lands the Prisma schema, seeds the database with realistic data, and ports every base component from the design export so later sessions can compose them freely.

**By end of session:** the database is up, seeded, and reachable. Every component listed in `design-reference/04-component-map.md` exists in `components/` with TypeScript types. The formatters and FX helpers are tested via a unit test or a temporary scratch page.

---

## Step 1 — Prisma schema + migrations

Write `prisma/schema.prisma` exactly as specified in `00-overview.md` → "Data model." Then:

```bash
pnpm prisma migrate dev --name init
pnpm prisma generate
```

Create `lib/prisma.ts`:

```ts
import { PrismaClient } from '@prisma/client';
const globalForPrisma = global as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

Replace the `null as any` stub from session 1.

---

## Step 2 — Seed script

Write `prisma/seed.ts` (TypeScript, run via `tsx`). Insert:

**User** — read `SEED_USER_EMAIL` and `SEED_USER_PASSWORD` from env, bcrypt-hash (cost 12), insert one row.

**Categories** — exact data from `design-reference/mockups/source/data.jsx` lines 8–21. Use the same `id` strings (`rent_in`, `allowance`, `plasma`, `housing`, `food`, etc.) so the rest of the seed data can reference them cleanly.

**AppSettings** — singleton row with id `singleton`, defaults from the schema.

**ExchangeRate** rows:
- `HUF`→`USD` rate `0.002791`, mode `AUTO`, provider `frankfurter.app`
- `USD`→`HUF` rate `358.40`, mode `AUTO`, provider `frankfurter.app`
- `HUF`→`EUR` rate `0.002525`, mode `AUTO`, provider `frankfurter.app`
- `EUR`→`HUF` rate `396.10`, mode `AUTO`, provider `frankfurter.app`

**RecurringRule rows** — port `data.jsx` lines 54–71. Map fields:

| JSON | Prisma |
|---|---|
| `id` | `id` (keep string IDs) |
| `name` | `name` |
| `amt` | `amount` |
| `cur` | `currency` |
| `cycle: 'monthly' \| 'annual'` | `cycle: MONTHLY \| ANNUAL` |
| `next: 'YYYY-MM-DD'` | `nextDue: new Date(...)` |
| `kind: 'expense' \| 'income'` | `kind: EXPENSE \| INCOME` |
| `cat` | `categoryId` |
| `installment.paid` | `installmentPaid` |
| `installment.total` | `installmentTotal` |
| `installment.endsOn` | `installmentEndsOn` |

Wire `prisma.seed` in `package.json`:

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

Run `pnpm prisma db seed` and verify with `pnpm prisma studio`.

---

## Step 3 — Formatters

Create `lib/format.ts` — port from `data.jsx` lines 109–127, typed:

```ts
export function fmtHUF(n: number, opts?: { signed?: boolean }): string;
export function fmtCur(n: number, cur: 'HUF' | 'USD' | 'EUR' | 'GBP'): string;
export function fmtDate(iso: string | Date, opts?: { short?: boolean }): string;
export function dayOfWeek(iso: string | Date): string;
```

Use `−` (U+2212) for negatives. HUF uses Hungarian locale with spaces as thousands (`hu-HU` then replace `,` with ` `). The non-breaking-space (` `) handling stays the same.

---

## Step 4 — FX helpers

Create `lib/fx.ts`:

```ts
export type Currency = 'HUF' | 'USD' | 'EUR' | 'GBP';

export async function getRate(from: Currency, to: Currency): Promise<number>;
// Reads from ExchangeRate table. Falls back to 1.0 if from === to.

export async function toAnchor(amount: number, from: Currency): Promise<number>;
// Converts to the anchor currency from AppSettings.

export async function fromAnchor(amount: number, to: Currency): Promise<number>;
```

These touch the DB, so they're async. Cache the anchor + rate lookups inside a single request using React's `cache()`.

---

## Step 5 — Port primitives

Every primitive in `design-reference/mockups/source/primitives.jsx` becomes a TS React component. The mockups use a shared `cn()` utility — replace with `cn` from `@/lib/utils` (shadcn generates this already).

Build these in `components/ui/` (alongside shadcn-installed components) **only if shadcn's default doesn't match the mockup**. For each, the rule is:

1. If shadcn's installed primitive matches the mockup visually, use it as-is (just verify the class bindings against tokens).
2. If the mockup adds props (`icon`, `suffix`, `hint`) or visual treatment shadcn doesn't have, wrap or extend.

Components to port and where they live:

| Source (mockup) | Destination | Notes |
|---|---|---|
| `cn()` | `lib/utils.ts` | Already exists from shadcn init |
| `Button` | `components/ui/button.tsx` | shadcn version — add `icon`/`iconAfter` props that render Lucide icons; preserve all variants |
| `Card` | `components/ui/card.tsx` | shadcn — add `hover` variant via `pb-card-hover` |
| `Input` | `components/ui/input.tsx` | shadcn — extend with `icon` (left) and `suffix` (right) optional slots, exactly like the mockup |
| `Label` | `components/ui/label.tsx` | shadcn — extend with optional right-aligned `hint` |
| `Badge` | `components/ui/badge.tsx` | shadcn — add `kind` prop (`income`/`expense`/`savings`/`neutral`/`primary`/`warning`) and `color` prop (renders a dot from a hex) |
| `Switch` | `components/ui/switch.tsx` | shadcn default works — verify visual |
| `Skeleton` | `components/ui/skeleton.tsx` | shadcn default works |
| `Empty` | `components/ui/empty.tsx` | New — port from `primitives.jsx`. Icon + title + body + action |

**Custom finance components** (`components/finance/`):

| Source | Destination | Notes |
|---|---|---|
| `CategoryBadge` | `components/finance/CategoryBadge.tsx` | Server component — fetches category by id from Prisma |
| `AmountDisplay` | `components/finance/AmountDisplay.tsx` | Pure client component. Props: `value`, `currency`, `tone`, `size`, `signed`, `className`. Sizes `sm`/`md`/`lg`/`xl` match the mockup pixel sizes. |
| `KpiCard` | `components/finance/KpiCard.tsx` | Port lines 121–147 |
| `Segmented` | `components/ui/segmented.tsx` | New — port from `primitives.jsx` lines 150–163. Generic over `T extends string \| number` |
| `Sheet` | use shadcn `sheet` | Already installed. The mockup's custom Sheet is a stripped-down version of shadcn's; use shadcn's `Sheet` with `side="right"` and `className="w-[440px]"` to match |
| `Toast` | use Sonner | Already in deps. Replace mockup's custom Toast with `sonner` toasts |

`KpiBig`, `PillBar`, `GaugeMeter`, `RecurringRuleCard`, `TimelineStrip` come in session 4 (they're per-screen specific).

---

## Step 6 — Icons

Use `lucide-react` directly. Drop the mockup's inline `icons.jsx` — the icon names already match Lucide's component names (`Home`, `List`, `Repeat`, `Calendar`, `Tag`, `Sparkles`, `Settings`, `Plus`, `Search`, etc.). The only custom icon is the logo, which lives in `components/shell/LogoMark.tsx` from session 1.

Standard stroke width: `1.6px`. Wrap Lucide icons in a small `<Icon name="x" className="w-4 h-4" />` helper if you want a single import surface, but it's optional — direct imports are fine.

---

## Step 7 — Sanity test

Create a temporary `app/(app)/__test/page.tsx` that imports every primitive and renders one of each with realistic prop values. Verify:

- All components render
- Dark mode is the default appearance
- `AmountDisplay` shows tabular nums (no character drift on negatives)
- `Badge` colours match the tokens (income green, expense red-orange)
- Theme toggle in the header swaps every colour cleanly

Delete the test route before committing — or keep it as `__components/page.tsx` if you want a permanent component preview page.

---

## Session checklist

- [ ] `pnpm prisma migrate dev` ran cleanly, migration committed
- [ ] `pnpm prisma db seed` populates user, categories, app settings, FX rates, and recurring rules
- [ ] `pnpm prisma studio` shows the seeded data
- [ ] Login at `/login` now succeeds with the seeded credentials and lands on `/dashboard`
- [ ] Every primitive listed in step 5 exists with TS types and renders correctly in dark mode
- [ ] `AmountDisplay` handles `HUF` / `USD` / `EUR` formatting per the mockup conventions (Ft suffix, $ / € prefix, `−` for negatives)
- [ ] `Segmented`, `Badge` (with `color` and `kind` variants), and `Empty` match the mockup visually
- [ ] `lib/fx.ts` and `lib/format.ts` exist and are typed
- [ ] No console errors in dev
- [ ] Commit: `feat: prisma schema, seed, ported primitives`

Run `graphify update .` after completing this session if the graph is configured.

---

**Next session:** `03-session-transactions.md` — the Transactions list, the right-side Add/Edit Sheet, server actions, and the `N` / `⌘↵` / `Esc` keyboard wiring.
