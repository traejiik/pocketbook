import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
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
