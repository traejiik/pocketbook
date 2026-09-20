'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, List, Repeat, Plus, Menu, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFabContext } from '@/contexts/fab-context';
import { NAV, navIdForPath } from '@/components/shell/nav';

// Three destinations sit in the dock; the rest live behind More. Dashboard
// reads "Home" here because the expanded label has to fit a 390px pill.
const PRIMARY: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutGrid },
  { id: 'transactions', label: 'Transactions', icon: List },
  { id: 'recurring', label: 'Recurring', icon: Repeat },
];

const MORE_IDS = new Set(['renewals', 'categories', 'insights', 'settings']);
const MORE = NAV.filter((item) => MORE_IDS.has(item.id));

const EXPANDED_SLOT =
  'relative flex shrink-0 items-center h-12 pl-[11px] pr-[13px] rounded-full bg-primary/15 text-primary text-[13px] font-semibold tracking-[-0.01em] whitespace-nowrap';
const REST_SLOT =
  'relative flex flex-1 items-center justify-center h-12 min-w-11 rounded-full text-muted-foreground';

interface MobileNavProps {
  onAdd: () => void;
  upcomingRenewalsCount?: number;
}

export function MobileNav({ onAdd, upcomingRenewalsCount = 0 }: MobileNavProps) {
  const pathname = usePathname();
  const activeId = navIdForPath(pathname);
  const { fabAction } = useFabContext();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close on navigation: the panel covers the page it just navigated to.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  // The More slot carries whichever deep page you are on, so a page behind the
  // hamburger is never nameless; while the panel is open it becomes Close.
  const deepItem = MORE.find((item) => item.id === activeId);
  const MoreIcon = moreOpen ? X : (deepItem?.icon ?? Menu);
  const moreLabel = moreOpen ? 'Close' : (deepItem?.label ?? 'More');
  const moreExpanded = moreOpen || Boolean(deepItem);

  return (
    <>
      {/* Content dissolves into the dock instead of ending in a hard cut. */}
      <div
        aria-hidden
        className="md:hidden pointer-events-none fixed inset-x-0 bottom-0 z-30 h-[140px] bg-[linear-gradient(to_top,hsl(var(--background))_22%,transparent)]"
      />

      {moreOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-background/60 backdrop-blur-[2px]"
        />
      )}

      {/* The More panel floats directly above the dock in the same material, so
          it reads as the slot opening rather than a separate surface. */}
      {moreOpen && (
        <div
          className="md:hidden fixed z-40 left-[max(env(safe-area-inset-left),0.875rem)] right-[max(env(safe-area-inset-right),0.875rem)] bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] flex flex-col gap-0.5 rounded-[26px] border border-border bg-card/95 p-2 backdrop-blur-xl shadow-pb-3"
        >
          {MORE.map((item) => {
            const Icon = item.icon;
            const active = activeId === item.id;
            const showBadge = item.id === 'renewals' && upcomingRenewalsCount > 0;
            return (
              <Link
                key={item.id}
                href={`/${item.id}`}
                // Closing here would run a frame before the route changes, so
                // the dock would briefly re-render the page you are leaving as
                // active. The pathname effect closes it once navigation lands;
                // only a tap on the page you are already on needs closing, as
                // that navigates nowhere and would fire no effect.
                onClick={active ? () => setMoreOpen(false) : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-13 items-center gap-3.5 rounded-[19px] px-3.5 text-[14px] font-medium transition-colors',
                  active ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="w-[19px] h-[19px] shrink-0" />
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
      )}

      <nav
        aria-label="Main navigation"
        className="md:hidden fixed z-40 left-[max(env(safe-area-inset-left),0.875rem)] right-[max(env(safe-area-inset-right),0.875rem)] bottom-[calc(env(safe-area-inset-bottom)+1.125rem)] flex h-[60px] items-center gap-[2px] rounded-full border border-border bg-card/85 p-[6px] backdrop-blur-xl shadow-pb-3"
      >
        {PRIMARY.map((item) => {
          const Icon = item.icon;
          const active = !moreOpen && activeId === item.id;
          // You are already on the page, so the dot has nothing left to say.
          const showDot = item.id === 'recurring' && upcomingRenewalsCount > 0 && !active;
          return (
            <Link
              key={item.id}
              href={`/${item.id}`}
              aria-current={active ? 'page' : undefined}
              aria-label={
                showDot ? `${item.label}, ${upcomingRenewalsCount} due soon` : item.label
              }
              className={active ? EXPANDED_SLOT : REST_SLOT}
            >
              <Icon className="w-[19px] h-[19px] shrink-0" />
              {active && (
                <span className="dock-label">
                  <span>
                    <span>{item.label}</span>
                  </span>
                </span>
              )}
              {showDot && (
                <span
                  aria-hidden
                  className="absolute top-[9px] right-[9px] h-1.5 w-1.5 rounded-full bg-warning ring-2 ring-card"
                />
              )}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-label={moreLabel}
          className={cn(
            moreExpanded ? EXPANDED_SLOT : REST_SLOT,
            // On a More page this slot never collapses, it only swaps text —
            // Settings → Close → Categories — and each swap would resize the
            // pill under the thumb. Pinning it to the widest label it can hold
            // (Categories, 117.6px at 13px Geist semibold, plus headroom) makes
            // those swaps invisible: the icon stays put and the label starts at
            // the same x, so only empty tinted space changes. Off a More page
            // the slot still expands from nothing, so it is left unpinned —
            // a floor there would defeat the open animation entirely.
            deepItem && 'min-w-[120px]',
          )}
        >
          <MoreIcon className="w-[19px] h-[19px] shrink-0" />
          {moreExpanded && (
            <span className="dock-label">
              <span>
                <span>{moreLabel}</span>
              </span>
            </span>
          )}
        </button>

        {/* Add does something rather than going somewhere — the hairline says so. */}
        <span aria-hidden className="shrink-0 w-px h-[22px] mx-[2px] bg-border" />

        <button
          type="button"
          onClick={fabAction ?? onAdd}
          aria-label="Add transaction"
          className="shrink-0 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition active:scale-95"
          style={{ boxShadow: '0 7px 18px hsl(var(--primary) / 0.45)' }}
        >
          <Plus className="w-[21px] h-[21px]" />
        </button>
      </nav>
    </>
  );
}
