# Teachables

Concepts introduced session by session, with a short recap and the interview angle where applicable.

---

## Session 4 — Dashboard & Lists

### 1. React `cache()` — per-request memoisation

`React.cache()` wraps a function so that multiple calls with the same arguments *within a single server render* share one result. The first call executes; every subsequent call returns the stored value. The cache is thrown away after each request — it is not persistent storage.

Mental model: a sticky note on the kitchen worktop. Anyone in the kitchen during that meal can read it for free, but it's binned when the table is cleared.

When *not* to use it: don't cache mutations or anything that must return fresh data across different requests. It only saves within one render tree.

**Interview note:** "What's the difference between React `cache()` and `unstable_cache`?" — `cache()` is per-request (a synchronous memo within one render), while `unstable_cache` is cross-request (persistent, closer to a CDN layer with a TTL). Interviewers testing App Router knowledge often ask this.

---

### 2. Database transactions — atomic writes

When two tables must be updated together or not at all, wrap them in `prisma.$transaction([...])`. Prisma sends both SQL statements in a single atomic unit — if one fails, the other is rolled back automatically.

In Pocketbook this applies when a transaction is linked to an installment recurring rule: creating the transaction row and incrementing `installmentPaid` on the rule must succeed together, otherwise the paid counter would go out of sync with the actual transaction history.

Mental model: a bank transfer — you can't credit one account without debiting the other in the same commit, or money appears from nowhere.

When *not* to use it: single-table writes don't need a transaction. Unnecessary transactions hold database locks longer and add latency.

**Interview note:** "How do you prevent partial writes when two tables need to be updated together?" — the answer is a database transaction, and Prisma's `$transaction()` is the idiomatic way to do it. You can follow up by explaining rollback guarantees.

---

## Session 1 — Foundation

### 1. Server Components vs Client Components

Every component in the Next.js App Router is a Server Component by default — it runs only on the server and never ships its code to the browser. Add `'use client'` at the top only when you need `useState`, `useEffect`, event listeners, or browser-only APIs. Everything else stays a Server Component and can call the database or read env vars directly inside the component.

Mental model: Server Components are the kitchen — they prepare the HTML and send it out. Client Components are the table — they stay hot and interactive in the browser.

**Interview note:** Interviewers ask "when would you use a Client Component?" — the answer is exactly that list: local state, side effects, and browser APIs.

---

### 2. Tailwind tokens via CSS variables

Instead of hardcoding colours like `text-blue-600`, the Tailwind config maps every colour to a CSS variable: `bg-primary` becomes `background-color: hsl(var(--primary))`. When `.dark` is added to `<html>`, the CSS vars swap to dark values — and every Tailwind class picks up the change automatically, with no JavaScript rerenders.

Mental model: the Tailwind colour name is just a nickname for a CSS variable. `bg-income` = "whatever `--income` says right now." The dark class changes what the variable says.

---

### 3. `next-themes` + `suppressHydrationWarning`

`next-themes` persists the user's theme in `localStorage` and applies it as a class on `<html>`. The gotcha: the server renders HTML before it can read `localStorage`, so the first paint could flash from dark → light (a FOUC — Flash of Unstyled Content). The fix is two parts: default `<html class="dark">` on the server so the first paint is always dark, and `suppressHydrationWarning` on `<html>` so React doesn't warn about the expected class mismatch between server and client.

Only put `suppressHydrationWarning` on the element that's intentionally out of sync — not everywhere.

**Interview note:** FOUC and the `suppressHydrationWarning` tradeoff come up in SSR/SSG interviews. The expected answer is "server defaults to one theme, client overrides immediately, suppress only the root element's mismatch."

---

### 4. Auth.js v5 + JWT session strategy

Auth.js handles the session lifecycle — login, logout, protecting routes. With `strategy: 'jwt'`, the session lives in a signed cookie; no database session table is needed. The server verifies any request by checking the JWT signature against `NEXTAUTH_SECRET`.

Mental model: the JWT is a sealed envelope. Anyone can read the outside (the payload — user ID, email), but only someone with the secret key can seal it. The server checks the seal, not a database row.

The middleware must run in the Edge Runtime — which means it cannot use Node.js-only packages like `bcryptjs`. The fix is to split auth into two files: `auth.config.ts` (edge-safe, no providers) for middleware JWT validation, and `lib/auth.ts` (full, Node-only) for the credentials sign-in flow.

**Interview note:** "JWT vs database sessions" is a classic auth question. JWT = stateless + scalable + can't revoke instantly. Database sessions = stateful + instant revoke + extra DB load.

---

### 5. Docker multi-stage builds + Next.js `standalone` output

A multi-stage Dockerfile uses multiple `FROM` blocks: one stage to build (with compilers and dev tools), and a final stage that copies only the built output — shrinking the image from ~2 GB to ~200 MB. `output: 'standalone'` in `next.config.mjs` tells Next.js to bundle everything needed at runtime into `.next/standalone`, so you don't need to copy all of `node_modules` into the image.

Key layer-caching rule: `COPY package.json` before `COPY .` so a source-code change doesn't invalidate the `pnpm install` layer.

**Interview note:** Multi-stage builds and layer caching are common DevOps interview topics.

---

## Session 2 — Data Layer + Primitives

### 1. Prisma: schema-first ORM

An ORM where you write one `.prisma` file and Prisma generates both the SQL migration *and* a type-safe TypeScript client from it automatically.

Problem solved: without it you write SQL to create tables and TypeScript types to represent rows separately — they drift apart silently. Prisma makes them the same source of truth. Change the schema, run `prisma migrate dev`, and the TypeScript types update with it.

Mental model: `schema.prisma` is a contract. The migration is Prisma turning that contract into real database tables. `@prisma/client` is Prisma turning that contract into TypeScript functions like `prisma.transaction.findMany()`.

Don't reach for Prisma when you need raw-SQL performance tuning or complex CTEs — the abstraction layer gets in the way there.

**Interview note:** "ORM vs raw SQL trade-offs" is standard in backend interviews. The answer: ORM for productivity and type-safety on CRUD; raw SQL for complex joins, window functions, or throughput-critical hot paths.

---

### 2. `Decimal` for money — never `float`

`Decimal` maps to PostgreSQL's `NUMERIC` type, which stores exact decimal values as a string of digits rather than a binary fraction.

Problem solved: IEEE 754 floats can't represent most decimal fractions exactly — `0.1 + 0.2 = 0.30000000000000004`. For money that drift compounds across thousands of transactions and produces incorrect totals.

Mental model: a float stores "approximately 0.1". `NUMERIC` stores the digit `1` with a note saying "one decimal place." No approximation involved. In TypeScript, Prisma gives you a `Decimal` object — call `Number(d)` or `.toNumber()` to convert for display.

Don't use `Decimal` for ratios, percentages, or computed physics values — it's slower and the precision overkill doesn't matter there.

**Interview note:** "Why not float for money?" is near-universal in backend interviews. The one-line answer: IEEE 754 rounding. Always use `NUMERIC`/`DECIMAL` in SQL or a decimal library (`decimal.js`, Python's `Decimal`) in application code.

---

### 3. CUID vs UUID vs autoincrement

Three strategies for generating unique row IDs with different trade-offs on size, sortability, and index performance.

Problem solved: you need IDs that are unique, URL-safe, and don't leak record counts or cause database performance problems at scale.

Mental model: autoincrement is like numbering books 1, 2, 3 — simple, but leaks how many records exist. UUID v4 is a random barcode — globally unique, but randomness means new records get inserted all over the B-tree index, causing page splits and slower inserts. CUID is a timestamp-prefixed barcode — still globally unique, but roughly time-ordered so new records go to the "right end" of the index. Fast inserts, no page splits.

Don't use CUID if you need IDs generated across many machines without coordination — look at ULID or Snowflake IDs for distributed systems.

**Interview note:** "What ID strategy would you pick and why?" — mention index locality. UUID v4 kills B-tree insert performance at scale. CUID/ULID are the modern defaults because they're time-ordered.

---

### 4. React `cache()` — brief intro (deep dive Session 4)

`React.cache()` wraps any async function and memoises its result for the duration of one server render pass. The first call fetches from the DB; every subsequent call in the same request returns the cached result instantly.

Used in `lib/fx.ts` so `getRate('HUF', 'USD')` only hits the database once per request even if dozens of components call it. This is server-only — it has no effect in client components.

Full deep dive including when to use it, when not to, and the difference from `unstable_cache` comes in Session 4.

---

## Session 3 — Transactions + Add/Edit Sheet

### 1. Server Actions vs REST endpoints

A Server Action is an async function marked `'use server'` that Next.js compiles to run on the server but is *called* from a client component like a normal async function — no `fetch`, no URL, no manual JSON serialisation.

Problem solved: previously you'd write an API route (`/api/transactions`), call it with `fetch`, handle loading/error state, and keep client-side types in sync manually. A Server Action collapses all of that into one typed function call.

Mental model: Next.js auto-generates a secret POST endpoint for each action. When your button calls `upsertTransaction(data)`, the browser invisibly POSTs to that endpoint, the server runs the function, `revalidatePath` fires, and the page refreshes. You never touch the HTTP layer.

Don't use Server Actions for: GET requests or streaming — use route handlers for those (which is why the Ollama streaming endpoint stays in `api/insights/stream/route.ts`).

**Interview note:** "When would you choose a Server Action over a REST endpoint?" — Server Actions for mutations tied to a specific UI; REST routes when you need a public URL callable from outside (cron jobs, mobile clients, webhooks).

---

### 2. react-hook-form + zod — division of labour

`react-hook-form` manages *form state* (which fields are dirty, current values, submission status). `zod` manages *data validation* (does this value have the right shape and constraints). They're separate concerns, connected by `zodResolver` from `@hookform/resolvers/zod`.

Mental model: react-hook-form is the spreadsheet tracking every cell's current value; zod is the type-checker that runs when you try to save. You write the validation schema once in zod and react-hook-form calls it for you on submit.

react-hook-form is intentionally *uncontrolled* under the hood — it uses refs rather than `useState` per field, so the component doesn't re-render on every keystroke. This is why it stays fast even with large forms.

Don't reach for react-hook-form for single-field forms or things that are better as plain `useState` — the setup cost only pays off when you have validation, interdependent fields, or dirty-state tracking.

**Interview note:** "Controlled vs uncontrolled forms" — react-hook-form is uncontrolled by default for performance. Common follow-up after "walk me through your form handling."

---

### 3. `useOptimistic` + `startTransition`

`useOptimistic` lets you show a *fake* version of state immediately — before the server responds — then automatically reconcile with the real data when the server is done.

`startTransition` tells React: "this update is non-urgent — don't block the user's clicks and typing while it processes." You *must* wrap the Server Action call in `startTransition` alongside `addOptimistic`, so React treats the fake update and the real async call as part of the same transition.

Mental model: `useOptimistic` is the pencil row in a spreadsheet; `startTransition` is handing the real write to a background worker. When the worker finishes, the real ink replaces the pencil automatically. If the worker fails, the pencil disappears on the next render — that's the automatic rollback.

Don't use it for operations where showing a wrong state would be confusing — e.g. financial aggregates that feed other decisions in the same view. For a transaction list, a briefly stale row is harmless.

**Interview note:** "How do you implement optimistic UI without a state management library?" — `useOptimistic` + `startTransition` is the modern React 19 answer. Knowing this pattern signals you follow App Router conventions rather than defaulting to Redux or SWR for everything.

---
