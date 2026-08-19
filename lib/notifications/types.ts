export const NOTIFICATION_EVENT_KEYS = [
  'systemAlerts',
  'scheduledJobFailures',
  'recurringActivity',
  'monthlyInsightReady',
  'backupCompleted',
  'backupFailed',
] as const

export type NotificationEventKey = (typeof NOTIFICATION_EVENT_KEYS)[number]

export const DEFAULT_NOTIFICATION_EVENTS: Record<NotificationEventKey, boolean> = {
  systemAlerts: true,
  scheduledJobFailures: true,
  recurringActivity: true,
  monthlyInsightReady: true,
  backupCompleted: true,
  backupFailed: true,
}

export type NotificationConfigV1 = {
  version: 1
  enabled: boolean
  webhookUrl: string | null
  username: string
  avatarUrl: string | null
  events: Record<NotificationEventKey, boolean>
}

export type NotificationConfigStatus = 'missing' | 'ready' | 'invalid'

export type NotificationIdentity = {
  webhookUrl: string
  username: string
  avatarUrl: string | null
}

export type NotificationVerificationV2 = {
  identityHash: string
  verifiedAt: string
}

export type NotificationConfigV2 = Omit<NotificationConfigV1, 'version'> & {
  version: 2
  verification: NotificationVerificationV2 | null
}

export type NotificationConfig = NotificationConfigV2

export type AuthenticatedNotificationSettings = Omit<NotificationConfigV2, 'verification'> & {
  configured: boolean
  status: NotificationConfigStatus
  identityVerified: boolean
  verifiedAt: string | null
}

export type NotificationEvent =
  | { type: 'systemAlerts'; title: string; description: string }
  | { type: 'scheduledJobFailures'; job: string; error: string; scheduledFor: string }
  | { type: 'recurringActivity'; count: number; lines: readonly string[] }
  | { type: 'monthlyInsightReady'; month: string; model: string }
  | { type: 'backupCompleted'; filename: string; size: string; kept: number; source: 'scheduled' | 'manual' }
  | { type: 'backupFailed'; error: string; source: 'scheduled' | 'manual' }
  | { type: 'test' }

export type NotificationDeliveryResult =
  | { delivered: true }
  | {
      delivered: false
      reason: 'not-configured' | 'disabled' | 'event-disabled' | 'delivery-failed'
      status?: number
    }
