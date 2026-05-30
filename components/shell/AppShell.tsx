'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { useTransactionSheet } from '@/contexts/sheet-context';
import { FabProvider, useFabContext } from '@/contexts/fab-context';
import { useGlobalKeys } from '@/hooks/use-global-keys';
import { TransactionForm, type SerializedCategory, type SerializedRecurringRule } from '@/components/forms/TransactionForm';
import { upsertTransaction, type TxInput } from '@/server-actions/transactions';
import { syncDueRecurringRulesAction } from '@/server-actions/recurring-sync';

function FabButton({ defaultAction, pathname }: { defaultAction: () => void; pathname: string }) {
  const { fabAction } = useFabContext();
  if (pathname.startsWith('/settings')) return null;
  return (
    <button
      onClick={fabAction ?? defaultAction}
      aria-label="Add"
      className="sm:hidden fixed bottom-21 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl transition hover:opacity-90 active:scale-95"
    >
      <Plus className="w-6 h-6" />
    </button>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  upcomingRenewalsCount?: number;
  categories: SerializedCategory[];
  recurringRules: SerializedRecurringRule[];
  fxRates: { USD: number; EUR: number; GBP: number };
  displayName?: string;
}

export function AppShell({ children, upcomingRenewalsCount = 0, categories, recurringRules, fxRates, displayName }: AppShellProps) {
  const { openNew, close } = useTransactionSheet();
  const pathname = usePathname();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [, startTransition] = useTransition();

  const keyHandlers = useMemo(() => ({ n: openNew, N: openNew }), [openNew]);
  useGlobalKeys(keyHandlers);

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        const result = await syncDueRecurringRulesAction();
        if (!cancelled && result.transactionsCreated > 0) {
          toast.success(`Logged ${result.transactionsCreated} recurring transaction${result.transactionsCreated === 1 ? '' : 's'}.`);
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
        close();
      } catch {
        toast.error('Failed to save transaction');
      }
    });
  }

  // TransactionsView mounts its own TransactionForm with optimistic updates;
  // the global one covers every other page.
  const showGlobalSheet = !pathname.startsWith('/transactions');

  return (
    <FabProvider>
      <div className="w-full h-dvh bg-background text-foreground flex flex-col sm:flex-row overflow-hidden sm:p-3 sm:gap-3">
        <Sidebar upcomingRenewalsCount={upcomingRenewalsCount} onQuickAdd={openNew} />
        <div className="flex-1 flex flex-col sm:gap-3 overflow-hidden min-h-0">
          <Header upcomingRenewalsCount={upcomingRenewalsCount} displayName={displayName} />
          <main id="main-content" className="flex-1 overflow-auto relative pb-16 sm:pb-0">{children}</main>
        </div>
        <MobileNav />
        <FabButton defaultAction={openNew} pathname={pathname} />
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
