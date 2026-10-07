'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SETTINGS_SECTIONS, siblingTransitionTypes, subNavIdForPath } from '@/components/shell/nav';

/**
 * Settings section chips, below 1025px only — the sidebar tree replaces them
 * above that, and the collapsed tablet rail has no room for a tree. One row
 * that scrolls sideways (same pattern as the transaction form's category
 * chips), so every tier switches sections the same way and nothing is hidden
 * behind the dock's More panel.
 */
export function SettingsSectionNav() {
  const pathname = usePathname();
  const activeId = subNavIdForPath(pathname);
  const rowRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Both edges fade; the leading fade sits over the row padding, so it only
  // shows once the row has scrolled. Bring the current chip into view when it
  // would sit past the edge — at 375px "Security" starts off-screen. Scrolls
  // the row only, never the page.
  useEffect(() => {
    const row = rowRef.current;
    const chip = activeRef.current;
    if (!row || !chip) return;
    const start = chip.offsetLeft;
    const end = start + chip.offsetWidth;
    if (start < row.scrollLeft || end > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = Math.max(0, start - (row.clientWidth - chip.offsetWidth) / 2);
    }
  }, [activeId]);

  return (
    <nav aria-label="Settings sections" className="min-[1025px]:hidden mb-5">
      <div
        ref={rowRef}
        className="relative flex gap-1.5 overflow-x-auto py-1 -my-1 -mx-4 px-4 pr-8 lg:-mx-7 lg:px-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-32px),transparent)]"
      >
        {SETTINGS_SECTIONS.map((section) => {
          const active = section.id === activeId;
          return (
            <Link
              key={section.id}
              ref={active ? activeRef : undefined}
              href={`/settings/${section.id}`}
              transitionTypes={siblingTransitionTypes(SETTINGS_SECTIONS, activeId, section.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center h-11 md:h-10 px-4 rounded-full border text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                active
                  ? 'border-transparent bg-primary/15 text-foreground font-medium'
                  : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
