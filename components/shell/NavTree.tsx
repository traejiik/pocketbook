'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { hrefFor, type NavItem } from '@/components/shell/nav';

interface NavTreeItemProps {
  item: NavItem;
  /** The parent section is the current route (`/settings/*`). */
  active: boolean;
  /** Current child id, from `subNavIdForPath`. */
  activeChildId: string | null;
  /** Size/shape classes for the parent row, so it matches the host's rows. */
  rowClassName: string;
}

/**
 * A nav row with subpages (sidebar and open tablet drawer). The row links to
 * the first child; the chevron only toggles the list. The list opens whenever
 * the section is entered and folds away when you leave it, so the tree never
 * crowds the rest of the nav. Connector lines are borders, not SVG.
 */
export function NavTreeItem({ item, active, activeChildId, rowClassName }: NavTreeItemProps) {
  const [open, setOpen] = useState(active);
  // Follow the route in and out of the section, still letting the chevron
  // override it in between. Adjusted during render rather than in an effect.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setOpen(active);
  }

  const Icon = item.icon;
  const children = item.children ?? [];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Link
          href={hrefFor(item)}
          aria-current={active && !activeChildId ? 'page' : undefined}
          className={cn(
            'group w-full flex items-center gap-2.5 pr-10 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            rowClassName,
            // The active child carries the fill; the parent only lifts its text.
            active
              ? 'text-foreground font-medium hover:bg-accent/70'
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
        </Link>
        <CollapsibleTrigger
          aria-label={`${open ? 'Hide' : 'Show'} ${item.label} sections`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 transition-transform duration-200 ease-(--ease-out-quart)',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        {/* ml-[21px] puts the trunk under the parent icon's centre (12px pad + 9px). */}
        <ul className="ml-[21px] pt-0.5 pb-1">
          {children.map((child, i) => {
            const childActive = active && activeChildId === child.id;
            const last = i === children.length - 1;
            return (
              <li
                key={child.id}
                className={cn(
                  'relative pl-4 py-px',
                  // Elbow: trunk down to the row's middle, curving into the row.
                  'before:absolute before:left-0 before:top-0 before:h-1/2 before:w-2.5 before:border-l before:border-b before:border-border before:rounded-bl-[8px]',
                  // Trunk continues past every row but the last.
                  !last && 'after:absolute after:left-0 after:top-0 after:bottom-0 after:border-l after:border-border',
                )}
              >
                <Link
                  href={`/${item.id}/${child.id}`}
                  aria-current={childActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center px-2.5 py-[7px] rounded-[9px] text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    childActive
                      ? 'bg-primary/15 text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/70',
                  )}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
