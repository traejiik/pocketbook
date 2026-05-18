# Pocketbook — Build Handoff (Overview)

You are building **Pocketbook**, a self-hosted personal finance web app for a single user. This file is the cross-cutting context every session needs. Read it once at the start, then open the relevant session file when picking up a session.

---

## Context

Pocketbook replaces a manual finance spreadsheet for one user. It runs in Docker on a homelab, accessed via a reverse proxy. Single-user, no multi-tenant logic. Data is HUF-primary with USD / EUR / GBP support. The design is already done — your job is implementation. Do not re-design; follow the mockups exactly.

## Where to find the design

The design export is at `design-reference/` in the project root (the user will place it there before starting). Read every markdown file in `design-reference/` once before writing any code. The mockups in `design-reference/mockups/source/screens/*.jsx` are the **structural source of truth** — Tailwind class names, layout, and component composition. Port them to TS/Next.js conventions.

Key files in the design export:

- `01-visual-identity.md` — the vibe + brand references
- `02-design-tokens.md` — HSL CSS variables, both themes, finance semantics
- `03-design-system.md` — consolidated spec, layout rules, acceptance bar
- `04-component-map.md` — every component and its purpose
- `05-interaction-notes.md` — motion, state machines, keyboard rules
- `mockups/source/index.html` — the Tailwind config to lift verbatim
- `mockups/source/primitives.jsx` — every base component already implemented in JSX
- `mockups/source/screens/*.jsx` — each of the 9 screens
- `mockups/source/data.jsx` — realistic seed data + formatters
- `logo/` — SVG logo system in light / dark / mono + favicons

---

## Tech stack (locked — do not propose alternatives)

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router, React 18, TypeScript 5 |
| Styling | Tailwind CSS 3.4 + CSS variables |
| Components | shadcn/ui primitives + custom finance components |
| Database | Postgres 16 + Prisma 5 |
| Auth | Auth.js v5 (`next-auth@beta`), credentials provider, single user |
| Forms | react-hook-form + zod |
| Charts | Recharts 2.x (for the expenses-by-category bar chart) + custom SVG (GaugeMeter, PillBar, TimelineStrip) |
| Fonts | Geist + Geist Mono via `next/font/google` |
| Icons | `lucide-react` |
| Toasts | Sonner |
| Dates | `date-fns` |
| Theming | `next-themes`, `class` strategy, localStorage-persisted, **dark default** |
| LLM | Local Ollama via `OLLAMA_BASE_URL` (defaults to `http://ollama:11434`) |
| FX | `frankfurter.app` for dynamic rates, manual override per currency |
| Deploy | Docker Compose: `web` (Next.js standalone) + `db` (postgres:16-alpine) |

---

## Design system — critical points

The full spec is in `design-reference/02-design-tokens.md`. The Tailwind config block to lift is in `design-reference/mockups/source/index.html` (lines 11–72). Rules:

1. **CSS variables are the only colour source.** No hex outside SVG illustrations.
2. **Dark mode is default.** `<html class="dark" suppressHydrationWarning>` on initial render. Toggle via `next-themes`.
3. **Finance semantics are separate from action colours.** `--income` / `--expense` / `--savings` / `--neutral` exist alongside `--primary` and `--destructive`. Never collapse them — never use `--primary` to mean "positive."
4. **Geist + Geist Mono** via `next/font/google`. Apply `.tabular` (`font-feature-settings: 'tnum' 1, 'ss01' 1`) on every monetary number.
5. **Radius:** `--radius: 0.625rem`. The three "islands" (sidebar / header / main content cards) use `rounded-2xl` (16px).
6. **Shadows:** `shadow-pb-1` / `-pb-2` / `-pb-3` for hairline / hover / sheet.
7. **The minus sign for negative values is `−` (U+2212), not `-`.** Already handled in `lib/format.ts`.

---

## App shell — non-negotiable structure

Three floating "islands" with `rounded-2xl` borders and `gap-3` between them. Outer wrapper: `p-3`.

```
┌──────────┐ ┌────────────────────────────────────┐
│ Sidebar  │ │ Header island (h-[68px])           │
│ island   │ ├────────────────────────────────────┤
│ (220px)  │ │                                    │
│          │ │ Screen content area (overflow-auto)│
└──────────┘ └────────────────────────────────────┘
```

Implementation source: `design-reference/mockups/source/app.jsx`. Port the SVG decorative gradient in the sidebar at ~8% opacity. The nav items are pill-shaped buttons (`rounded-full`) — active state is the primary fill, hover is `accent/60`.

The header carries: date eyebrow (`MONDAY · 18 MAY 2026` mono uppercase), search input with `⌘K` suffix, notification button (with `bg-expense` unread dot when due-soon items exist), theme toggle, user chip with sign-out.

---

## Data model

Prisma schema lives in `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum CategoryKind     { INCOME EXPENSE SAVINGS }
enum TransactionType  { INCOME EXPENSE SAVINGS }
enum RecurringCycle   { MONTHLY ANNUAL }
enum FxMode           { AUTO MANUAL }

model User {
  id            String      @id @default(cuid())
  email         String      @unique
  passwordHash  String
  createdAt     DateTime    @default(now())
  insights      AiInsight[]
}

model Category {
  id              String          @id @default(cuid())
  name            String
  color           String          // hex e.g. "#3FBF7F"
  kind            CategoryKind
  transactions    Transaction[]
  recurringRules  RecurringRule[]
  @@unique([name, kind])
}

model Transaction {
  id              String          @id @default(cuid())
  date            DateTime        @db.Date
  description     String
  amount          Decimal         @db.Decimal(14, 2)  // sign indicates direction
  currency        String          @db.Char(3)
  type            TransactionType
  categoryId      String
  category        Category        @relation(fields: [categoryId], references: [id])
  recurringRuleId String?
  recurringRule   RecurringRule?  @relation(fields: [recurringRuleId], references: [id])
  createdAt       DateTime        @default(now())
  @@index([date])
  @@index([categoryId])
  @@index([type])
}

model RecurringRule {
  id                  String          @id @default(cuid())
  name                String
  amount              Decimal         @db.Decimal(14, 2)
  currency            String          @db.Char(3)
  cycle               RecurringCycle
  nextDue             DateTime        @db.Date
  kind                CategoryKind    // INCOME or EXPENSE only (SAVINGS handled via Transaction)
  categoryId          String
  category            Category        @relation(fields: [categoryId], references: [id])
  installmentTotal    Int?
  installmentPaid     Int?
  installmentEndsOn   DateTime?       @db.Date
  archived            Boolean         @default(false)
  transactions        Transaction[]
}

model ExchangeRate {
  id            String     @id @default(cuid())
  fromCurrency  String     @db.Char(3)
  toCurrency    String     @db.Char(3)
  rate          Decimal    @db.Decimal(14, 6)
  mode          FxMode
  provider      String?
  updatedAt     DateTime   @default(now()) @updatedAt
  @@unique([fromCurrency, toCurrency])
}

model AppSettings {
  id                  String  @id @default("singleton")
  anchorCurrency      String  @default("HUF") @db.Char(3)
  ollamaUrl           String  @default("http://ollama:11434")
  ollamaModel         String  @default("llama3.1:8b")
  fxAutoSync          Boolean @default(true)
  autoInsightsMonthly Boolean @default(true)
}

model AiInsight {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  monthCovered  String    // YYYY-MM
  modelUsed     String
  content       String    @db.Text
  generatedAt   DateTime  @default(now())
  feedback      String?   // "helpful" | "not-useful" | null
  @@index([monthCovered])
}
```

---

## Folder structure

```
pocketbook/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                 # AppShell
│   │   ├── dashboard/page.tsx
│   │   ├── transactions/page.tsx
│   │   ├── recurring/page.tsx
│   │   ├── renewals/page.tsx
│   │   ├── categories/page.tsx
│   │   ├── insights/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── insights/stream/route.ts   # Ollama SSE proxy
│   │   └── fx/sync/route.ts           # frankfurter sync (cron-callable)
│   ├── layout.tsx
│   └── globals.css                    # tokens + base styles
├── components/
│   ├── shell/   { AppShell, Sidebar, Header, LogoMark }
│   ├── ui/      # shadcn primitives
│   ├── finance/ { AmountDisplay, CategoryBadge, KpiBig, KpiCard, GaugeMeter,
│   │              PillBar, RecurringRuleCard, TimelineStrip, CurrencyInput }
│   ├── forms/   { TransactionForm }
│   └── insights/{ InsightCard, InsightStatusBar }
├── lib/
│   ├── prisma.ts
│   ├── auth.ts
│   ├── fx.ts           # conversion + anchor helpers
│   ├── format.ts       # fmtHUF, fmtCur, fmtDate, dayOfWeek
│   ├── ollama.ts       # streaming client
│   └── frankfurter.ts  # FX rate fetcher
├── server-actions/
│   ├── transactions.ts
│   ├── recurring.ts
│   ├── categories.ts
│   ├── insights.ts
│   └── settings.ts
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── scripts/
│   └── csv-import.ts                  # reads /seed/transactions.csv if present
├── public/logo/                       # copied from design-reference
├── seed/transactions.csv              # optional, gitignored
├── design-reference/                  # the design export (do not modify)
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── tailwind.config.ts
├── next.config.mjs
├── CLAUDE.md                          # repo-level Claude Code instructions
└── README.md
```

---

## Implementation rules

These differ from defaults. Agents drift toward defaults — state them as rules.

1. **No hardcoded hex.** Outside SVG illustrations (logo, gauge, login background), every colour comes from a CSS variable via a Tailwind class.
2. **Tabular numerics on every monetary value.** Use `.tabular`. The `AmountDisplay` component does this — prefer it over raw numbers.
3. **Server Actions for mutations, not REST routes.** REST only for the SSE streaming endpoint and the cron-callable FX sync.
4. **No client-side data fetching for initial render.** Page-level data comes from server components calling Prisma directly. Client state is for forms, drawer open/close, filters, and theme only.
5. **Skeletons over spinners. No "Loading…" text anywhere.** Use `Skeleton` shapes that match the final UI.
6. **Optimistic writes on Add Transaction.** Use `useOptimistic`. If the server action rejects, flash the row red and roll back.
7. **Dark mode is default.** `<html class="dark" suppressHydrationWarning>` on first render. `next-themes` handles toggling.
8. **Currency conversion goes through `lib/fx.ts`.** Never inline conversion logic anywhere else.
9. **The minus sign is `−` (U+2212), not `-`.**
10. **No multi-user logic.** The User table has one row, seeded from env. Treat session resolution as `User.findFirst()`.
11. **All currencies are uppercase three-letter codes** (`HUF`, `USD`, `EUR`, `GBP`).
12. **Date columns are `@db.Date`.** Do not store time-of-day on transactions or recurring rules. UI never shows a time.

---

## Learning mode — teach as you go

Tida is a 3rd-year CS student building this for portfolio value and for the skills it locks in. **Treat this as a mentor-led build, not a transcript of code.** When you introduce a concept Tida has not used before in this project, pause and explain it briefly **before** writing the code that uses it.

### Rules

1. **Teach before you write.** Concept first (3–6 sentences), then the code.
2. **One concept at a time.** Never dump multiple new ideas in one explanation.
3. **Use analogies, mental models, simple ASCII diagrams.** Tida learns through metaphor and visuals, not walls of text.
4. **British English.** "colour" not "color", "behaviour" not "behavior", "organise" not "organize".
5. **Skip what Tida already knows.** Do not explain React basics (`useState` / `useEffect` / JSX / props), Tailwind utilities, async/await, destructuring, Git, or generic CLI. He has all of these.
6. **Don't lecture.** If the explanation runs past 6 sentences, you have gone too long.

### Teaching template

For each concept worth pausing on, use this shape:

> **Concept name**
>
> One sentence on what it is.
>
> One sentence on what problem it solves — the "why."
>
> An analogy or mental model (1–2 sentences).
>
> When *not* to use it (1 sentence) — prevents over-applying.
>
> Then write the code.

### Concepts to pause on (per session)

| Session | Concept | Why it matters |
|---|---|---|
| 1 | Server Components vs Client Components | App Router foundation, classic interview question |
| 1 | Tailwind tokens via CSS variables | Why theme-switching "just works" |
| 1 | `next-themes` + `suppressHydrationWarning` | The FOUC / hydration-mismatch gotcha |
| 1 | Auth.js v5 + JWT session strategy | What's in the JWT, how middleware enforces it |
| 1 | Docker multi-stage builds + Next.js `standalone` output | Image size, why `standalone` exists |
| 2 | Prisma schema-first ORM | Schema → migration → client flow; ORM trade-offs |
| 2 | `Decimal` for money (never float) | Floating-point precision and where it bites |
| 2 | CUID vs UUID vs autoincrement | Trade-offs for ID strategies |
| 3 | Server Actions vs REST endpoints | The App Router shift — strong interview material |
| 3 | `useOptimistic` + `startTransition` | The modern optimistic-update pattern |
| 3 | react-hook-form + zod — division of labour | Form state vs schema validation, separated cleanly |
| 4 | React `cache()` for per-request memoisation | Avoiding redundant DB queries in one render |
| 4 | Database transactions (atomic installment increment) | Race conditions and atomicity |
| 5 | Server-Sent Events vs WebSockets | When each is right; SSE is one-way and simpler |
| 5 | `ReadableStream` + async generators for streaming | The modern Web Streams API |
| 5 | bcrypt cost factor | Threat model and how to tune it |
| 5 | Cron sidecar pattern | Separation of concerns vs in-app schedulers |
| 5 | Idempotent seed / import scripts | What "idempotent" actually means in practice |

### Interview-prep flag

When teaching a concept that comes up commonly in software engineering interviews (Server vs Client Components, ORM trade-offs, Server-Sent Events, optimistic UI, JWT vs session, etc.), end the explanation with one sentence prefixed **"Interview note:"** — frame how the concept tends to come up. Tida is applying for internships and Pocketbook is a portfolio piece, so the interview angle compounds the value.

### When Tida asks "why"

Expand the explanation. He's asking because he wants to actually understand. Otherwise stay brief.

---

## Do not build (v1)

- ❌ Bank API integration (Plaid, GoCardless, etc.)
- ❌ Multi-user accounts. No signup flow.
- ❌ Forecasting / projections
- ❌ Mobile app — web only
- ❌ Two-way Google Sheets sync — one-way CSV import only
- ❌ Bank statement parsing
- ❌ Notifications system — the unread dot on the Renewals nav is derived locally from upcoming renewals in the next 30 days. No backend.
- ❌ Command palette behaviour — the search input has the `⌘K` suffix but the palette is wired empty for v1.
- ❌ Linear-style nav shortcuts (`G` then `D`/`T`/`R`). Only `N`, `⌘↵`, and `Esc` are implemented.
- ❌ Fake typewriter on a canned insights string — the streaming must be real Ollama tokens.
- ❌ Custom auth (OAuth, magic link). Credentials only.
- ❌ Email reminders.
- ❌ A real database backup job — the "Last backup" line in Settings can read a placeholder file mtime for v1.

---

## Knowledge graph integration

If this repo has a code knowledge graph configured (look for `graphify` references in `CLAUDE.md` or `AGENTS.md`):

- Before making non-trivial changes, query the graph for the affected files and their dependents.
- After completing each session, run `graphify update .` to refresh the graph.

If no graph is configured (no `graphify` reference in those files), skip — it's a no-op.

---

## Seed data

`prisma/seed.ts` inserts:

1. **One `User`** — email from `SEED_USER_EMAIL`, password hashed (bcrypt, cost 12) from `SEED_USER_PASSWORD`.
2. **12 `Category` rows** — exact match for `design-reference/mockups/source/data.jsx` lines 8–21 (id strings, names, colours, kinds).
3. **`AppSettings` singleton** with defaults (HUF anchor, Ollama at `http://ollama:11434`, model `llama3.1:8b`, both auto-sync flags `true`).
4. **`ExchangeRate` rows** for `HUF↔USD` (358.40) and `HUF↔EUR` (396.10), mode `AUTO`, provider `frankfurter.app`.
5. **`RecurringRule` rows** from `data.jsx` lines 54–71. Map `monthly` / `annual` → `MONTHLY` / `ANNUAL`. Map `installment: { paid, total, endsOn }` → `installmentTotal` / `installmentPaid` / `installmentEndsOn`. Map `kind` `expense` / `income` → `EXPENSE` / `INCOME`.

A separate one-time CSV importer (`scripts/csv-import.ts`) reads `/seed/transactions.csv` if the file exists on first boot. CSV columns: `date,description,amount,currency,type,category_id,recurring_rule_name?`. Skip silently if the file is missing — manual entry takes over.

---

## Session index

| # | File | Scope |
|---|------|-------|
| 1 | `01-session-foundation.md` | Project bootstrap, tokens, fonts, AppShell, auth, theme, 9 route placeholders, docker-compose. |
| 2 | `02-session-data-and-primitives.md` | Prisma schema + migrations + seed. Port all primitives from `primitives.jsx`. Formatters and FX helpers. |
| 3 | `03-session-transactions.md` | Transactions list (filters, search, grouped-by-date), Add/Edit Transaction Sheet, server actions, keyboard shortcuts, optimistic writes. |
| 4 | `04-session-dashboard-and-lists.md` | Dashboard (KPI row, expenses chart, renewals widget, recent activity, GaugeMeter, AI feature card), Recurring (with installment cards), Renewals (with TimelineStrip), Categories CRUD. |
| 5 | `05-session-insights-settings-polish.md` | AI Insights with real Ollama streaming, Settings (anchor + tracked currencies + auto-sync, password, LLM picker), Frankfurter sync, CSV importer, README, final cleanup. |

Open the next session file and read it fully before writing code. Do not skip ahead — later sessions assume earlier sessions are complete.
