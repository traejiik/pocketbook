import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_NOTIFICATION_CONFIG,
  readNotificationConfig,
  writeNotificationConfig,
} from '@/lib/notifications/config'
import { hashNotificationIdentity } from '@/lib/notifications/verification'

const authMock = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function verifiedConfig() {
  const config = {
    ...DEFAULT_NOTIFICATION_CONFIG,
    enabled: true,
    webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
    username: 'Pocketbook',
    avatarUrl: null,
  }

  return {
    ...config,
    verification: {
      identityHash: hashNotificationIdentity({
        webhookUrl: config.webhookUrl,
        username: config.username,
        avatarUrl: config.avatarUrl,
      }),
      verifiedAt: '2026-08-19T12:00:00.000Z',
    },
  }
}

describe('notification settings actions', () => {
  beforeEach(async () => {
    process.env.PB_NOTIFICATION_CONFIG_PATH = join(
      await mkdtemp(join(tmpdir(), 'pocketbook-notification-actions-')),
      'notifications.json',
    )
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('rejects unauthenticated configuration writes', async () => {
    authMock.mockResolvedValue(null)
    const { saveNotificationSettings } = await import('@/server-actions/notifications')

    await expect(saveNotificationSettings({
      enabled: true,
      webhookUrl: 'not-a-discord-webhook',
      username: '',
      avatarUrl: null,
      events: DEFAULT_NOTIFICATION_CONFIG.events,
    })).rejects.toThrow('Unauthorised')
  })

  it('persists a webhook and returns it to authenticated Settings clients', async () => {
    const { saveNotificationSettings } = await import('@/server-actions/notifications')

    const result = await saveNotificationSettings({
      enabled: true,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Pocketbook Home',
      avatarUrl: 'https://example.com/avatar.png',
      events: { ...DEFAULT_NOTIFICATION_CONFIG.events, backupCompleted: false },
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      settings: expect.objectContaining({
        configured: true,
        webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      }),
    }))
    expect((await readNotificationConfig(process.env.PB_NOTIFICATION_CONFIG_PATH)).config.webhookUrl).toContain('token-value')
  })

  it.each([
    {
      name: 'non-Discord webhook URL',
      input: { webhookUrl: 'https://example.com/api/webhooks/123/token-value' },
      error: 'Enter a valid Discord webhook URL.',
    },
    {
      name: 'blank Discord username',
      input: { username: '' },
      error: 'Enter a Discord username.',
    },
    {
      name: 'non-HTTPS avatar URL',
      input: { avatarUrl: 'http://example.com/avatar.png' },
      error: 'Avatar URL must use HTTPS.',
    },
    {
      name: 'webhook URL over 2048 characters',
      input: { webhookUrl: `https://discord.com/api/webhooks/123/${'a'.repeat(2049)}` },
      error: 'Discord webhook URL is too long.',
    },
    {
      name: 'Discord username over 80 characters',
      input: { username: 'a'.repeat(81) },
      error: 'Discord username must be 80 characters or fewer.',
    },
    {
      name: 'avatar URL over 2048 characters',
      input: { avatarUrl: `https://example.com/${'a'.repeat(2049)}` },
      error: 'Avatar URL is too long.',
    },
  ])('returns a useful validation error for $name', async ({ input, error }) => {
    const { saveNotificationSettings } = await import('@/server-actions/notifications')

    const result = await saveNotificationSettings({
      enabled: false,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Pocketbook',
      avatarUrl: null,
      events: DEFAULT_NOTIFICATION_CONFIG.events,
      ...input,
    })

    expect(result).toEqual({ ok: false, error })
  })

  it('returns a safe error when notification settings cannot be written', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pocketbook-notification-actions-blocked-'))
    const blocker = join(directory, 'blocker')
    await writeFile(blocker, 'not a directory')
    process.env.PB_NOTIFICATION_CONFIG_PATH = join(blocker, 'notifications.json')
    vi.resetModules()
    const { saveNotificationSettings } = await import('@/server-actions/notifications')

    await expect(saveNotificationSettings({
      enabled: false,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Pocketbook',
      avatarUrl: null,
      events: DEFAULT_NOTIFICATION_CONFIG.events,
    })).resolves.toEqual({
      ok: false,
      error: 'Could not save notification settings. Check that the notification data directory is writable.',
    })
  })

  it('retains the saved webhook when updating non-secret fields with a blank URL', async () => {
    const { saveNotificationSettings } = await import('@/server-actions/notifications')
    await saveNotificationSettings({
      enabled: true,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Pocketbook',
      avatarUrl: null,
      events: DEFAULT_NOTIFICATION_CONFIG.events,
    })

    await saveNotificationSettings({
      enabled: false,
      webhookUrl: '',
      username: 'Quiet Pocketbook',
      avatarUrl: null,
      events: DEFAULT_NOTIFICATION_CONFIG.events,
    })

    expect((await readNotificationConfig(process.env.PB_NOTIFICATION_CONFIG_PATH)).config).toEqual(expect.objectContaining({
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Quiet Pocketbook',
      enabled: false,
    }))
  })

  it('disconnects and removes the webhook secret and verification', async () => {
    const { disconnectDiscordNotifications } = await import('@/server-actions/notifications')
    await writeNotificationConfig(verifiedConfig(), process.env.PB_NOTIFICATION_CONFIG_PATH)

    const result = await disconnectDiscordNotifications()

    expect(result.settings.configured).toBe(false)
    expect(result.settings.webhookUrl).toBeNull()
    expect((await readNotificationConfig(process.env.PB_NOTIFICATION_CONFIG_PATH)).config).toEqual(expect.objectContaining({
      webhookUrl: null,
      verification: null,
    }))
  })

  it('preserves verification for switch-only settings changes', async () => {
    const { saveNotificationSettings } = await import('@/server-actions/notifications')
    const config = verifiedConfig()
    await writeNotificationConfig(config, process.env.PB_NOTIFICATION_CONFIG_PATH)

    await saveNotificationSettings({
      enabled: false,
      webhookUrl: '',
      username: config.username,
      avatarUrl: config.avatarUrl,
      events: { ...config.events, backupCompleted: false },
    })

    expect((await readNotificationConfig(process.env.PB_NOTIFICATION_CONFIG_PATH)).config.verification)
      .toEqual(config.verification)
  })

  it.each([
    {
      name: 'webhook',
      input: { webhookUrl: 'https://discord.com/api/webhooks/456/token-value' },
    },
    {
      name: 'username',
      input: { username: 'Pocketbook Home' },
    },
    {
      name: 'avatar',
      input: { avatarUrl: 'https://example.com/pocketbook.png' },
    },
  ])('clears verification when the $name identity field changes', async ({ input }) => {
    const { saveNotificationSettings } = await import('@/server-actions/notifications')
    const config = verifiedConfig()
    await writeNotificationConfig(config, process.env.PB_NOTIFICATION_CONFIG_PATH)

    await saveNotificationSettings({
      enabled: config.enabled,
      webhookUrl: config.webhookUrl,
      username: config.username,
      avatarUrl: config.avatarUrl,
      events: config.events,
      ...input,
    })

    expect((await readNotificationConfig(process.env.PB_NOTIFICATION_CONFIG_PATH)).config.verification).toBeNull()
  })

  it('sends an authenticated test even while the master switch is off', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { saveNotificationSettings, sendTestNotification } = await import('@/server-actions/notifications')
    await saveNotificationSettings({
      enabled: false,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Pocketbook',
      avatarUrl: null,
      events: Object.fromEntries(
        Object.keys(DEFAULT_NOTIFICATION_CONFIG.events).map((key) => [key, false]),
      ) as typeof DEFAULT_NOTIFICATION_CONFIG.events,
    })

    await expect(sendTestNotification()).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
