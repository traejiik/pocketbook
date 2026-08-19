import { sendNotification } from '@/lib/notifications/send'
import type { NotificationEvent } from '@/lib/notifications/types'

export function notificationEventFromArgs(args: string[]): NotificationEvent | null {
  if (args[0] === 'system-alert' && args[1] && args[2]) {
    return { type: 'systemAlerts', title: args[1], description: args[2] }
  }
  return null
}

export async function runNotificationCli(args = process.argv.slice(2)) {
  const event = notificationEventFromArgs(args)
  if (!event) return 2
  const result = await sendNotification(event, { instanceName: process.env.PB_INSTANCE_NAME })
  return result.delivered || result.reason !== 'delivery-failed' ? 0 : 1
}

if (typeof require !== 'undefined' && require.main === module) {
  runNotificationCli().then((code) => process.exit(code))
}
