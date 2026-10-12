'use client';

import { useEffect } from 'react';

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isInsideInput(el: Element | null): boolean {
  if (!el) return false;
  return INPUT_TAGS.has(el.tagName) || (el as HTMLElement).isContentEditable;
}

export function useGlobalKeys(handlers: Record<string, () => void>) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isInsideInput(document.activeElement)) return;
      const handler = handlers[e.key];
      if (handler && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handler();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
