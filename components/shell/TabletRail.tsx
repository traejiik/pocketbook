'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoMark } from '@/components/shell/LogoMark';
import { NAV, navIdForPath } from '@/components/shell/nav';

const STORAGE_KEY = 'pb-rail-collapsed';

interface TabletRailProps {
  upcomingRenewalsCount?: number;
  onQuickAdd?: () => void;
  className?: string;
}

// Tablet icon rail (md–lg): collapsible 76px ⇄ 232px, default collapsed.
export function TabletRail({ upcomingRenewalsCount = 0, onQuickAdd, className }: TabletRailProps) {
  const pathname = usePathname();
  const activeId = navIdForPath(pathname);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === '1');
    } catch {
      // localStorage unavailable — keep default collapsed.
    }
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'shrink-0 flex-col pt-5 pb-4 px-3 bg-card border-r border-border/55 transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-[232px]',
        className,
      )}
    >
      {/* Brand */}
      <div className={cn('flex items-center gap-2.5 px-1.5', collapsed && 'justify-center px-0')}>
        <LogoMark size={24} className="text-primary h-[22px] w-[22px]" />
        {!collapsed && <span className="text-[15px] font-semibold tracking-tight">Pocketbook</span>}
      </div>

      {/* Nav */}
      <nav className="mt-8 flex-1 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = activeId === item.id;
          const Icon = item.icon;
          const showBadge = item.id === 'renewals' && upcomingRenewalsCount > 0;
          return (
            <Link
              key={item.id}
              href={`/${item.id}`}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
              className={cn(
                'group relative flex items-center rounded-[12px] text-[13px] transition-colors min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                collapsed ? 'justify-center' : 'gap-2.5 px-3',
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
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {showBadge &&
                (collapsed ? (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-warning" />
                ) : (
                  <span className="renewal-badge mono text-[10.5px] tabular rounded-full px-[7px] py-[2.5px] leading-none">
                    {upcomingRenewalsCount}
                  </span>
                ))}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cn(
          'flex items-center gap-2 h-9 rounded-[10px] text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors mb-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          collapsed ? 'justify-center' : 'px-3',
        )}
      >
        <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        {!collapsed && <span>Collapse</span>}
      </button>

      {/* Add transaction */}
      <button
        type="button"
        onClick={onQuickAdd}
        aria-label="Add transaction (N)"
        className={cn(
          'flex items-center justify-center gap-2 h-11 rounded-[10px] bg-primary text-primary-foreground text-[12.5px] font-medium hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          collapsed && 'w-11 mx-auto px-0',
        )}
      >
        <Plus className="w-4 h-4 shrink-0" />
        {!collapsed && <span>Add transaction</span>}
      </button>
    </aside>
  );
}
