# Session 1 — Foundation

Read `00-overview.md` first if you haven't — pay attention to the **Learning mode** section. Pause and teach when you reach a concept marked for this session in the concepts table.

This session bootstraps the project, wires up the design tokens, builds the AppShell, sets up auth, and scaffolds placeholder routes for all 9 screens.

**By end of session:** you can run `pnpm dev`, see the dark-mode AppShell with the sidebar nav working, click between empty placeholder routes, and toggle the theme. Auth is wired but every protected route just renders a "TODO" heading.

---

## Step 1 — Initialise

```bash
pnpm create next-app@latest pocketbook --typescript --tailwind --eslint --app --src-dir=false --import-alias='@/*'
cd pocketbook
git init && git add . && git commit -m "chore: initial scaffold"
```

Install runtime deps:

```bash
pnpm add prisma @prisma/client \
        next-auth@beta @auth/prisma-adapter \
        next-themes \
        react-hook-form @hookform/resolvers zod \
        sonner lucide-react date-fns \
        recharts \
        bcryptjs
pnpm add -D @types/bcryptjs prisma tsx
```

Initialise shadcn:

```bash
pnpm dlx shadcn@latest init -y -d
```

When prompted, accept the New York style and "Slate" base colour — we override the entire palette anyway.

Install the shadcn primitives we'll use across all sessions:

```bash
pnpm dlx shadcn@latest add button card input label select switch tabs dialog sheet popover dropdown-menu tooltip table badge skeleton sonner calendar separator command form
```

---

## Step 2 — Tokens, fonts, Tailwind config

Replace `app/globals.css` with the full CSS-variable block from `design-reference/mockups/source/index.html` lines 75–161. The `:root` block defines light theme; `.dark` defines dark. Both `--income` / `--expense` / `--savings` / `--neutral` and the three `--shadow-*` variables must be there.

Also include the `.tabular`, `.mono`, `.pb-card`, `.pb-card-hover` utility classes from the same file (lines 143–155).

Replace `tailwind.config.ts` with the config block from `design-reference/mockups/source/index.html` lines 11–72, converted to TS module syntax. Make sure to include:

- `darkMode: 'class'`
- `fontFamily.sans = ['var(--font-geist-sans)', ...]` and `fontFamily.mono = ['var(--font-geist-mono)', ...]`
- All shadcn-style colour bindings including finance semantics (`income`, `expense`, `savings`, `neutral2`)
- `borderRadius.{lg,md,sm}` mapped to `var(--radius)`
- `boxShadow.{pb-1,pb-2,pb-3}` mapped to `var(--shadow-*)`

Wire up fonts in `app/layout.tsx`:

```ts
import { Geist, Geist_Mono } from 'next/font/google';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
```

Apply `${sans.variable} ${mono.variable}` to `<html>` and `font-sans` to `<body>`.

---

## Step 3 — Theme provider, dark default

Install `next-themes` (already in deps). Create `components/theme-provider.tsx` as a thin client wrapper. In `app/layout.tsx`:

```tsx
<html lang="en" className="dark" suppressHydrationWarning>
  <body className={`${sans.variable} ${mono.variable} font-sans bg-background text-foreground`}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
      <Toaster position="bottom-right" />
    </ThemeProvider>
  </body>
</html>
```

The theme toggle (built in step 5) writes to `localStorage` via `useTheme()`. No page animation between themes — the swap is hard.

---

## Step 4 — Auth.js v5, single user

Create `lib/auth.ts`:

```ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: { password: { type: 'password' } },
      async authorize({ password }) {
        const user = await prisma.user.findFirst();
        if (!user) return null;
        const ok = await bcrypt.compare(password as string, user.passwordHash);
        return ok ? { id: user.id, email: user.email } : null;
      },
    }),
  ],
  pages: { signIn: '/login' },
});
```

(`lib/prisma.ts` comes in session 2 — for now stub it with `export const prisma = null as any` so the file compiles. Auth itself won't run until session 2.)

Add a `middleware.ts` at the project root that redirects unauthenticated requests for any path other than `/login` to `/login`. Use the `auth` export above.

Create `app/api/auth/[...nextauth]/route.ts` exporting `handlers.GET` and `handlers.POST`.

Build `app/(auth)/login/page.tsx` as a minimal centred card matching `design-reference/mockups/source/screens/login.jsx` — port the SVG glow grid and faint currency glyphs exactly. The card has the password input with show/hide toggle and a single sign-in button. Submission calls `signIn('credentials', { password, redirectTo: '/dashboard' })`.

Welcome line: use a name from `NEXT_PUBLIC_USER_DISPLAY_NAME` env var. The mockup says "Bence" — replace by reading the env var, defaulting to "back" so the line reads `Welcome back, back` only if unset (user is expected to set it).

---

## Step 5 — AppShell, Sidebar, Header, LogoMark

Build these as TS React components in `components/shell/`. Source: `design-reference/mockups/source/app.jsx`. Port the JSX faithfully — class names, the SVG decorative gradient in the sidebar, the active-nav pill, the Quick Add footer button with the `N` shortcut badge.

`components/shell/LogoMark.tsx` — the half-circle gauge arc + dot. Use the SVG from `design-reference/logo/pocketbook-logo.svg` inline so it can be tinted via `currentColor`. Sizes: `16`, `24`, `32`, `64`. Accept `size` prop.

`components/shell/Sidebar.tsx` — the 220px island. `nav` array of `{ id, label, icon }` matching the 9 screens minus Login. Active state = the route segment matches `id`. Use `usePathname()`. The Renewals item gets the amber count badge — for v1, derive the count server-side (in `AppShell`) and pass down; the count is "recurring expenses with `nextDue` within 30 days." For session 1, hardcode `6` and replace with the real count in session 4.

`components/shell/Header.tsx` — the 68px island. Date eyebrow uses `date-fns` `format(new Date(), 'EEEE · dd MMM yyyy')` (uppercase via Tailwind `uppercase`). Search input is the shadcn Input with `⌘K` suffix — non-functional in v1, just decorative. Theme toggle uses `useTheme()`. User chip on the right shows the user's email + a `signOut()` button.

`components/shell/AppShell.tsx` — wraps Sidebar + Header + main. Receives `{ children }`. Lives at `app/(app)/layout.tsx`.

The notification dot: render only when `upcomingRenewalsCount > 0`. Colour: `bg-expense`. For session 1, pass a static `1` from `AppShell`; fix in session 4.

---

## Step 6 — Route placeholders

Each of these is a server component that just renders `<h1 className="text-[22px] font-semibold tracking-tight">{name}</h1>` inside `<div className="px-8 py-6">`:

- `app/(app)/dashboard/page.tsx`
- `app/(app)/transactions/page.tsx`
- `app/(app)/recurring/page.tsx`
- `app/(app)/renewals/page.tsx`
- `app/(app)/categories/page.tsx`
- `app/(app)/insights/page.tsx`
- `app/(app)/settings/page.tsx`

`app/page.tsx` redirects to `/dashboard`.

---

## Step 7 — Docker + env

`Dockerfile` — multi-stage Next.js standalone build. Final stage is `node:20-alpine`. Expose `3000`. Copy `.next/standalone`, `.next/static`, and `public`. Run `node server.js`. Set `output: 'standalone'` in `next.config.mjs`.

`docker-compose.yml`:

```yaml
services:
  web:
    build: .
    image: pocketbook
    container_name: pocketbook-web
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://pocketbook:${POSTGRES_PASSWORD}@db:5432/pocketbook
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: ${NEXTAUTH_URL}
      OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://ollama:11434}
      NEXT_PUBLIC_USER_DISPLAY_NAME: ${USER_DISPLAY_NAME}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - default
      - core_net    # joins existing homelab network so it can reach ollama
    ports:
      - "3000:3000"

  db:
    image: postgres:16-alpine
    container_name: pocketbook-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: pocketbook
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: pocketbook
    volumes:
      - pocketbook-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pocketbook"]
      interval: 5s
      retries: 5

networks:
  core_net:
    external: true

volumes:
  pocketbook-data:
```

`.env.example`:

```
POSTGRES_PASSWORD=changeme
DATABASE_URL=postgresql://pocketbook:changeme@localhost:5432/pocketbook
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
OLLAMA_BASE_URL=http://localhost:11434
USER_DISPLAY_NAME=Tida
SEED_USER_EMAIL=tida@home.lan
SEED_USER_PASSWORD=changeme-on-first-boot
```

Note the `core_net` join — that's how the container will reach Ollama on the homelab (matches the existing `jobsync` pattern).

---

## Step 8 — Repo-level `CLAUDE.md`

Create `CLAUDE.md` in the project root with the rules from `00-overview.md` (Implementation rules, Do not build, plus a pointer to `design-reference/`). Claude Code reads this on every subsequent session.

---

## Session checklist

- [ ] `pnpm dev` runs without errors
- [ ] Dark mode renders on first paint (no flash to light)
- [ ] AppShell layout matches the mockup: 3 islands, `rounded-2xl`, `gap-3`
- [ ] Sidebar nav highlights the active route based on the URL
- [ ] Theme toggle works and persists across reload via localStorage
- [ ] All 9 routes resolve to placeholder pages
- [ ] `/` redirects to `/dashboard`
- [ ] Unauthenticated requests redirect to `/login`
- [ ] Login screen visually matches `screens/login.jsx` with the SVG glow grid
- [ ] `docker-compose build` completes without errors (`docker-compose up` will fail until session 2 migrates the DB — that's expected)
- [ ] `CLAUDE.md` exists with the implementation rules and `design-reference/` pointer
- [ ] Commit: `feat: bootstrap project, tokens, shell, auth scaffold`

Run `graphify update .` after completing this session if the graph is configured.

---

**Next session:** `02-session-data-and-primitives.md` — Prisma schema, migrations, seed, port every primitive from the design export.
