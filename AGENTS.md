# Pocketbook — Codex instructions

Read `other/handoff/00-overview.md` at the start of every session. Open the relevant session file before writing any code.

## Design reference

All visual decisions come from `other/design-reference/`. Never deviate from the mockups in `other/design-reference/mockups/source/screens/*.jsx`. Port them faithfully — class names, layout, component composition, unless asked to change something otherwise

## Implementation rules (non-negotiable)

1. **No hardcoded hex** — outside SVG illustrations (logo, gauge, login background), every colour comes from a CSS variable via a Tailwind class.
2. **Tabular numerics on every monetary value** — use `.tabular` or the `AmountDisplay` component.
3. **Server Actions for mutations, not REST routes** — REST only for the SSE streaming endpoint and cron-callable FX sync.
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

## Stack (locked)

Next.js 14 · React 18 · TypeScript 5 · Tailwind CSS 3.4 · shadcn/ui · Postgres 16 · Prisma 5 · Auth.js v5 · react-hook-form + zod · Recharts · Geist fonts · Sonner · date-fns · next-themes · Ollama · Frankfurter

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
