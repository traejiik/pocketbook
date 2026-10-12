'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, CalendarDays, type LucideIcon } from 'lucide-react';
import { registerNotificationPusher } from '@/lib/ui-notify';

export interface AppNotification {
  id: string;
  icon: LucideIcon;
  msg: string;
  time: string;
  unread: boolean;
}

interface NotificationsValue {
  items: AppNotification[];
  hasUnread: boolean;
  markAllRead: () => void;
  push: (msg: string, icon?: LucideIcon) => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

let counter = 0;

// Persists only the *dismissed* state of the recurring renewals signal — the
// one notification that gets reseeded every load. The token is day + count, so
// a new day or a changed renewal count resurfaces it as unread.
const DISMISS_KEY = 'pb-renewals-dismissed';

function renewalsToken(count: number): string | null {
  if (count <= 0) return null;
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}:${count}`;
}

// Session-local activity log: a seeded "renewals due" signal plus anything
// toasts prepend. Only the renewals seed's read state is persisted (localStorage);
// the rest mirrors the v5 prototype's ephemeral bell.
export function NotificationsProvider({
  children,
  renewalsCount = 0,
}: {
  children: ReactNode;
  renewalsCount?: number;
}) {
  const token = renewalsToken(renewalsCount);

  const [items, setItems] = useState<AppNotification[]>(() =>
    renewalsCount > 0
      ? [
          {
            id: 'seed-renewals',
            icon: CalendarDays,
            msg: `${renewalsCount} renewal${renewalsCount === 1 ? '' : 's'} due in the next 7 days`,
            time: 'Today',
            unread: true,
          },
        ]
      : [],
  );

  // After hydration, honour a prior dismissal of the current renewals signal.
  useEffect(() => {
    if (!token) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === token) {
        setItems((ns) =>
          ns.map((n) => (n.id === 'seed-renewals' ? { ...n, unread: false } : n)),
        );
      }
    } catch {
      // localStorage unavailable (private mode / SSR) — fall back to session-only.
    }
  }, [token]);

  const markAllRead = useCallback(() => {
    setItems((ns) => ns.map((n) => (n.unread ? { ...n, unread: false } : n)));
    if (token) {
      try {
        localStorage.setItem(DISMISS_KEY, token);
      } catch {
        // best-effort persistence only.
      }
    }
  }, [token]);

  const push = useCallback((msg: string, icon: LucideIcon = CheckCircle2) => {
    counter += 1;
    setItems((ns) =>
      [{ id: `n-${counter}`, icon, msg, time: 'Just now', unread: false }, ...ns].slice(0, 12),
    );
  }, []);

  // Let toasts fired anywhere (the notify helper) prepend to the bell log.
  useEffect(() => {
    registerNotificationPusher(push);
    return () => registerNotificationPusher(null);
  }, [push]);

  const hasUnread = items.some((n) => n.unread);

  const value = useMemo<NotificationsValue>(
    () => ({ items, hasUnread, markAllRead, push }),
    [items, hasUnread, markAllRead, push],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
