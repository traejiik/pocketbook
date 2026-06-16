'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { Repeat2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TabletRail } from './TabletRail';
import { Header } from './Header';
import { MobileTopBar } from './MobileTopBar';
import { MobileNav } from './MobileNav';
import { useTransactionSheet } from '@/contexts/sheet-context';
import { FabProvider } from '@/contexts/fab-context';
import { notify } from '@/lib/ui-notify';
import { useGlobalKeys } from '@/hooks/use-global-keys';
import { TransactionForm, type SerializedCategory, type SerializedRecurringRule } from '@/components/forms/TransactionForm';
import { upsertTransaction, type TxInput } from '@/server-actions/transactions';
import { syncDueRecurringRulesAction } from '@/server-actions/recurring-sync';

interface AppShellProps {
  children: React.ReactNode;
  upcomingRenewalsCount?: number;
  categories: SerializedCategory[];
  recurringRules: SerializedRecurringRule[];
  fxRates: { USD: number; EUR: number; GBP: number };
  displayName?: string;
}

export function AppShell({
  children,
  upcomingRenewalsCount = 0,
  categories,
  recurringRules,
  fxRates,
  displayName,
}: AppShellProps) {
  const { openNew, close } = useTransactionSheet();
  const pathname = usePathname();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [, startTransition] = useTransition();

  const keyHandlers = useMemo(() => ({ n: openNew, N: openNew }), [openNew]);
  useGlobalKeys(keyHandlers);

  // The scrolling region is <main>, not the window, so reset it on navigation.
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        const result = await syncDueRecurringRulesAction();
        if (!cancelled && result.transactionsCreated > 0) {
          notify.success(
            `Logged ${result.transactionsCreated} recurring transaction${result.transactionsCreated === 1 ? '' : 's'}.`,
            Repeat2,
          );
        }
      } catch {
        // Cron also runs recurring sync; app-open sync is a quiet safety net.
      }
    });

    return () => {
      cancelled = true;
    };
  }, [startTransition]);

  function handleFormSubmit(input: TxInput, _category: SerializedCategory) {
    startTransition(async () => {
      try {
        await upsertTransaction(input);
        notify.success(`Added ${input.description}`);
        close();
      } catch {
        notify.error('Failed to save transaction');
      }
    });
  }

  // TransactionsView mounts its own TransactionForm with optimistic updates;
  // the global one covers every other page.
  const showGlobalSheet = !pathname.startsWith('/transactions');

  return (
    <FabProvider>
      <div className="w-full h-dvh flex flex-col md:flex-row overflow-hidden bg-background text-foreground">
        <TabletRail
          upcomingRenewalsCount={upcomingRenewalsCount}
          onQuickAdd={openNew}
          className="hidden md:flex lg:hidden"
        />
        <Sidebar
          upcomingRenewalsCount={upcomingRenewalsCount}
          onQuickAdd={openNew}
          className="hidden lg:flex"
        />
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-background">
          <Header displayName={displayName} className="hidden md:flex" />
          <MobileTopBar displayName={displayName} />
          <main
            id="main-content"
            className="flex-1 min-h-0 overflow-auto overscroll-contain pt-2 pb-24 md:pb-0"
          >
            {children}
          </main>
        </div>
        <MobileNav onAdd={openNew} upcomingRenewalsCount={upcomingRenewalsCount} />
        {showGlobalSheet && (
          <TransactionForm
            categories={categories}
            recurringRules={recurringRules}
            fxRates={fxRates}
            onFormSubmit={handleFormSubmit}
            deleteConfirmOpen={deleteConfirmOpen}
            setDeleteConfirmOpen={setDeleteConfirmOpen}
          />
        )}
      </div>
    </FabProvider>
  );
}
