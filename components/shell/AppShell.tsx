'use client';

import { useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useTransactionSheet } from '@/contexts/sheet-context';
import { useGlobalKeys } from '@/hooks/use-global-keys';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { openNew } = useTransactionSheet();

  // Stable handler map — recreated only when openNew reference changes
  const keyHandlers = useMemo(() => ({ n: openNew, N: openNew }), [openNew]);
  useGlobalKeys(keyHandlers);

  // TODO session 4: derive from DB — recurring expenses with nextDue within 30 days
  const upcomingRenewalsCount = 6;

  return (
    <div className="w-full h-screen bg-background text-foreground flex overflow-hidden p-3 gap-3">
      <Sidebar upcomingRenewalsCount={upcomingRenewalsCount} />
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        <Header upcomingRenewalsCount={upcomingRenewalsCount} />
        <main className="flex-1 overflow-auto relative">{children}</main>
      </div>
    </div>
  );
}
