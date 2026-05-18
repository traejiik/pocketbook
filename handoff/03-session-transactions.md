# Session 3 — Transactions + Add/Edit Sheet

Read `00-overview.md` first if you haven't — including the **Learning mode** section. Pause and teach when you reach a concept marked for this session in the concepts table (Server Actions, `useOptimistic`, react-hook-form + zod).

This session delivers the highest-traffic surface: the Transactions screen and the Add/Edit drawer. It's the form Tida will hit dozens of times per week, so it has to feel fast.

**By end of session:** the Transactions screen lists, filters, and searches; clicking any row opens the Sheet pre-filled to edit; `N` opens a blank Sheet; `⌘↵` submits; `Esc` closes; new transactions appear instantly in the table via optimistic updates.

Source mockups:
- `design-reference/mockups/source/screens/transactions.jsx`
- `design-reference/mockups/source/screens/add-transaction.jsx`

---

## Step 1 — Server actions

Create `server-actions/transactions.ts`:

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

const txSchema = z.object({
  id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.enum(['HUF', 'USD', 'EUR', 'GBP']),
  type: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
  categoryId: z.string(),
  recurringRuleId: z.string().optional().nullable(),
});

export async function upsertTransaction(input: z.infer<typeof txSchema>) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorised');

  const parsed = txSchema.parse(input);
  // Store amount with sign matching type: income positive, expense/savings negative.
  const signedAmount = parsed.type === 'INCOME' ? parsed.amount : -parsed.amount;

  if (parsed.id) {
    await prisma.transaction.update({
      where: { id: parsed.id },
      data: { ...parsed, amount: signedAmount, date: new Date(parsed.date) },
    });
  } else {
    await prisma.transaction.create({
      data: { ...parsed, amount: signedAmount, date: new Date(parsed.date) },
    });
  }

  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  revalidatePath('/renewals');
}

export async function deleteTransaction(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorised');
  await prisma.transaction.delete({ where: { id } });
  revalidatePath('/transactions');
  revalidatePath('/dashboard');
}
```

---

## Step 2 — TransactionForm component

`components/forms/TransactionForm.tsx` is a client component. Port the JSX from `screens/add-transaction.jsx`. Use `react-hook-form` + `zod` for state and validation. Form fields, in the order shown in the mockup:

1. **Type** — a colour-coded segmented control (expense / income / savings). Each segment shows a dot in the matching finance colour (`bg-expense`/`bg-income`/`bg-savings`). The active segment's text colour also matches.
2. **Amount + currency** — `CurrencyInput` composite. Right-aligned amount input + currency select (HUF / USD / EUR). Below the amount: `≈ {fmtHUF(hufEquiv)} at 1 {cur} = {rate} HUF` when currency ≠ HUF. Conversion runs through `lib/fx.ts`.
3. **Date** — `<Input type="date">` with calendar icon.
4. **Description** — `<Input>` with placeholder `e.g. Spar weekly groceries`.
5. **Category** — wrap of pill buttons filtered to the selected `type` (only matching-kind categories show). Selected pill = `border-ring/60 bg-accent`. Unselected = `border-border text-muted-foreground`. The dot uses the category's hex colour inline.
6. **Link to recurring rule** — optional `<Select>`, options filtered to rules where `kind` matches `type` (income or expense).

Footer bar (sticky bottom of the Sheet): left side shows "Autosaved drafts" with a check icon when editing, "New entry" when creating. Right side: ghost Cancel + primary Save.

The Sheet itself uses shadcn's `Sheet` with `side="right"` and `className="w-[440px]"`. The header has the title and the `⌘↵ to save` hint.

---

## Step 3 — Transactions page

`app/(app)/transactions/page.tsx` is a server component. Fetch all transactions for the current calendar month, with `category` joined. Pass to a client component `<TransactionsView />` that handles filters, search, and the row-click → edit flow.

`components/transactions/TransactionsView.tsx`:

Top bar:
- Title + count subtitle
- "Export CSV" button (deferred — wire as `disabled` for now with a tooltip "Coming soon")
- "Add transaction" primary button

Filter bar (one Card):
- Search input (`<Input icon="search">`), debounced 200ms
- Segmented control: All / Income / Expense / Savings
- Category select (native `<select>` styled as in the mockup)
- Month picker — for v1, just a button labelled `May 2026` that opens a `Popover` with a small calendar (defer the actual navigation; just display current month). Add real month navigation if time permits.
- Right side: `Net: {signed HUF total}` for the filtered set.

Table:
- Grid columns: `100px 1fr 180px 120px 140px 40px` — Date, Description, Category, Amount, In HUF, chevron.
- Group rows by date with a sub-header showing the formatted date + day of week + item count.
- Each row is a `<button>` that calls `onEditTx(tx)` which opens the Sheet pre-filled.
- Empty state uses the `Empty` primitive: icon `Search`, title "No transactions match", body "Try adjusting filters or clearing the search", reset action.

Pagination block beneath the table — display only. Real pagination is deferred (v1 is one user, one month at a time; if any month exceeds 100 rows, revisit).

---

## Step 4 — Optimistic updates

Use `useOptimistic` in `TransactionsView`:

```ts
const [optimisticTxs, addOptimistic] = useOptimistic(transactions, (state, newTx: Transaction) =>
  [newTx, ...state].sort((a, b) => b.date.localeCompare(a.date)),
);
```

On submit:
1. Construct the optimistic row immediately
2. `addOptimistic(row)` — the table shows it
3. Call `upsertTransaction(input)`
4. On success, `revalidatePath` (already in the action) refreshes
5. On failure, show a Sonner error toast and the optimistic row falls away naturally on revalidation

Wrap the optimistic call in a `startTransition` per React 19 conventions.

---

## Step 5 — Keyboard shortcuts

Wire global hotkeys in `components/shell/AppShell.tsx` (or a hook `useGlobalKeys`):

- `N` (without modifiers, not inside an input) → opens a blank Add Transaction Sheet
- `⌘↵` / `Ctrl+Enter` while the Sheet is open and focused inside → submits the form
- `Esc` while the Sheet is open → closes (shadcn Sheet handles this natively; verify)

Use a context or a Zustand store to share `drawerOpen` / `editing` state between AppShell (which renders the Quick Add button) and individual screens. A small context provider beats a state library here.

---

## Step 6 — Edit / delete flow

Row click → opens the Sheet pre-filled. The Sheet title becomes "Edit transaction" and the subtitle shows `id · {tx.id}`.

A "more" menu (`DropdownMenu`) on hover gives access to Delete. Delete prompts via shadcn `AlertDialog` ("Delete this transaction? This cannot be undone.") and on confirm calls `deleteTransaction(id)` + closes the Sheet + Sonner success toast.

---

## Step 7 — Currency conversion display

When the amount currency ≠ anchor, the form shows the HUF equivalent live as the user types. Read the rate via the new `lib/fx.ts` `getRate('USD', 'HUF')` helper. Don't recompute on every keystroke if the math is heavy — debounce or memoise. Realistically it's a single multiplication, so don't over-engineer.

---

## Session checklist

- [ ] `/transactions` lists all current-month transactions grouped by date
- [ ] Search, type filter, and category filter all narrow the table correctly
- [ ] The Net total in the filter bar updates as filters change
- [ ] Clicking the Add Transaction button opens an empty Sheet
- [ ] `N` anywhere outside a form input opens the same Sheet
- [ ] Clicking any row opens the Sheet pre-filled
- [ ] `⌘↵` submits the form (verified on macOS, Ctrl+Enter on other OS)
- [ ] `Esc` closes the Sheet
- [ ] Submitted transactions appear in the table immediately (optimistic), then reconcile after revalidation
- [ ] Server-side validation rejects malformed input (test by tampering)
- [ ] Type changes filter the available categories correctly
- [ ] Currency ≠ HUF shows the HUF equivalent under the amount
- [ ] Delete from the row menu works and prompts for confirmation
- [ ] Empty state renders when filters match nothing
- [ ] Commit: `feat: transactions screen + add/edit sheet + optimistic writes`

Run `graphify update .` after completing this session if the graph is configured.

---

**Next session:** `04-session-dashboard-and-lists.md` — the Dashboard's eight-card grid (with GaugeMeter), the Recurring screen, the Renewals timeline, and the Categories CRUD.
