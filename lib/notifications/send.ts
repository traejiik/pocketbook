import { readNotificationConfig } from '@/lib/notifications/config'
import type {
  NotificationDeliveryResult,
  NotificationEvent,
  NotificationEventKey,
} from '@/lib/notifications/types'

const DISCORD_GREEN = 0x2ecc71
const DISCORD_RED = 0xe74c3c
const DISCORD_AMBER = 0xf1c40f
const DISCORD_BLURPLE = 0x5865f2
export const DISCORD_TIMEOUT_MS = 5000

type RenderedNotification = {
  eventKey: NotificationEventKey | null
  title: string
  description: string
  color: number
}

function truncate(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

export function renderNotification(event: NotificationEvent): RenderedNotification {
  switch (event.type) {
    case 'systemAlerts':
      return {
        eventKey: event.type,
        title: truncate(event.title, 256),
        description: truncate(event.description, 4000),
        color: DISCORD_RED,
      }
    case 'scheduledJobFailures':
      return {
        eventKey: event.type,
        title: `⚠️ Scheduled job failed: ${truncate(event.job, 220)}`,
        description: truncate(`Scheduled for ${event.scheduledFor}\n${event.error}`, 4000),
        color: DISCORD_RED,
      }
    case 'recurringActivity':
      return {
        eventKey: event.type,
        title: `🔁 Logged ${event.count} recurring transaction${event.count === 1 ? '' : 's'}`,
        description: truncate(event.lines.join('\n'), 4000),
        color: DISCORD_GREEN,
      }
    case 'monthlyInsightReady':
      return {
        eventKey: event.type,
        title: '🤖 Monthly insight ready',
        description: truncate(`**${event.month}** · model \`${event.model}\``, 4000),
        color: DISCORD_BLURPLE,
      }
    case 'backupCompleted':
      return {
        eventKey: event.type,
        title: '💾 Database backup completed',
        description: truncate(
          `${event.filename} · ${event.size} · ${event.kept} kept · ${event.source}`,
          4000,
        ),
        color: DISCORD_GREEN,
      }
    case 'backupFailed':
      return {
        eventKey: event.type,
        title: '🛑 Database backup failed',
        description: truncate(`${event.source} · ${event.error}`, 4000),
        color: DISCORD_RED,
      }
    case 'test':
      return {
        eventKey: null,
        title: 'Pocketbook notifications connected',
        description: 'This test confirms that your Discord webhook, username, and avatar are working.',
        color: DISCORD_AMBER,
      }
  }
}

export async function sendNotification(
  event: NotificationEvent,
  options: {
    configPath?: string
    fetchImpl?: typeof fetch
    instanceName?: string
    timeoutMs?: number
  } = {},
): Promise<NotificationDeliveryResult> {
  const { config } = await readNotificationConfig(options.configPath)
  if (!config.webhookUrl) return { delivered: false, reason: 'not-configured' }

  const rendered = renderNotification(event)
  if (event.type !== 'test') {
    if (!config.enabled) return { delivered: false, reason: 'disabled' }
    if (rendered.eventKey && !config.events[rendered.eventKey]) {
      return { delivered: false, reason: 'event-disabled' }
    }
  }

  const webhook = new URL(config.webhookUrl)
  webhook.searchParams.set('wait', 'true')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DISCORD_TIMEOUT_MS)

  try {
    const response = await (options.fetchImpl ?? fetch)(webhook.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: config.username,
        ...(config.avatarUrl ? { avatar_url: config.avatarUrl } : {}),
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: rendered.title,
            description: rendered.description,
            color: rendered.color,
            footer: {
              text: truncate(options.instanceName ? `Pocketbook · ${options.instanceName}` : 'Pocketbook', 256),
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: controller.signal,
    })
    if (!response.ok) return { delivered: false, reason: 'delivery-failed', status: response.status }
    return { delivered: true }
  } catch {
    return { delivered: false, reason: 'delivery-failed' }
  } finally {
    clearTimeout(timer)
  }
}
