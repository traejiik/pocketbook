'use client';

import { ViewTransition } from 'react';
import { usePathname } from 'next/navigation';
import { navIdForPath } from '@/components/shell/nav';

/**
 * Hand-off between top-level pages. Keyed by the nav section, so only a real
 * page change swaps it — month steps, search and optimistic writes keep the
 * key and stay still. The old page fades out quickly; the new one needs no
 * enter animation because its own `.motion-*` entrance already plays.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const section = navIdForPath(usePathname());
  return (
    <ViewTransition key={section} exit="page-exit" enter="none" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * Sideways move between children of one section (Settings subpages). Links
 * tag the navigation `section-forward` / `section-back` via
 * `siblingTransitionTypes`; untagged changes (browser back) swap instantly.
 */
export function SectionTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      enter={{ 'section-forward': 'section-in-forward', 'section-back': 'section-in-back', default: 'none' }}
      exit={{ 'section-forward': 'section-out-forward', 'section-back': 'section-out-back', default: 'none' }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
