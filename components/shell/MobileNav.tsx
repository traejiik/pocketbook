'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, List, Repeat2, CalendarDays, Settings, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const LEFT_NAV = [
  { id: 'dashboard',    label: 'Home',      icon: LayoutDashboard },
  { id: 'transactions', label: 'Txns',      icon: List },
  { id: 'recurring',    label: 'Recurring', icon: Repeat2 },
];
const RIGHT_NAV = [
  { id: 'renewals', label: 'Renewals', icon: CalendarDays },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface MobileNavProps {
  upcomingRenewalsCount?: number;
  onQuickAdd?: () => void;
}

export function MobileNav({ upcomingRenewalsCount = 0, onQuickAdd }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border">
      <div className="flex items-center h-16">
        {LEFT_NAV.map(item => {
          const active = pathname.startsWith(`/${item.id}`);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={`/${item.id}`}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 h-full text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}

        {/* Centre FAB */}
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={onQuickAdd}
            aria-label="Add transaction"
            className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg -mt-5 transition hover:opacity-90 active:scale-95"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {RIGHT_NAV.map(item => {
          const active = pathname.startsWith(`/${item.id}`);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={`/${item.id}`}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 h-full text-[10px] font-medium relative transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
              {item.id === 'renewals' && upcomingRenewalsCount > 0 && (
                <>
                  <span className="absolute top-2.5 right-[calc(50%-12px)] w-2 h-2 rounded-full bg-warning border border-card" aria-hidden="true" />
                  <span className="sr-only">{upcomingRenewalsCount} due</span>
                </>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
