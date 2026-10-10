import { SessionProvider } from 'next-auth/react';
import { AppShell } from '@/components/shell/AppShell';
import { TransactionSheetProvider } from '@/contexts/sheet-context';
import { NotificationsProvider } from '@/contexts/notifications-context';
import { getPotBalances, getUpcomingRenewals } from '@/lib/aggregations';
import { prisma } from '@/lib/prisma';
import type { SerializedCategory, SerializedRecurringRule } from '@/components/forms/TransactionForm';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [renewals, renewalsSoon, categories, recurringRules, exchangeRates, pots] = await Promise.all([
    getUpcomingRenewals(30),
    getUpcomingRenewals(7),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.recurringRule.findMany({ where: { archived: false }, orderBy: { name: 'asc' } }),
    prisma.exchangeRate.findMany(),
    getPotBalances(),
  ]);
  const potBalances = Object.fromEntries(pots.map((p) => [p.id, p.balance]));

  const serialisedCategories: SerializedCategory[] = categories.map(c => ({
    id: c.id, name: c.name, color: c.color, kind: c.kind, includeInBalance: c.includeInBalance,
  }));

  const serialisedRules: SerializedRecurringRule[] = recurringRules.map(r => ({
    id: r.id, name: r.name, cycle: r.cycle, kind: r.kind,
    nextDue: r.nextDue.toISOString().slice(0, 10),
    amount: Number(r.amount),
    currency: r.currency as SerializedRecurringRule['currency'],
    categoryId: r.categoryId,
  }));

  const fxRates = { USD: 358.4, EUR: 396.1, GBP: 452.0 };
  for (const row of exchangeRates) {
    if (row.toCurrency === 'HUF') fxRates[row.fromCurrency as keyof typeof fxRates] = Number(row.rate);
  }

  return (
    <SessionProvider>
      <NotificationsProvider renewalsCount={renewalsSoon.length}>
        <TransactionSheetProvider potBalances={potBalances}>
          <AppShell
            upcomingRenewalsCount={renewals.length}
            categories={serialisedCategories}
            recurringRules={serialisedRules}
            fxRates={fxRates}
            displayName={process.env.PB_USER_DISPLAY_NAME ?? 'User'}
          >
            {children}
          </AppShell>
        </TransactionSheetProvider>
      </NotificationsProvider>
    </SessionProvider>
  );
}
