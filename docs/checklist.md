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

## Session 3 — Transactions ✅

### Checklist

- [x] `/transactions` lists all current-month transactions grouped by date
- [x] Search, type filter (All / Income / Expense / Savings), and category filter all narrow the table
- [x] Net total in the filter bar updates as filters change
- [x] "Add transaction" button opens a blank Sheet
- [x] `N` anywhere outside a form input opens the same blank Sheet
- [x] Clicking any row opens the Sheet pre-filled with that transaction's data
- [x] `⌘↵` / `Ctrl+Enter` submits the form (handled via `onKeyDown` on the form element)
- [x] `Esc` closes the Sheet (handled by base-ui Dialog/Sheet primitives natively)
- [x] Submitted transactions appear in the table immediately (optimistic via `useOptimistic` + `startTransition`)
- [x] On server error, optimistic row rolls back and a Sonner toast fires
- [x] Type changes filter the available categories correctly (eligibleCategories computed from kind)
- [x] Currency ≠ HUF shows live HUF equivalent under the amount field
- [x] Delete from the "Delete this transaction…" link → AlertDialog confirmation → `deleteTransaction` server action
- [x] Empty state renders (with Reset filters action) when no transactions match
- [x] `pnpm tsc --noEmit` — 0 errors
- [x] `pnpm build` — clean, `/transactions` 49.8 kB
- [x] Commit: `f7b7a95 feat: transactions screen + add/edit sheet + optimistic writes`

### Known deferred items

| Item | Session |
| --- | --- |
| Month picker navigation (currently displays current month label only) | Session 4+ |
| Export CSV button (wired `disabled` with tooltip "Coming soon") | Session 5 |
| `CategoryBadge` async server component — client rows use inline badge | Session 4 |
| `upcomingRenewalsCount` hardcoded to `6` in `AppShell` | Session 4 |

### Post-session 3 notes

- **Blank page / 500 on fresh login**: `PrismaClientInitializationError` fired in `authorize()` when dev server was restarted cold. DB container was healthy throughout — this is a Prisma pool cold-start artefact. Browser with existing session cookie was unaffected (200s). Workaround: retry login after the first failed attempt; the pool recovers. No code change needed.
- **Verify in Session 4**: confirm `/transactions` renders correctly in a fresh incognito window after `pnpm dev` starts to rule out any remaining client-side blank page.

---

## Session 4 — Dashboard & Lists (upcoming)

### To-do

- [ ] Dashboard: KPI row (net income, total expense, savings rate, balance)
- [ ] Expenses-by-category bar chart (Recharts)
- [ ] Renewals widget + recent activity list on dashboard
- [ ] `GaugeMeter` SVG component (savings-rate gauge)
- [ ] `PillBar` for category breakdown
- [ ] AI feature card (placeholder until Session 5)
- [ ] Recurring screen: list of `RecurringRule` cards with installment progress
- [ ] Renewals screen: `TimelineStrip` + upcoming/overdue grouping
- [ ] Categories CRUD: add / edit / delete category with colour picker
- [ ] Derive `upcomingRenewalsCount` from DB (nextDue within 30 days)
- [ ] `React.cache()` deep dive — per-request memoisation, difference from `unstable_cache`
- [ ] Database transactions concept — atomic installment increment on RecurringRule

---
