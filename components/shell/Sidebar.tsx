'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoMark } from '@/components/shell/LogoMark';
import { NAV, navIdForPath } from '@/components/shell/nav';

interface SidebarProps {
  upcomingRenewalsCount?: number;
  onQuickAdd?: () => void;
  className?: string;
}

// Desktop sidebar (lg+): 224px, two-tone (card tone) with hairline right edge.
export function Sidebar({ upcomingRenewalsCount = 0, onQuickAdd, className }: SidebarProps) {
  const pathname = usePathname();
  const activeId = navIdForPath(pathname);

  return (
    <aside
      className={cn(
        'w-[224px] shrink-0 flex flex-col pt-5 pb-4 px-3 bg-card border-r border-border/55',
        className,
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2.5">
        <LogoMark size={24} className="text-primary h-[22px] w-[22px]" />
        <span className="text-[15px] font-semibold tracking-tight">Pocketbook</span>
      </div>

      {/* Nav */}
      <nav className="mt-8 flex-1 flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = activeId === item.id;
          const Icon = item.icon;
          const showBadge = item.id === 'renewals' && upcomingRenewalsCount > 0;
          return (
            <Link
              key={item.id}
              href={`/${item.id}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group w-full flex items-center gap-2.5 px-3 py-[8.5px] rounded-[10px] text-[13px] transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                active
                  ? 'bg-primary/15 text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/70',
              )}
            >
              <span
                className={cn(
                  'w-[18px] h-[18px] flex items-center justify-center shrink-0',
                  active && 'text-primary',
                )}
              >
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
      </nav>

      {/* Add transaction — shell-owned primary action with N hint */}
      <button
        type="button"
        onClick={onQuickAdd}
        aria-label="Add transaction (N)"
        className="w-full flex items-center justify-center gap-2 h-9 rounded-[10px] bg-primary text-primary-foreground text-[12.5px] font-medium hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add transaction</span>
        <span className="mono text-[10px] rounded px-[5px] py-px ml-0.5 border border-primary-foreground/35 opacity-85">
          N
        </span>
      </button>
    </aside>
  );
}
