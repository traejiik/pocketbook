'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  readNotificationConfig,
  toPublicNotificationSettings,
  validateDiscordWebhookUrl,
  writeNotificationConfig,
} from '@/lib/notifications/config'
import { sendNotification } from '@/lib/notifications/send'
import { NOTIFICATION_EVENT_KEYS, type NotificationConfigV1 } from '@/lib/notifications/types'
import { requireAuthenticatedUser } from '@/lib/require-auth'

const eventFlagsSchema = z.object(
  Object.fromEntries(NOTIFICATION_EVENT_KEYS.map((key) => [key, z.boolean()])) as Record<
    (typeof NOTIFICATION_EVENT_KEYS)[number],
    z.ZodBoolean
  >,
)

const notificationSettingsInputSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().trim().max(2048, 'Discord webhook URL is too long.').refine(
    (value) => value === '' || validateDiscordWebhookUrl(value),
    { message: 'Enter a valid Discord webhook URL.' },
  ),
  username: z.string().trim()
    .min(1, 'Enter a Discord username.')
    .max(80, 'Discord username must be 80 characters or fewer.'),
  avatarUrl: z.string().trim().max(2048, 'Avatar URL is too long.').refine(
    (value) => {
      if (value === '') return true
      try {
        return new URL(value).protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: 'Avatar URL must use HTTPS.' },
  ).nullable(),
  events: eventFlagsSchema,
})

export type NotificationSettingsInput = z.infer<typeof notificationSettingsInputSchema>

export async function saveNotificationSettings(input: NotificationSettingsInput) {
  await requireAuthenticatedUser()
  const parsedResult = notificationSettingsInputSchema.safeParse(input)
  if (!parsedResult.success) {
    return {
      ok: false as const,
      error: parsedResult.error.issues[0]?.message ?? 'Check the notification settings and try again.',
    }
  }

  const parsed = parsedResult.data
  const current = await readNotificationConfig()
  const webhookUrl = parsed.webhookUrl || current.config.webhookUrl

  if (parsed.enabled && !webhookUrl) {
    return { ok: false as const, error: 'Enter a Discord webhook before enabling notifications.' }
  }

  const nextConfig: NotificationConfigV1 = {
    version: 1,
    enabled: parsed.enabled,
    webhookUrl,
    username: parsed.username,
    avatarUrl: parsed.avatarUrl || null,
    events: parsed.events,
  }

  let config: NotificationConfigV1
  try {
    config = await writeNotificationConfig(nextConfig)
  } catch {
    return {
      ok: false as const,
      error: 'Could not save notification settings. Check that the notification data directory is writable.',
    }
  }

  revalidatePath('/settings')
  return {
    ok: true as const,
    settings: toPublicNotificationSettings(config, 'ready'),
  }
}

export async function disconnectDiscordNotifications() {
  await requireAuthenticatedUser()
  const current = await readNotificationConfig()
  const config = await writeNotificationConfig({
    ...current.config,
    enabled: false,
    webhookUrl: null,
  })

  revalidatePath('/settings')
  return {
    ok: true as const,
    settings: toPublicNotificationSettings(config, 'ready'),
  }
}

export async function sendTestNotification() {
  await requireAuthenticatedUser()
  const result = await sendNotification({ type: 'test' })
  if (!result.delivered) {
    const error = result.reason === 'not-configured'
      ? 'Connect a Discord webhook before sending a test.'
      : 'Discord did not accept the test notification.'
    return { ok: false as const, error }
  }
  return { ok: true as const }
}
