'use client';

import { useMemo, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { useTransactionSheet } from '@/contexts/sheet-context';
import { useGlobalKeys } from '@/hooks/use-global-keys';
import { TransactionForm, type SerializedCategory, type SerializedRecurringRule } from '@/components/forms/TransactionForm';
import { upsertTransaction, type TxInput } from '@/server-actions/transactions';

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
    <div className="w-full h-dvh bg-background text-foreground flex flex-col sm:flex-row overflow-hidden sm:p-3 sm:gap-3">
      <Sidebar upcomingRenewalsCount={upcomingRenewalsCount} onQuickAdd={openNew} />
      <div className="flex-1 flex flex-col sm:gap-3 overflow-hidden min-h-0">
        <Header upcomingRenewalsCount={upcomingRenewalsCount} displayName={displayName} />
        <main className="flex-1 overflow-auto relative pb-16 sm:pb-0">{children}</main>
      </div>
      <MobileNav upcomingRenewalsCount={upcomingRenewalsCount} onQuickAdd={openNew} />
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
  );
}
