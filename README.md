# Pocketbook

A self-hosted personal finance tracker for a single user. Replaces a manual spreadsheet — tracks income, expenses, savings, recurring rules, renewals, and categories, with an AI-powered monthly summary generated locally via Ollama. No cloud, no subscription, no third-party data.

---

## Stack

- **Framework:** Next.js 14 (App Router) · React 18 · TypeScript 5
- **Styling:** Tailwind CSS 3.4 + CSS variables (dark-first design)
- **Components:** shadcn/ui primitives + custom finance components (GaugeMeter, PillBar, TimelineStrip)
- **Database:** PostgreSQL 16 + Prisma 5
- **Auth:** Auth.js v5 (credentials provider, single user)
- **Charts:** Recharts 2 + custom SVG
- **AI:** Local Ollama via `OLLAMA_BASE_URL` — no cloud required
- **FX rates:** frankfurter.app (ECB feed), auto-synced daily

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
#   POSTGRES_PASSWORD, NEXTAUTH_SECRET, NEXTAUTH_URL
#   SEED_USER_EMAIL, SEED_USER_PASSWORD, FX_SYNC_SECRET
#   OLLAMA_BASE_URL (e.g. http://homelab.local:11434)

# 3. Start
docker-compose up -d

# 4. Open http://localhost:3000 and log in with your SEED_USER_EMAIL / SEED_USER_PASSWORD
```

The `web` container runs `prisma migrate deploy && prisma db seed` on first start, seeding categories, exchange rates, and sample recurring rules.

---

## Ollama prerequisite

Pocketbook connects to an existing Ollama instance — it does **not** run Ollama itself. Point `OLLAMA_BASE_URL` at your Ollama container or machine:

```
OLLAMA_BASE_URL=http://homelab.local:11434
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

Data flow: server components fetch from Prisma directly → pass props → Server Actions mutate → revalidatePath refreshes. No client-side data fetching for initial renders.

---

## Development

```bash
pnpm install
cp .env.example .env.local   # fill in DATABASE_URL at minimum
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).
