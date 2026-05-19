import { SessionProvider } from 'next-auth/react';
import { AppShell } from '@/components/shell/AppShell';
import { TransactionSheetProvider } from '@/contexts/sheet-context';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TransactionSheetProvider>
        <AppShell>{children}</AppShell>
      </TransactionSheetProvider>
    </SessionProvider>
  );
}
