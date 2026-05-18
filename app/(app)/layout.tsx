import { SessionProvider } from 'next-auth/react';
import { AppShell } from '@/components/shell/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
