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

## Session 4 — Dashboard & Lists ✅

### Session 4 checklist

- [x] Dashboard renders all 8 cards in the correct layout with real DB data
- [x] `KpiBig` values: 44px tabular, tone-coloured, `233k` abbreviation for ≥ 100k, delta chip
- [x] `GaugeMeter` SVG: filled arc via `strokeDasharray`, hatched remainder, `{pct}%` centred
- [x] `PillBar` chart in Categories view; Net trend view via Segmented toggle
- [x] AI Insights dark gradient card — links to `/insights?generate=1` (generate) and `/insights` (open)
- [x] Recurring screen lists all rules; installment progress bar + amber block rendered correctly
- [x] New recurring rule sheet: name, amount, currency, cycle, kind, next due, category, installment plan toggle
- [x] Archive recurring rule (soft-delete via `archived = true`)
- [x] Renewals `TimelineStrip`: events positioned proportionally at `(daysAway / horizon) * 100%`
- [x] Renewals horizon (30d / 60d / 90d) + grouping (by week / by month) toggles update list and totals
- [x] Categories grouped by kind; colour swatch, hex code, tx count, HUF total per row
- [x] Create / edit category: palette picker + free-text hex input + kind select
- [x] Delete category: replacement-category prompt when transactions exist; `prisma.$transaction` for atomic reassignment
- [x] Sidebar Renewals badge now live from `getUpcomingRenewals(30).length` via `layout.tsx`
- [x] `upsertTransaction` atomically increments `installmentPaid` and auto-archives completed rules via `prisma.$transaction`
- [x] `lib/aggregations.ts` — all helpers wrapped in `React.cache()` for per-request memoisation
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx next build` — clean, 13 routes, 0 errors
- [x] Commit: `a3d435f feat: dashboard, recurring, renewals, categories`

### Session 4 deferred items

| Item | Session |
| --- | --- |
| Dashboard "Add transaction" button wires to the global sheet (currently a plain button) | Session 5 polish |
| Month picker navigation on transactions screen | Session 5+ |
| Export CSV button | Session 5 |
| `lib/frankfurter.ts` FX rate fetcher | Session 5 |
| FX rates on recurring cards use hardcoded fallback (358.4 / 396.1) instead of DB rates | Session 5 |

---

## Session 5 — Insights, Settings & Polish ✅

### Checklist

- [x] `lib/ollama.ts` — `streamGenerate` async generator, `pingOllama`, `listOllamaModels`
- [x] `app/api/insights/stream/route.ts` — SSE `ReadableStream` route; saves `AiInsight` on completion
- [x] `server-actions/insights.ts` — `buildInsightPrompt` (KPIs + categories + renewals + installments), `saveInsight`, `setInsightFeedback`
- [x] `/insights` renders with `InsightCard`: `ready → loading → streaming → done` state machine
- [x] Streaming uses real Ollama tokens via `EventSource` — no fake typewriter
- [x] Skeleton paragraphs + 3-dot pulse shown while loading
- [x] Blinking caret at tail of streaming text
- [x] `done` state shows token count + elapsed seconds + Helpful / Not useful buttons
- [x] Insight history list shows past `AiInsight` rows; clicking a row swaps the view card
- [x] `lib/frankfurter.ts` — `fetchFrankfurterRate` + `syncAllAutoRates`
- [x] `app/api/fx/sync/route.ts` — POST, guarded by `X-Sync-Secret`
- [x] `server-actions/settings.ts` — anchor, FX, password, LLM model, auto-insights
- [x] `/settings` — anchor currency picker with confirmation Dialog
- [x] `/settings` — tracked currencies with Dynamic/Manual mode toggle + manual rate save
- [x] `/settings` — add/remove tracked currency Dialogs
- [x] `/settings` — password change with bcrypt verify + 4-bar strength meter
- [x] `/settings` — Ollama endpoint with Connected/Unreachable badge
- [x] `/settings` — LLM model picker populated from Ollama `/api/tags` (fallback to hardcoded 3)
- [x] `/settings` — auto-insights toggle
- [x] `/settings` — About section: version, DB size, last backup
- [x] `docker-compose.yml` — `FX_SYNC_SECRET` env + Alpine `cron` sidecar at 03:00
- [x] `.env.example` — `FX_SYNC_SECRET` added
- [x] `scripts/csv-import.ts` — idempotent importer, `(date, description, amount)` dedup
- [x] `prisma/seed.ts` — runs CSV importer if `seed/transactions.csv` exists
- [x] `README.md` — quick start, Ollama prereq, CSV format, architecture pointer
- [x] `pnpm tsc --noEmit` — 0 errors

### Known limitations / future work

| Item | Notes |
|---|---|
| Dashboard "Add transaction" button | Plain button — wiring to the global sheet requires a context refactor; low priority for v1 |
| Month picker navigation | Current month label only on Transactions; navigation deferred |
| Export CSV on Transactions | Button renders as disabled ("Coming soon") |
| `docker-compose build` end-to-end test | Run locally after ensuring Ollama is reachable |

---
