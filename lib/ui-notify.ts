import { toast } from 'sonner';
import type { LucideIcon } from 'lucide-react';

type Pusher = (msg: string, icon?: LucideIcon) => void;

let pusher: Pusher | null = null;

/** NotificationsProvider registers its push fn here so every success toast can
 * also land in the bell's activity log (v5 behaviour). */
export function registerNotificationPusher(fn: Pusher | null) {
  pusher = fn;
}

export const notify = {
  success(msg: string, icon?: LucideIcon) {
    toast.success(msg);
    pusher?.(msg, icon);
  },
  error(msg: string) {
    toast.error(msg);
  },
};
