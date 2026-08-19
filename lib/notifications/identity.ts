import type { NotificationIdentity } from '@/lib/notifications/types'

export function normaliseNotificationIdentity(identity: NotificationIdentity): NotificationIdentity {
  return {
    webhookUrl: identity.webhookUrl.trim(),
    username: identity.username.trim(),
    avatarUrl: identity.avatarUrl?.trim() || null,
  }
}

export function notificationIdentityKey(identity: NotificationIdentity): string {
  const normalised = normaliseNotificationIdentity(identity)
  return JSON.stringify([normalised.webhookUrl, normalised.username, normalised.avatarUrl])
}
