import { startOfMonth, endOfMonth } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { TransactionsView, type SerializedTx } from '@/components/transactions/TransactionsView';
import type { SerializedCategory, SerializedRecurringRule } from '@/components/forms/TransactionForm';

export default async function TransactionsPage() {
  const now = new Date();
  const from = startOfMonth(now);
  const to = endOfMonth(now);

  const [rawTxs, categories, recurringRules, exchangeRates] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: from, lte: to } },
      include: { category: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.recurringRule.findMany({
      where: { archived: false },
      orderBy: { name: 'asc' },
    }),
    prisma.exchangeRate.findMany(),
  ]);

  // Serialise Prisma Decimal + Date to plain values for client components
  const transactions: SerializedTx[] = rawTxs.map((tx: (typeof rawTxs)[number]) => ({
    id: tx.id,
    date: tx.date.toISOString().slice(0, 10),
    description: tx.description,
    amount: Number(tx.amount),
    currency: tx.currency,
    type: tx.type,
    categoryId: tx.categoryId,
    category: {
      id: tx.category.id,
      name: tx.category.name,
      color: tx.category.color,
      kind: tx.category.kind,
    },
    recurringRuleId: tx.recurringRuleId,
  }));

  const serialisedCategories: SerializedCategory[] = categories.map((c: (typeof categories)[number]) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    kind: c.kind,
  }));

  const serialisedRules: SerializedRecurringRule[] = recurringRules.map((r: (typeof recurringRules)[number]) => ({
    id: r.id,
    name: r.name,
    cycle: r.cycle,
    kind: r.kind,
  }));

  // Build a simple rate map: 1 foreign = X HUF
  const rateMap = { USD: 358.4, EUR: 396.1, GBP: 452.0 }; // fallback
  for (const row of exchangeRates) {
    if (row.toCurrency === 'HUF') {
      rateMap[row.fromCurrency as keyof typeof rateMap] = Number(row.rate);
    }
  }

  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <TransactionsView
      transactions={transactions}
      categories={serialisedCategories}
      recurringRules={serialisedRules}
      fxRates={rateMap}
      monthLabel={monthLabel}
    />
  );
}
