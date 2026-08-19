export const NOTIFICATION_EVENT_KEYS = [
  'systemAlerts',
  'scheduledJobFailures',
  'recurringActivity',
  'monthlyInsightReady',
  'backupCompleted',
  'backupFailed',
] as const

export type NotificationEventKey = (typeof NOTIFICATION_EVENT_KEYS)[number]

export type NotificationConfigV1 = {
  version: 1
  enabled: boolean
  webhookUrl: string | null
  username: string
  avatarUrl: string | null
  events: Record<NotificationEventKey, boolean>
}

export type NotificationConfigStatus = 'missing' | 'ready' | 'invalid'

export type PublicNotificationSettings = NotificationConfigV1 & {
  configured: boolean
  status: NotificationConfigStatus
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
