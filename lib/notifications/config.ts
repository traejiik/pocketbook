import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import {
  NOTIFICATION_EVENT_KEYS,
  type NotificationConfigStatus,
  type NotificationConfigV1,
  type PublicNotificationSettings,
} from '@/lib/notifications/types'

export const NOTIFICATION_CONFIG_PATH = '/data/notifications.json'

export function notificationConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): string {
  if (env.PB_NOTIFICATION_CONFIG_PATH) return env.PB_NOTIFICATION_CONFIG_PATH
  if (env.NODE_ENV === 'production') return NOTIFICATION_CONFIG_PATH
  return join(cwd, '.data', 'notifications.json')
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfigV1 = {
  version: 1,
  enabled: false,
  webhookUrl: null,
  username: 'Pocketbook',
  avatarUrl: null,
  events: {
    systemAlerts: true,
    scheduledJobFailures: true,
    recurringActivity: true,
    monthlyInsightReady: true,
    backupCompleted: true,
    backupFailed: true,
  },
}

export function validateDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'discord.com' &&
      /^\/api\/webhooks\/\d+\/[^/]+\/?$/.test(url.pathname)
    )
  } catch {
    return false
  }
}

const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === 'https:', {
  message: 'Avatar URL must use HTTPS',
})

const notificationConfigSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  webhookUrl: z.string().refine(validateDiscordWebhookUrl, 'Enter a valid Discord webhook URL').nullable(),
  username: z.string().trim().min(1).max(80),
  avatarUrl: httpsUrl.nullable(),
  events: z.object(
    Object.fromEntries(NOTIFICATION_EVENT_KEYS.map((key) => [key, z.boolean()])) as Record<
      (typeof NOTIFICATION_EVENT_KEYS)[number],
      z.ZodBoolean
    >,
  ),
})

export async function readNotificationConfig(
  path = notificationConfigPath(),
): Promise<{ status: NotificationConfigStatus; config: NotificationConfigV1 }> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = notificationConfigSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return { status: 'invalid', config: DEFAULT_NOTIFICATION_CONFIG }
    return { status: 'ready', config: parsed.data }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    return {
      status: code === 'ENOENT' ? 'missing' : 'invalid',
      config: DEFAULT_NOTIFICATION_CONFIG,
    }
  }
}

export async function writeNotificationConfig(
  input: NotificationConfigV1,
  path = notificationConfigPath(),
): Promise<NotificationConfigV1> {
  const config = notificationConfigSchema.parse(input)
  const directory = dirname(path)
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`

  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  await chmod(path, 0o600)
  return config
}

export function toPublicNotificationSettings(
  config: NotificationConfigV1,
  status: NotificationConfigStatus,
): PublicNotificationSettings {
  const { webhookUrl, ...safe } = config
  return { ...safe, configured: Boolean(webhookUrl), status }
}
