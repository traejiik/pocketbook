# Session 4 — Dashboard, Recurring, Renewals, Categories

Read `00-overview.md` first if you haven't — including the **Learning mode** section. Pause and teach when you reach a concept marked for this session in the concepts table (React `cache()`, database transactions for atomic installment increments).

This session lights up the four data-heavy read screens. The Dashboard is the most complex — 8 cards in a 12-col grid with the GaugeMeter SVG. Recurring has the installment progress UI. Renewals has the horizontal timeline strip. Categories is the simplest — grouped CRUD.

**By end of session:** every screen except Insights and Settings is fully rendered with real DB data. The Renewals unread-dot count in the sidebar is live.

Source mockups:
- `design-reference/mockups/source/screens/dashboard.jsx`
- `design-reference/mockups/source/screens/recurring.jsx`
- `design-reference/mockups/source/screens/renewals.jsx`
- `design-reference/mockups/source/screens/categories.jsx`

---

## Step 1 — Server-side aggregation helpers

Add `lib/aggregations.ts`:

```ts
export async function getCurrentMonthKpis(): Promise<{
  income: number;   // in anchor currency, summed
  expense: number;  // positive number
  savings: number;  // positive number
  net: number;      // income - expense - savings
  incomeUsedPct: number; // (expense + savings) / income * 100
}>;

export async function getExpensesByCategory(): Promise<{
  categoryId: string;
  name: string;
  color: string;
  value: number;  // in anchor currency
}[]>; // sorted descending

export async function getUpcomingRenewals(daysAhead: number): Promise<{
  rule: RecurringRule & { category: Category };
  daysAway: number;
  hufEquivalent: number;
}[]>;

export async function getRecentTransactions(limit: number): Promise<...>;

export async function getMonthlyTrend(months: number): Promise<{ month: string; net: number }[]>;
```

Each helper uses `lib/fx.ts` to convert to the anchor currency. Cache within a request via React `cache()`.

Update `Sidebar` (from session 1): replace the hardcoded `6` badge with `(await getUpcomingRenewals(30)).length`. The badge is rendered server-side in `AppShell` and passed down.

---

## Step 2 — Per-screen custom components

These don't exist in shadcn and aren't shared enough to live in `components/ui/`:

### `components/finance/KpiBig.tsx`

Port from `dashboard.jsx` lines 296–329. Card: `rounded-2xl p-5 bg-card border border-border` with `min-h-[170px]`. Value text: 44px tabular, coloured by `tone`. Currency suffix: `Ft` (or per-currency) in `text-muted-foreground` at 16px to the right of the number. Delta pill below: mono `text-[10.5px]` inside a `bg-secondary` chip with an up/down arrow, then the footnote text.

If the value is ≥ 100,000, abbreviate to `Xk` (e.g. 233,020 → `233k`). The mockup uses `text-[44px]` — apply exactly.

### `components/finance/PillBar.tsx`

Port from `dashboard.jsx` lines 332–344. Variants: `solid` (filled with `color`), `mid` (color at 45% opacity), `soft` (hatched diagonal stripes with `--muted-foreground` on `--secondary`). Renders a vertical pill (full width of parent, height from the parent's inline `height` style).

### `components/finance/GaugeMeter.tsx`

Port from `dashboard.jsx` lines 348–383. SVG `viewBox="0 0 280 200"`, half-circle path from `(40,150)` to `(240,150)` arcing through the top. Filled portion uses a horizontal gradient from `--income` to a darker shade. Remaining portion uses a 45° diagonal hatch pattern. Big `{percent}%` in the centre at 44px Geist 600. Subtle `of income used` label below.

The SVG uses `strokeDasharray` to clip the filled arc — keep the math (`arcLen = π × r`).

### `components/finance/RecurringRuleCard.tsx`

Port from `recurring.jsx` lines 70–117. A `Card` with: icon in a tinted square (category colour at ~12% opacity), name + cycle + category label, amount with HUF equivalent, next-due date and days-away mono badge (amber if ≤ 7 days), and — when `installment` is present — the amber installment block with a progress bar and `X/Y` counter + `Ends {date} · N payments left`.

### `components/finance/TimelineStrip.tsx`

Port from `renewals.jsx` lines 42–64. A `Card` containing a horizontal timeline strip. Each event is positioned absolutely with `left: ${pct}%` where `pct = (daysAway / horizon) * 100`. Each marker is a tiny vertical line + a coloured dot (from `category.color`) with a `daysAway` mono label and a hover tooltip showing `{name} · {hufAmount} Ft`. "Today" anchor on the left, `+{horizon}d` on the right.

---

## Step 3 — Dashboard page

`app/(app)/dashboard/page.tsx` is a server component. Fetch via the helpers in step 1.

Layout (port `dashboard.jsx`):

- Page header: `Dashboard` h1 + "Your finances at a glance." subtitle. Right side: `Add transaction` primary pill button + `Import data` outlined pill.
- **Row 1** — 4-column grid of `KpiBig`: Income (income tone, delta arrow), Expenses (expense tone), Net (income tone), Savings (savings tone with "On auto" badge instead of a percentage).
- **Row 2** — 12-col grid:
  - **Expenses by category** card, `col-span-7`. Header has Segmented toggle (Categories / Net trend). The Categories view renders 7 `PillBar`s with the top category showing a `Math.round(b.value/total*100)%` tooltip above it. Below the bars: a footer strip with the top category as a coloured dot + name + total, and a "7 of N categories · See all →" link.
  - The Net trend view shows 6 `PillBar`s of `trend6mo` data with the latest month highlighted.
  - **Upcoming renewals** card, `col-span-5`. List of 6 renewal rows with a date tile, name + category dot, days-away, and a right-aligned amount (with HUF equivalent if non-HUF). Top right: "View all →" button.
- **Row 3** — 12-col grid:
  - **Recent activity** card, `col-span-5`. Last 4 transactions, each with a circular avatar showing the category initials in the category colour at 20% bg.
  - **Income used** card, `col-span-4`. Header + month chip + `GaugeMeter` centred + a legend strip (Used dot vs Remaining hatch swatch).
  - **Right stack** `col-span-3`:
    - **Reminder · Next renewal** small card — primary-coloured rule name, date + days + amount, View renewals primary pill button.
    - **AI Insights** dark-gradient feature card with the radial glow + concentric ellipses SVG decoration, a `~Xs` last-generation time number, "Last · {date}" label, two circular icon buttons (sparkles → generate, arrow-right → open).

The CSS is dense — port verbatim. Don't try to "clean it up."

The Generate Insights button (sparkles) navigates to `/insights?generate=1` — the Insights page reads the query param and kicks off generation on mount (session 5 wires this).

---

## Step 4 — Recurring screen

`app/(app)/recurring/page.tsx` server-fetches all rules with their categories, plus computed totals.

Layout (port `recurring.jsx`):

- Header: `Recurring rules` h1 + "Subscriptions, installments, and recurring income." subtitle. Right side: `New rule` primary button.
- Summary strip (4 KpiCards):
  - Monthly outflow (expense tone)
  - Annual outflow (expense tone)
  - Annualised total (`monthlyTotal × 12 + annualTotal`, neutral tone)
  - Monthly income (income tone)
- Segmented control: `Expenses · N` / `Income · N`. Right side: a passive "Sort by next due" label with a filter icon.
- 3-column grid of `RecurringRuleCard`s, sorted by `nextDue` ascending.

New rule + edit rule: shadcn `Sheet` with a similar form to TransactionForm but for `RecurringRule`. Fields: name, amount + currency, cycle, next due, kind, category, installment plan toggle (when toggled on, show `paid`, `total`, `endsOn` fields).

Add `server-actions/recurring.ts` with `upsertRecurringRule` and `archiveRecurringRule`. On installment completion (when `installmentPaid === installmentTotal`), set `archived = true` and skip in upcoming-renewals queries.

---

## Step 5 — Renewals screen

`app/(app)/renewals/page.tsx` server-fetches expenses-only recurring rules with `nextDue` within the selected horizon.

Layout (port `renewals.jsx`):

- Header: `Upcoming renewals` h1 + "{N} renewals · {total} due in next {horizon} days" subtitle. Right side: two Segmented controls — horizon (`30d` / `60d` / `90d`) and grouping (`By week` / `By month`).
- `TimelineStrip` card.
- Grouped list of `Card`s, one per week or month. Each group header: name + count + right-aligned subtotal. Body: divided rows with date tile, category dot + name + cycle + category label (+ installment progress when present), amount, HUF equivalent.

The grouping logic is in `renewals.jsx` lines 20–27 — port verbatim.

Make horizon and grouping client state (`useState`), but compute the data server-side via a server action called from a client wrapper. Simpler alternative: fetch all 90 days server-side once, filter/group on the client (the dataset is small).

---

## Step 6 — Categories screen

`app/(app)/categories/page.tsx` fetches all categories with transaction counts and HUF totals.

Layout (port `categories.jsx`):

- Header: `Categories` h1 + "{N} categories · 3 kinds" subtitle. Right side: `New category` primary button.
- Three grouped sections — `Income`, `Expense`, `Savings`. Each has a tone-dot header + count + horizontal divider.
- Each section is a `Card` with a divided list. Row layout: colour swatch + name + hex code + transaction count + HUF total + hover actions (edit / delete).
- Each section has a footer row "Add {kind} category" — opens a small Dialog with name + colour picker.

Server actions in `server-actions/categories.ts`:

```ts
export async function upsertCategory(input: { id?: string; name: string; color: string; kind: CategoryKind })
export async function deleteCategory(id: string)
```

Deleting a category that has transactions: prompt with a Dialog asking the user to pick a replacement category, then `UPDATE transactions SET categoryId = ?` in a transaction.

Colour picker: a small palette of curated hex values plus a free-text hex input. Don't ship a full HSL picker.

---

## Step 7 — Polish

- Verify the sidebar's `Renewals` badge now shows the real count from `getUpcomingRenewals(30).length`.
- Verify the Add Transaction Sheet's "Link to recurring rule" select shows only rules with matching `kind`.
- The Add Transaction `recurringRuleId` link wires properly: when a transaction is created and linked to an installment rule, increment `installmentPaid` by 1 in the same DB transaction.
- Skeletons on every async surface that could take >150ms (the Dashboard especially benefits from a coordinated skeleton state — render the card shapes with skeleton fills inside).

---

## Session checklist

- [ ] Dashboard renders all 8 cards in the correct 12-col layout with real data
- [ ] `KpiBig` values are formatted exactly per the mockup (`233k` style abbreviation, tabular nums, tone-coloured)
- [ ] `GaugeMeter` shows the income-used percentage with the filled arc and hatched remainder
- [ ] PillBar chart and the Net trend view both render correctly via the Segmented toggle
- [ ] AI Insights dark gradient card displays the last-generation time and links to `/insights?generate=1`
- [ ] Recurring screen lists all rules with proper installment progress UI
- [ ] Creating a new recurring rule writes to DB and the card appears in the right tab
- [ ] Renewals screen's TimelineStrip positions each renewal proportionally on the horizon
- [ ] Renewals horizon + grouping toggles update the list and totals
- [ ] Categories screen groups by `kind` and shows transaction counts + totals
- [ ] Creating, editing, and deleting categories works (with the replacement-category prompt on delete-with-transactions)
- [ ] Sidebar Renewals badge shows the live count from the database
- [ ] Submitting an Add Transaction linked to an installment rule increments `installmentPaid` atomically
- [ ] No console errors or hydration warnings
- [ ] Commit: `feat: dashboard, recurring, renewals, categories`

Run `graphify update .` after completing this session if the graph is configured.

---

**Next session:** `05-session-insights-settings-polish.md` — Ollama streaming, Settings (FX + auth + LLM), Frankfurter sync, CSV importer, README.
