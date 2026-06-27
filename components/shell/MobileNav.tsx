'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  List,
  Repeat,
  Plus,
  Menu,
  CalendarDays,
  Tag,
  Sparkles,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFabContext } from '@/contexts/fab-context';
import { navIdForPath } from '@/components/shell/nav';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutGrid },
  { id: 'transactions', label: 'Transactions', icon: List },
];
const TABS_RIGHT: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'recurring', label: 'Recurring', icon: Repeat },
];
const MORE: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'renewals', label: 'Renewals', icon: CalendarDays },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'insights', label: 'AI Insights', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface MobileNavProps {
  onAdd: () => void;
  upcomingRenewalsCount?: number;
}

export function MobileNav({ onAdd, upcomingRenewalsCount = 0 }: MobileNavProps) {
  const pathname = usePathname();
  const activeId = navIdForPath(pathname);
  const { fabAction } = useFabContext();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = MORE.some((m) => m.id === activeId);

  function Tab({ id, label, icon: Icon }: { id: string; label: string; icon: LucideIcon }) {
    const active = activeId === id;
    return (
      <Link
        href={`/${id}`}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex-1 flex flex-col items-center justify-center gap-1 h-full text-[10px] font-medium transition-colors focus-visible:outline-none',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <Icon className="w-5 h-5" />
        {label}
      </Link>
    );
  }

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border/55 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <div className="flex items-stretch h-16">
          {TABS.map((t) => (
            <Tab key={t.id} {...t} />
          ))}

          {/* Centre FAB */}
          <div className="relative flex-1">
            <button
              type="button"
              onClick={fabAction ?? onAdd}
              aria-label="Add transaction"
              className="absolute left-1/2 -translate-x-1/2 -top-7 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition active:scale-95"
              style={{ boxShadow: '0 8px 22px hsl(var(--primary) / 0.45)' }}
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>

          {TABS_RIGHT.map((t) => (
            <Tab key={t.id} {...t} />
          ))}

          {/* More */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            className={cn(
              'relative flex-1 flex flex-col items-center justify-center gap-1 h-full text-[10px] font-medium transition-colors',
              moreActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Menu className="w-5 h-5" />
            More
            {upcomingRenewalsCount > 0 && (
              <span className="absolute top-2.5 right-[calc(50%-16px)] w-1.5 h-1.5 rounded-full bg-warning" />
            )}
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-[402px] gap-0 p-0 !rounded-t-[24px] pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="h-1.5 w-10 rounded-full bg-border" />
          </div>
          <SheetHeader className="px-5 pt-2 pb-3.5 border-b border-border/60">
            <SheetTitle>More</SheetTitle>
            <p className="text-[12px] text-muted-foreground">Other Pocketbook screens.</p>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-5 py-4">
            {MORE.map((item) => {
              const Icon = item.icon;
              const active = activeId === item.id;
              const showBadge = item.id === 'renewals' && upcomingRenewalsCount > 0;
              return (
                <Link
                  key={item.id}
                  href={`/${item.id}`}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-[12px] border bg-card text-[13px] transition-colors',
                    active
                      ? 'border-primary/40 text-foreground'
                      : 'border-border/55 text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className={cn('shrink-0', active && 'text-primary')}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span className="renewal-badge mono text-[10.5px] tabular rounded-full px-[7px] py-[2.5px] leading-none">
                      {upcomingRenewalsCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
