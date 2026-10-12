'use client';

import { useEffect, useState } from 'react';

/** True below the v5 mobile cutoff (md / 768px). Defaults to false on the
 * server and first paint to avoid hydration mismatch. Components that only use
 * the value after a client action can opt into immediate client matching. */
export function useIsMobile(query = '(max-width: 767px)', matchOnClientFirstPaint = false): boolean {
  const [isMobile, setIsMobile] = useState(() => (
    matchOnClientFirstPaint && typeof window !== 'undefined'
      ? window.matchMedia(query).matches
      : false
  ));

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);

  return isMobile;
}
