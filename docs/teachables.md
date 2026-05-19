# Teachables

Concepts introduced session by session, with a short recap and the interview angle where applicable.

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
