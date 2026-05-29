# Pocketbook

A self-hosted personal finance tracker for a single user. Replaces a manual spreadsheet — tracks income, expenses, savings, recurring rules, renewals, and categories, with an AI-powered monthly summary generated locally via Ollama. No cloud, no subscription, no third-party data.

---

## Stack

- **Framework:** Next.js 16.2.6 (App Router) · React 19.2.6 · TypeScript 5
- **Styling:** Tailwind CSS 4.3 via CSS-first `@theme` tokens in `app/globals.css`
- **Components:** shadcn v4 registry style, local Base UI-backed primitives, and custom finance components
- **Database:** PostgreSQL 16 + Prisma 7.8
- **Auth:** Auth.js v5 (`next-auth@beta`, credentials provider, single user)
- **Forms:** react-hook-form + zod
- **Charts:** Recharts 2 + custom SVG
- **AI:** Local Ollama via `PB_OLLAMA_BASE_URL` in deploy env, passed to the app as `OLLAMA_BASE_URL`
- **FX rates:** frankfurter.app (ECB feed), auto-synced daily
- **Runtime/deploy:** Node 24 Alpine, pnpm 10.33.0 in Docker, Docker Compose, GHCR image releases

## Features

- Dashboard with income/expense KPIs, savings gauge, upcoming renewals, and expense chart
- Transactions list with filters, search, grouped by date, optimistic add/edit
- Recurring rules with installment tracking (e.g. mobile instalments countdown)
- Renewals view with timeline strip and week/month grouping
- Categories with CRUD and spend stats
- AI Insights: real streaming from local Ollama, saved to DB, feedback buttons
- Settings: anchor currency, tracked FX rates (dynamic/manual), password change, LLM picker
- CSV importer for bootstrapping from existing data

---

## Quick start

```bash
# 1. Clone and copy env
git clone https://github.com/traejiik/pocketbook.git
cd pocketbook
cp .env.example .env

# 2. Fill in .env — required vars:
#   PB_POSTGRES_PASSWORD, PB_AUTH_SECRET, PB_AUTH_URL
#   PB_SEED_USER_EMAIL, PB_SEED_USER_PASSWORD, PB_FX_SYNC_SECRET
#   PB_OLLAMA_BASE_URL (e.g. http://homelab.local:11434)

# 3. Start
docker-compose up -d

# 4. Open http://localhost:3000 and log in with your PB_SEED_USER_EMAIL / PB_SEED_USER_PASSWORD
```

The `pocketbook-web` container builds `PB_DATABASE_URL` from the `PB_POSTGRES_*` variables at runtime, then runs `prisma migrate deploy` and the idempotent seed before starting Next.js.

---

## Ollama prerequisite

Pocketbook connects to an existing Ollama instance — it does **not** run Ollama itself. In `.env`, point `PB_OLLAMA_BASE_URL` at your Ollama container or machine. Docker passes it into the app as `OLLAMA_BASE_URL`:

```
PB_OLLAMA_BASE_URL=http://homelab.local:11434
```

Recommended models (pull on your Ollama instance): `llama3.1:8b`, `mistral:7b`, `qwen2.5:14b`.

If Ollama is unreachable the app still works; the Insights screen shows "Unreachable" and the Generate button is disabled.

---

## CSV import

Bootstrap transactions from a spreadsheet export by placing a file at `seed/transactions.csv` before running `docker-compose up` (or `pnpm prisma db seed`).

Column format:

```
date,description,amount,currency,type,category_id,recurring_rule_name
2026-01-05,Salary,450000,HUF,INCOME,salary,
2026-01-06,Spar,-8900,HUF,EXPENSE,food,
2026-01-20,Apple Music,-1990,HUF,EXPENSE,subs,Apple Music
```

- `date` — ISO 8601 (`YYYY-MM-DD`)
- `amount` — signed; negative = expense, positive = income/savings
- `currency` — uppercase 3-letter code (`HUF`, `USD`, `EUR`, `GBP`)
- `type` — `INCOME`, `EXPENSE`, or `SAVINGS`
- `category_id` — must match an existing category `id` from the seed
- `recurring_rule_name` — optional; links the transaction to a rule by name

The importer is **idempotent**: re-running it skips rows that already exist by `(date, description, amount)`.

For ad-hoc imports after first boot: `pnpm tsx scripts/csv-import.ts`

---

## Architecture

```text
app/                  Next.js App Router — pages and layouts
components/           UI primitives and finance-specific components
server-actions/       All mutations (Server Actions, no REST)
lib/                  fx.ts, auth helpers, Prisma client
prisma/               Schema, migrations, seed
seed/                 CSV bootstrap data (optional)
scripts/              Ad-hoc import and maintenance scripts
other/                Design reference, mockups, handoff notes
```

Data flow: server components fetch from Prisma directly -> pass props -> Server Actions mutate -> `revalidatePath` refreshes. No client-side data fetching for initial renders.

Design-system authority:

- `other/design-reference/` is the canonical design contract. Its screen JSX remains the structural source of truth for layout, class intent, and component composition.
- `app/globals.css` and live components are the canonical implementation.
- `design-system/` is a generated compact audit/manual of the current implementation. Use it for orientation, but do not let it overrule `other/design-reference/` without an explicit design decision.

## Dependency policy

The stack is not frozen at old major versions. Upgrade when the ecosystem has moved and the app can prove it still builds, migrates, and renders correctly. The lockfile decides exact installed packages; docs should describe the implemented major line and any exact versions that are operationally important.

- **Pin exactly:** Next.js and `eslint-config-next` together, Docker Node base image major, Docker pnpm version, Prisma CLI in the runner image, PostgreSQL image major, and CI actions by major.
- **Allow minor/patch drift through the lockfile:** React, Tailwind, Base UI, shadcn CLI, lucide, date-fns, Sonner, Recharts, zod, react-hook-form, and utility packages.
- **Treat as upgrade projects:** Prisma major upgrades, Auth.js beta changes, React major upgrades, Tailwind major upgrades, and Recharts major upgrades. They touch generated clients, runtime contracts, or visual output, so they need a branch plus build/browser verification.

Recent `pnpm outdated` notes worth considering: Prisma 7, Recharts 3, Sonner 2, zod 4, lucide-react 1, bcryptjs 3, and TypeScript 6 are available major upgrades. Do them deliberately; dependency roulette is still roulette, even if the chips are semver-shaped.

## Stack additions to consider

- **Playwright:** browser smoke tests for login, dashboard, transaction add/edit, and Settings. This is the highest-value addition because the app is UI-heavy.
- **Vitest:** focused tests for `lib/format.ts`, `lib/fx.ts`, aggregation helpers, and server-action validation.
- **pino or structured logging:** cleaner production logs around auth, FX sync, Ollama streaming, and migrations.
- **pg_dump backup sidecar:** a real homelab backup job for Postgres, replacing the current backup sentinel placeholder.
- **Sentry or OpenTelemetry, self-hosted if preferred:** optional, but useful once this runs unattended.
- **Dependabot or Renovate:** scheduled dependency PRs with grouping rules for low-risk packages and manual approval for major framework/runtime upgrades.

---

## Development

```bash
pnpm install
cp .env.example .env         # fill in PB_DATABASE_URL for local dev
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).
