'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  readNotificationConfig,
  toPublicNotificationSettings,
  writeNotificationConfig,
} from '@/lib/notifications/config'
import { sendNotification } from '@/lib/notifications/send'
import { NOTIFICATION_EVENT_KEYS } from '@/lib/notifications/types'
import { requireAuthenticatedUser } from '@/lib/require-auth'

const eventFlagsSchema = z.object(
  Object.fromEntries(NOTIFICATION_EVENT_KEYS.map((key) => [key, z.boolean()])) as Record<
    (typeof NOTIFICATION_EVENT_KEYS)[number],
    z.ZodBoolean
  >,
)

const notificationSettingsInputSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().trim().max(2048),
  username: z.string().trim().min(1).max(80),
  avatarUrl: z.string().trim().max(2048).nullable(),
  events: eventFlagsSchema,
})

export type NotificationSettingsInput = z.infer<typeof notificationSettingsInputSchema>

export async function saveNotificationSettings(input: NotificationSettingsInput) {
  await requireAuthenticatedUser()
  const parsed = notificationSettingsInputSchema.parse(input)
  const current = await readNotificationConfig()
  const webhookUrl = parsed.webhookUrl || current.config.webhookUrl

  if (parsed.enabled && !webhookUrl) {
    return { ok: false as const, error: 'Enter a Discord webhook before enabling notifications.' }
  }

  const config = await writeNotificationConfig({
    version: 1,
    enabled: parsed.enabled,
    webhookUrl,
    username: parsed.username,
    avatarUrl: parsed.avatarUrl || null,
    events: parsed.events,
  })

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
