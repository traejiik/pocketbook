export const dynamic = 'force-dynamic'

import { readNotificationConfig, toAuthenticatedNotificationSettings } from '@/lib/notifications/config';
import { NotificationSettings } from '../NotificationSettings';

export default async function NotificationSettingsPage() {
  const notificationConfig = await readNotificationConfig();

  return (
    <div className="motion-stagger space-y-7">
      <NotificationSettings
        initialSettings={toAuthenticatedNotificationSettings(notificationConfig.config, notificationConfig.status)}
      />
    </div>
  );
}
