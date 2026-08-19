import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import {
  DEFAULT_NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  type AuthenticatedNotificationSettings,
  type NotificationConfig,
  type NotificationConfigStatus,
  type NotificationConfigV2,
} from '@/lib/notifications/types'
import { hashNotificationIdentity } from '@/lib/notifications/verification'

export const NOTIFICATION_CONFIG_PATH = '/data/notifications.json'

export function notificationConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): string {
  if (env.PB_NOTIFICATION_CONFIG_PATH) return env.PB_NOTIFICATION_CONFIG_PATH
  if (env.NODE_ENV === 'production') return NOTIFICATION_CONFIG_PATH
  return join(cwd, '.data', 'notifications.json')
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  version: 2,
  enabled: false,
  webhookUrl: null,
  username: 'Pocketbook',
  avatarUrl: null,
  events: DEFAULT_NOTIFICATION_EVENTS,
  verification: null,
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

const notificationEventsSchema = z.object(
  Object.fromEntries(NOTIFICATION_EVENT_KEYS.map((key) => [key, z.boolean()])) as Record<
    (typeof NOTIFICATION_EVENT_KEYS)[number],
    z.ZodBoolean
  >,
)

const notificationConfigBaseSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().refine(validateDiscordWebhookUrl, 'Enter a valid Discord webhook URL').nullable(),
  username: z.string().trim().min(1).max(80),
  avatarUrl: httpsUrl.nullable(),
  events: notificationEventsSchema,
})

const notificationConfigV1Schema = notificationConfigBaseSchema.extend({
  version: z.literal(1),
})

const notificationConfigV2Schema = notificationConfigBaseSchema.extend({
  version: z.literal(2),
  verification: z.object({
    identityHash: z.string().regex(/^[a-f0-9]{64}$/),
    verifiedAt: z.string().datetime(),
  }).nullable(),
})

function parseStoredNotificationConfig(raw: unknown): NotificationConfig | null {
  const v2 = notificationConfigV2Schema.safeParse(raw)
  if (v2.success) return v2.data

  const v1 = notificationConfigV1Schema.safeParse(raw)
  if (!v1.success) return null
  return { ...v1.data, version: 2, verification: null }
}

export async function readNotificationConfig(
  path = notificationConfigPath(),
): Promise<{ status: NotificationConfigStatus; config: NotificationConfig }> {
  try {
    const raw = await readFile(path, 'utf8')
    const config = parseStoredNotificationConfig(JSON.parse(raw))
    if (!config) return { status: 'invalid', config: DEFAULT_NOTIFICATION_CONFIG }
    return { status: 'ready', config }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    return {
      status: code === 'ENOENT' ? 'missing' : 'invalid',
      config: DEFAULT_NOTIFICATION_CONFIG,
    }
  }
}

export async function writeNotificationConfig(
  input: NotificationConfigV2,
  path = notificationConfigPath(),
): Promise<NotificationConfigV2> {
  const config = notificationConfigV2Schema.parse(input)
  const directory = dirname(path)
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`

  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  await chmod(path, 0o600)
  return config
}

export function toAuthenticatedNotificationSettings(
  config: NotificationConfigV2,
  status: NotificationConfigStatus,
): AuthenticatedNotificationSettings {
  const { verification, ...settings } = config
  const identityHash = config.webhookUrl
    ? hashNotificationIdentity({
      webhookUrl: config.webhookUrl,
      username: config.username,
      avatarUrl: config.avatarUrl,
    })
    : null
  const identityVerified = Boolean(identityHash && verification?.identityHash === identityHash)

  return {
    ...settings,
    configured: Boolean(config.webhookUrl),
    status,
    identityVerified,
    verifiedAt: identityVerified ? verification?.verifiedAt ?? null : null,
  }
}
