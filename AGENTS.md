# Pocketbook — Agent instructions

Read `other/handoff/00-overview.md` at the start of every session. Open the relevant session file before writing any code.

Handoff/session files are context, not authority. If they conflict with the actual implementation (`package.json`, `prisma/schema.prisma`, `app/`, `components/`, `lib/`, `server-actions/`, tests, or deploy files), the source code wins. Call out drift instead of silently copying stale assumptions.

## Design reference

The app is being restyled to **v2** from the **v5 redesign** in `other/v5-handoff/`. For all v2 visual decisions that bundle is the source of truth — match the prototypes in `other/v5-handoff/source/calm5/*.jsx` (desktop is canonical) plus the token/component/screen specs in `other/v5-handoff/0*.md`. Where it disagrees with the older `other/design-reference/` mockups, **v5 wins**.
Port faithfully — class names, layout, component composition — unless asked to change something otherwise. Pieces that need data the app does not store (e.g. the recurring price-trend chip's prior price) are intentionally omitted.

## Implementation rules (non-negotiable)

1. **No hardcoded hex for UI chrome** — product styling comes from CSS variables via Tailwind classes. Exceptions: SVG illustrations (logo, gauge, login background) and data-driven category colours (`Category.color`, palette/swatch previews, and seed data), which are stored as six-digit hex and used only for category identity.
2. **Tabular numerics on every monetary value** — use `.tabular` or the `AmountDisplay` component.
3. **Server Actions for mutations, not REST routes** — REST routes are only for Auth.js, SSE insights streaming, and secret-authenticated cron endpoints (FX sync, monthly insights, recurring sync).
4. **No client-side data fetching for initial render** — page-level data comes from server components calling Prisma directly.
5. **Skeletons over spinners** — no page/content loading spinners and no "Loading…" text. The sign-in button spinner is the intentional exception. Treat other spinner-style loading UI as existing debt unless you are deliberately fixing it.
6. **Optimistic transaction writes are scoped** — the Transactions page uses `useOptimistic` and rolls back on server rejection. The global transaction sheet on other pages currently submits directly through a Server Action unless you intentionally extend optimism there.
7. **Dark mode is default** — `<html class="dark" suppressHydrationWarning>` on first render.
8. **Currency conversion goes through `lib/fx.ts`** — never inline conversion logic. FX lookup caches rates per request, supports triangulation through stored pairs, and returns `null` for unconvertible amounts; callers must surface/exclude unconvertible rows instead of treating them as zero.
9. **The minus sign is `−` (U+2212), not `-`.**
10. **No multi-user logic** — one User row, seeded from env. Use `prisma.user.findFirst()`.
11. **All currencies are uppercase three-letter codes** — `HUF`, `USD`, `EUR`, `GBP`.
12. **Date columns are `@db.Date`** — no time-of-day on transactions or recurring rules. For calendar-only writes, construct UTC-midnight dates (`Date.UTC(...)`) so Budapest/positive-offset timezones do not shift the stored day.
13. **Recurring generation is idempotent** — `Transaction` has `@@unique([recurringRuleId, date])`; generated recurring writes must use that invariant and skip duplicates.
14. **Installment counters are reconciled, not manually bumped** — after transaction create/edit/delete, recompute `installmentPaid` from linked transactions and archive only when the count reaches `installmentTotal`.
15. **One-way CSV import is supported** — CSV upload/import is a Server Action workflow, not a REST mutation. Two-way Google Sheets sync remains out of scope.
16. **Responsive tiers are width-based** — mobile `<768px` uses the sticky mobile top bar, bottom nav, More sheet, and FAB; tablet `768–1023px` uses the collapsible 76px/232px rail; `lg`/`≥1024px` restores the 224px sidebar and desktop header/content spans; and `xl` restores the densest desktop control sizing plus the widest grids (`KpiBig` rows go four-up only at `xl`; its 44px numerals need ~190px of column width). Do not add orientation queries, JS viewport detection, or container queries unless explicitly requested.

## Do not build (v1)

- Bank API integration, multi-user, forecasting, mobile app
- Two-way Google Sheets sync (one-way CSV import only)
- Bank statement parsing, email reminders
- Command palette modal behaviour. The header search is real: `⌘K` focuses it, `Enter` searches transactions, and `Esc` clears/blurs.
- Linear-style nav shortcuts — only `N`, `⌘↵`, and `Esc` are implemented
- Fake typewriter on insights — streaming must be real Ollama tokens
- Custom auth (OAuth, magic link) — credentials only

## Stack and dependency policy

Current implementation: Next.js 16.2.6 · React 19.2.6 · TypeScript 6 · Tailwind CSS 4.3 · shadcn v4 registry style · Base UI-backed local primitives · Postgres 16 · Prisma 7.8 · Auth.js v5 · react-hook-form + zod · custom finance charts/SVGs · Geist fonts · Sonner · date-fns · next-themes · Ollama · Frankfurter · Node 24 · pnpm 10.33.0 in Docker.

The stack is not locked to old major versions. Major upgrades are allowed when they are intentional, tested, and documented. Pin exact versions only where operational coupling matters: Next.js with `eslint-config-next`, Docker Node image major, Docker pnpm version, Prisma runner CLI, PostgreSQL image major, and CI action majors. Let ordinary app libraries float by semver range plus `pnpm-lock.yaml`, but treat Prisma, Auth.js beta changes, React, Tailwind, and charting major upgrades as explicit upgrade projects.

## Current verification baseline

- `pnpm test` passes: 60 tests across 15 files.
- `pnpm lint` currently has 0 errors and 2 known React Compiler warnings from React Hook Form `watch()` usage in `components/forms/TransactionForm.tsx` and `app/(app)/recurring/RecurringView.tsx`. Do not treat those warnings as a new regression unless you are refactoring those forms.

## Documentation drift prevention

When changing any documented behaviour, architecture, dependency, environment variable, workflow, design-system rule, or source-of-truth decision, update every current doc that references the changed section in the same session.

Required process:

- Search narrowly with `rg` for the changed term, version, env var, route, component, or rule across `*.md`, `.env.example`, and relevant config files.
- Update canonical docs first: `README.md`, `AGENTS.md`, `DEPLOY.md`, `other/handoff/00-overview.md`, relevant `other/handoff/*` session files, `other/design-reference/*`, and `design-system/*` when those files describe the changed area.
- Update `other/docs/memory.md`, `other/docs/checklist.md`, and `other/docs/teachables.md` at session completion when the change affects future context.
- Treat historical changelog/planning notes as historical records unless they are written as current instructions. If a historical note is now misleading, add a dated clarification instead of silently rewriting the past.
- Before finishing, run a final `rg` check for stale names, versions, env vars, and "source of truth" claims related to the change.

## Teaching mode

Tida is a 3rd-year CS student. Teach concepts before writing code — see `other/handoff/00-overview.md` for the full teaching template and concept schedule.
When a session is done, open `other/docs/` at the root and append to teachable to file `teachables.md`. Create if file and folder are not there

## Session completion

Upon a session completion, open `other/docs/` at the root and add context memory to `memory.md`; and session checklist and to do notes to `checklist.md`. Create if files and folder are not there

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `pnpm graph:update` to keep the graph current and reapply readable community labels (AST-only, no API cost)
- If `graphify update .` was run directly, run `pnpm graph:labels` afterward so `GRAPH_REPORT.md` and `graph.html` do not regress to generic `Community N` names

### Wiki maintenance

The wiki lives at `graphify-out/wiki/`. Two files currently exist:

- `index.md` — agent entry point; lists all community hubs and analysis pages
- `how-the-app-works.md` — full architectural walkthrough

**When to update the wiki:**

- A new feature area is added or an existing one is substantially changed (e.g. new cron endpoint, new page, new data model) → update `how-the-app-works.md` and add the relevant community link to `index.md`
- A new cross-cutting analysis is produced via `/graphify query` that would be useful to future agents → save it as a new page (e.g. `graphify-out/wiki/recurring-flow.md`) and link it from `index.md`
- A god node changes (something becomes more or less central) → update the God Nodes table in `how-the-app-works.md`
- An implementation rule in AGENTS.md changes → reflect the change in the "Nice-to-Know Details" or relevant feature section of `how-the-app-works.md`

**Conventions:**

- Use `[[page-name]]` for links to other wiki pages (filename without `.md`)
- Use `[[_COMMUNITY_X]]` for links to graph community nodes — names must match `graphify-out/community-labels.json` exactly
- Add a datestamped `> Analysis updated YYYY-MM-DD` note at the top of any page you edit
- Add new pages to the appropriate section in `index.md` before finishing the session
