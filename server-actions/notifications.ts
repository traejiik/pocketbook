'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  readNotificationConfig,
  toAuthenticatedNotificationSettings,
  validateDiscordWebhookUrl,
  withNotificationConfigMutation,
  writeNotificationConfig,
} from '@/lib/notifications/config'
import { deliverNotificationWithConfig } from '@/lib/notifications/send'
import { normaliseNotificationIdentity } from '@/lib/notifications/identity'
import {
  hashNotificationIdentity,
  issueNotificationVerificationReceipt,
  verifyNotificationVerificationReceipt,
} from '@/lib/notifications/verification'
import {
  NOTIFICATION_EVENT_KEYS,
  type NotificationConfig,
  type NotificationDeliveryResult,
  type NotificationIdentity,
} from '@/lib/notifications/types'
import { requireAuthenticatedUser } from '@/lib/require-auth'
import { logger } from '@/lib/logger'

const log = logger('notifications')

const eventFlagsSchema = z.object(
  Object.fromEntries(NOTIFICATION_EVENT_KEYS.map((key) => [key, z.boolean()])) as Record<
    (typeof NOTIFICATION_EVENT_KEYS)[number],
    z.ZodBoolean
  >,
)

const discordWebhookSchema = z.string().trim()
  .max(2048, 'Discord webhook URL is too long.')
  .refine(validateDiscordWebhookUrl, { message: 'Enter a valid Discord webhook URL.' })

const savedDiscordWebhookSchema = z.string().trim()
  .max(2048, 'Discord webhook URL is too long.')
  .refine(
    (value) => value === '' || validateDiscordWebhookUrl(value),
    { message: 'Enter a valid Discord webhook URL.' },
  )

const discordUsernameSchema = z.string().trim()
  .min(1, 'Enter a Discord username.')
  .max(80, 'Discord username must be 80 characters or fewer.')

const avatarUrlSchema = z.string().trim()
  .max(2048, 'Avatar URL is too long.')
  .refine((value) => {
    if (value === '') return true
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }, { message: 'Avatar URL must use HTTPS.' })
  .nullable()

const notificationIdentityInputSchema = z.object({
  webhookUrl: discordWebhookSchema,
  username: discordUsernameSchema,
  avatarUrl: avatarUrlSchema,
})

const notificationSettingsInputSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: savedDiscordWebhookSchema,
  username: discordUsernameSchema,
  avatarUrl: avatarUrlSchema,
  events: eventFlagsSchema,
})

export type NotificationSettingsInput = z.infer<typeof notificationSettingsInputSchema>

const firstValidationError = (error: z.ZodError) =>
  error.issues[0]?.message ?? 'Check the notification settings and try again.'

const verificationRequiredError =
  'Send a successful test for the current webhook, username, and avatar before saving.'

function mapTestDeliveryError(
  result: Extract<NotificationDeliveryResult, { delivered: false }>,
): string {
  if (result.status === 401 || result.status === 404) {
    return 'Discord rejected this webhook. Check the URL and try again.'
  }
  if (result.status === 429) {
    return 'Discord is rate-limiting tests. Wait a moment and try again.'
  }
  return 'Discord did not accept the test notification.'
}

export async function saveNotificationSettings(
  input: NotificationSettingsInput,
  receipt: string | null = null,
) {
  await requireAuthenticatedUser()
  const parsedResult = notificationSettingsInputSchema.safeParse(input)
  if (!parsedResult.success) {
    log.warn('settings save rejected', { reason: firstValidationError(parsedResult.error) })
    return {
      ok: false as const,
      error: firstValidationError(parsedResult.error),
    }
  }

  const parsed = parsedResult.data
  const result = await withNotificationConfigMutation(async () => {
    const current = await readNotificationConfig()
    const webhookInputWasBlank = parsed.webhookUrl === ''
    const identity = normaliseNotificationIdentity({
      webhookUrl: parsed.webhookUrl || current.config.webhookUrl || '',
      username: parsed.username,
      avatarUrl: parsed.avatarUrl,
    })
    const identityHash = hashNotificationIdentity(identity)
    const persistedVerification = current.config.verification?.identityHash === identityHash
      ? current.config.verification
      : null
    const receiptVerification = !webhookInputWasBlank && receipt
      ? verifyNotificationVerificationReceipt(receipt, identity)
      : null

    if (!identity.webhookUrl || (!persistedVerification && !receiptVerification)) {
      log.warn('settings save rejected', {
        reason: identity.webhookUrl ? 'identity not verified' : 'no webhook configured',
        hasReceipt: !!receipt,
      })
      return { ok: false as const, error: verificationRequiredError }
    }

    const nextConfig: NotificationConfig = {
      version: 2,
      enabled: parsed.enabled,
      webhookUrl: identity.webhookUrl,
      username: identity.username,
      avatarUrl: identity.avatarUrl,
      events: parsed.events,
      verification: persistedVerification ?? receiptVerification,
    }

    let config: NotificationConfig
    try {
      config = await writeNotificationConfig(nextConfig)
    } catch (err) {
      log.error('settings save failed', { reason: 'config file not writable', err })
      return {
        ok: false as const,
        error: 'Could not save notification settings. Check that the notification data directory is writable.',
      }
    }

    log.info('settings saved', {
      enabled: config.enabled,
      username: config.username,
      hasAvatar: !!config.avatarUrl,
      verified: !!config.verification,
      events: Object.entries(config.events)
        .filter(([, on]) => on)
        .map(([key]) => key)
        .join(',') || 'none',
    })

    return {
      ok: true as const,
      settings: toAuthenticatedNotificationSettings(config, 'ready'),
    }
  })

  if (result.ok) revalidatePath('/settings')
  return result
}

export async function disconnectDiscordNotifications() {
  await requireAuthenticatedUser()
  const config = await withNotificationConfigMutation(async () => {
    const current = await readNotificationConfig()
    return writeNotificationConfig({
      ...current.config,
      enabled: false,
      webhookUrl: null,
      verification: null,
    })
  })

  log.info('discord disconnected')
  revalidatePath('/settings')
  return {
    ok: true as const,
    settings: toAuthenticatedNotificationSettings(config, 'ready'),
  }
}

export async function sendTestNotification(input: NotificationIdentity) {
  await requireAuthenticatedUser()
  const parsedResult = notificationIdentityInputSchema.safeParse(input)
  if (!parsedResult.success) {
    log.warn('test rejected', { reason: firstValidationError(parsedResult.error) })
    return { ok: false as const, error: firstValidationError(parsedResult.error) }
  }

  const identity = normaliseNotificationIdentity(parsedResult.data)
  const result = await deliverNotificationWithConfig(identity, { type: 'test' })
  if (!result.delivered) {
    log.warn('test delivery failed', {
      username: identity.username,
      reason: result.reason,
      status: result.status,
    })
    return { ok: false as const, error: mapTestDeliveryError(result) }
  }

  log.info('test delivered', { username: identity.username })

  const { receipt, expiresAt } = issueNotificationVerificationReceipt(identity)
  return { ok: true as const, receipt, expiresAt }
}
