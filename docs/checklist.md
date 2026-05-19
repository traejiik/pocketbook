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
|---|---|
| `upcomingRenewalsCount` hardcoded to `6` in `AppShell` | Session 4 |
| Login actually completes (needs seeded DB) | Session 2 |
| `docker-compose build` end-to-end test | Session 2+ |

---

## Session 2 — Data & Primitives (upcoming)

### To-do

- [ ] Write `prisma/schema.prisma` (already in `00-overview.md` — lift verbatim)
- [ ] Run `prisma migrate dev --name init`
- [ ] Write `prisma/seed.ts` — User, 12 Categories, AppSettings, ExchangeRates, RecurringRules
- [ ] Replace `lib/prisma.ts` stub with real singleton client ← user already did this ✅
- [ ] Port all primitives from `design-reference/mockups/source/primitives.jsx` to TypeScript
- [ ] Write `lib/format.ts` — `fmtHUF`, `fmtCur`, `fmtDate`, `dayOfWeek`, U+2212 minus
- [ ] Write `lib/fx.ts` — `toAnchor()`, `fromAnchor()`, exchange rate helpers
- [ ] Write `lib/frankfurter.ts` — FX rate fetcher
- [ ] Port finance components: `AmountDisplay`, `CategoryBadge`, `KpiCard`

---
