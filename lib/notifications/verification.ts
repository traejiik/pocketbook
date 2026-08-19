import { createHash } from 'node:crypto'

import { notificationIdentityKey } from '@/lib/notifications/identity'
import type { NotificationIdentity } from '@/lib/notifications/types'

export function hashNotificationIdentity(identity: NotificationIdentity): string {
  return createHash('sha256').update(notificationIdentityKey(identity)).digest('hex')
}
