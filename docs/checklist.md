# Session Checklists & To-Do Notes

---

## Session 1 — Foundation ✅

### Checklist

- [x] `pnpm dev` runs without errors
- [x] Dark mode renders on first paint (no FOUC) — `<html class="dark" suppressHydrationWarning>`
- [x] AppShell layout: 3 islands, `rounded-2xl`, `gap-3`, outer `p-3`
- [x] Sidebar nav highlights active route via `usePathname()`
- [x] Theme toggle wired via `useTheme()`, persists via `localStorage`
- [x] All 9 routes resolve (`/dashboard` through `/settings` + `/login`)
- [x] `/` redirects to `/dashboard`
- [x] Unauthenticated requests redirect to `/login` (middleware, 307 confirmed)
- [x] Login page matches `screens/login.jsx` — SVG glow-grid, currency glyphs, password show/hide
- [x] `CLAUDE.md` exists with implementation rules and design-reference pointer
- [x] Dockerfile (multi-stage standalone) + `docker-compose.yml` + `.env.example`
- [x] Committed: `feat: bootstrap project, tokens, shell, auth scaffold`

### Known deferred items (fix in the noted session)

| Item | Session |
| --- | --- |
| `upcomingRenewalsCount` hardcoded to `6` in `AppShell` | Session 4 |
| Login actually completes (needs seeded DB) | Session 2 |
| `docker-compose build` end-to-end test | Session 2+ |

---

## Session 2 — Data & Primitives ✅

### Checklist

- [x] `prisma/schema.prisma` written — 8 models, 4 enums
- [x] `prisma migrate dev --name init` ran cleanly — migration SQL committed
- [x] `prisma generate` ran (auto, part of migrate)
- [x] `prisma/seed.ts` written and runs — user, 12 categories, AppSettings, 4 FX rates, 15 recurring rules
- [x] `pnpm prisma db seed` succeeds
- [x] `lib/prisma.ts` — real singleton PrismaClient (null stub replaced)
- [x] `lib/format.ts` — `fmtHUF`, `fmtCur`, `fmtDate`, `dayOfWeek`, U+2212 minus sign
- [x] `lib/fx.ts` — `getRate`, `toAnchor`, `fromAnchor`, React `cache()` memoisation
- [x] shadcn primitives extended: Badge (`kind`/`color`), Button (`icon`/`iconAfter`), Card (`hover`), Input (`icon`/`suffix`), Label (`hint`)
- [x] New primitives: `Empty`, `Segmented`
- [x] Finance components: `AmountDisplay`, `CategoryBadge`, `KpiCard`
- [x] Login works end-to-end (`tida@home.lan` / `changeme-on-first-boot` → `/dashboard`)
- [x] `pnpm dev` — no console errors
- [x] Commits: `d7343c9` → `9a5125e`

### Known deferred items

| Item | Session |
| --- | --- |
| `lib/frankfurter.ts` — FX rate fetcher | Session 5 |
| `upcomingRenewalsCount` hardcoded to `6` in `AppShell` | Session 4 |
| `CategoryBadge` N+1 optimisation via `React.cache()` | Session 4 |

---

## Session 3 — Transactions (upcoming)

### To-do

- [ ] Transactions page: grouped-by-date list, filter bar (type + category + search), pagination or virtual scroll
- [ ] Add/Edit Transaction Sheet (right-side, 440px, shadcn `Sheet`)
- [ ] Server actions: `createTransaction`, `updateTransaction`, `deleteTransaction` in `server-actions/transactions.ts`
- [ ] Keyboard shortcuts: `N` opens Add sheet, `⌘↵` submits, `Esc` closes
- [ ] Optimistic writes on Add — `useOptimistic` + `startTransition`, roll back on server error
- [ ] `TransactionForm` component with react-hook-form + zod validation
- [ ] `CategoryBadge` used in each transaction row

---
