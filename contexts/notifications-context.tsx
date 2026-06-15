'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, CalendarDays, type LucideIcon } from 'lucide-react';

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

// Session-local activity log: a seeded "renewals due" signal plus anything
// toasts prepend. No backend persistence — mirrors the v5 prototype's bell.
export function NotificationsProvider({
  children,
  renewalsCount = 0,
}: {
  children: ReactNode;
  renewalsCount?: number;
}) {
  const [items, setItems] = useState<AppNotification[]>(() =>
    renewalsCount > 0
      ? [
          {
            id: 'seed-renewals',
            icon: CalendarDays,
            msg: `${renewalsCount} renewal${renewalsCount === 1 ? '' : 's'} due in the next 30 days`,
            time: 'Today',
            unread: true,
          },
        ]
      : [],
  );

  const markAllRead = useCallback(
    () => setItems((ns) => ns.map((n) => (n.unread ? { ...n, unread: false } : n))),
    [],
  );

  const push = useCallback((msg: string, icon: LucideIcon = CheckCircle2) => {
    counter += 1;
    setItems((ns) =>
      [{ id: `n-${counter}`, icon, msg, time: 'Just now', unread: false }, ...ns].slice(0, 12),
    );
  }, []);

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
