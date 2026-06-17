'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { Repeat } from 'lucide-react';
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

  // On mobile the document scrolls; on desktop <main> scrolls. Reset both.
  useEffect(() => {
    window.scrollTo(0, 0);
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
            Repeat,
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
      <div className="w-full flex flex-col md:h-dvh md:flex-row md:overflow-hidden bg-background text-foreground">
        <TabletRail
          upcomingRenewalsCount={upcomingRenewalsCount}
          onQuickAdd={openNew}
          className="hidden md:flex min-[1025px]:!hidden"
        />
        <Sidebar
          upcomingRenewalsCount={upcomingRenewalsCount}
          onQuickAdd={openNew}
          className="hidden min-[1025px]:flex"
        />
        <div className="flex flex-col min-w-0 bg-background md:flex-1 md:min-h-0 md:overflow-hidden">
          <Header displayName={displayName} className="hidden md:flex" />
          <MobileTopBar displayName={displayName} />
          <main
            id="main-content"
            className="pt-2 pb-24 overflow-x-hidden md:pb-0 md:flex-1 md:min-h-0 md:overflow-y-auto md:overscroll-contain"
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
