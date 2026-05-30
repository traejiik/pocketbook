# Pocketbook — Agent instructions

Read `other/handoff/00-overview.md` at the start of every session. Open the relevant session file before writing any code.

## Design reference

All visual decisions come from `other/design-reference/`. Never deviate from the mockups in `other/design-reference/mockups/source/screens/*.jsx`.
Port them faithfully — class names, layout, component composition, unless asked to change something otherwise

## Implementation rules (non-negotiable)

1. **No hardcoded hex** — outside SVG illustrations (logo, gauge, login background), every colour comes from a CSS variable via a Tailwind class.
2. **Tabular numerics on every monetary value** — use `.tabular` or the `AmountDisplay` component.
3. **Server Actions for mutations, not REST routes** — REST only for SSE streaming and secret-authenticated cron endpoints (FX sync, monthly insights, recurring sync).
4. **No client-side data fetching for initial render** — page-level data comes from server components calling Prisma directly.
5. **Skeletons over spinners** — no "Loading…" text anywhere.
6. **Optimistic writes on Add Transaction** — use `useOptimistic`. Roll back on server rejection.
7. **Dark mode is default** — `<html class="dark" suppressHydrationWarning>` on first render.
8. **Currency conversion goes through `lib/fx.ts`** — never inline conversion logic.
9. **The minus sign is `−` (U+2212), not `-`.**
10. **No multi-user logic** — one User row, seeded from env. Use `prisma.user.findFirst()`.
11. **All currencies are uppercase three-letter codes** — `HUF`, `USD`, `EUR`, `GBP`.
12. **Date columns are `@db.Date`** — no time-of-day on transactions or recurring rules.

## Do not build (v1)

- Bank API integration, multi-user, forecasting, mobile app
- Two-way Google Sheets sync (one-way CSV import only)
- Bank statement parsing, email reminders
- Command palette behaviour (search input has `⌘K` suffix but is wired empty)
- Linear-style nav shortcuts — only `N`, `⌘↵`, and `Esc` are implemented
- Fake typewriter on insights — streaming must be real Ollama tokens
- Custom auth (OAuth, magic link) — credentials only

## Stack and dependency policy

Current implementation: Next.js 16.2.6 · React 19.2.6 · TypeScript 5 · Tailwind CSS 4.3 · shadcn v4 registry style · Base UI-backed local primitives · Postgres 16 · Prisma 7.8 · Auth.js v5 · react-hook-form + zod · Recharts 2 · Geist fonts · Sonner · date-fns · next-themes · Ollama · Frankfurter · Node 24 · pnpm 10.33.0 in Docker.

The stack is not locked to old major versions. Major upgrades are allowed when they are intentional, tested, and documented. Pin exact versions only where operational coupling matters: Next.js with `eslint-config-next`, Docker Node image major, Docker pnpm version, Prisma runner CLI, PostgreSQL image major, and CI action majors. Let ordinary app libraries float by semver range plus `pnpm-lock.yaml`, but treat Prisma, Auth.js beta changes, React, Tailwind, and charting major upgrades as explicit upgrade projects.

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
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
