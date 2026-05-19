import { SessionProvider } from 'next-auth/react';
import { AppShell } from '@/components/shell/AppShell';
import { TransactionSheetProvider } from '@/contexts/sheet-context';
import { getUpcomingRenewals } from '@/lib/aggregations';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const renewals = await getUpcomingRenewals(30);
  const upcomingRenewalsCount = renewals.length;

  return (
    <SessionProvider>
      <TransactionSheetProvider>
        <AppShell upcomingRenewalsCount={upcomingRenewalsCount}>{children}</AppShell>
      </TransactionSheetProvider>
    </SessionProvider>
  );
}
