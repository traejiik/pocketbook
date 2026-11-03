'use client';

import { useLayoutEffect, useRef } from 'react';
import { beginVisit, DRAW_WINDOW_MS, drawSection, markDrawn } from '@/lib/draw-once';

/**
 * Applies the once-per-session draw rule across client navigations. The attribute
 * changes in the same commit as the new page, before it paints.
 */
export function useDrawOnce(pathname: string) {
  const section = drawSection(pathname);
  const drawing = useRef<string | null>(null);

  useLayoutEffect(() => {
    drawing.current = beginVisit(section, drawing.current);
    if (drawing.current === null) {
      markDrawn();
      return;
    }
    delete document.documentElement.dataset.drawn;
    const timer = window.setTimeout(markDrawn, DRAW_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [section]);
}
