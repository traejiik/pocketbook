import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_NOTIFICATION_CONFIG, readNotificationConfig } from '@/lib/notifications/config'

const authMock = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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

  it('disconnects and removes the webhook secret', async () => {
    const { disconnectDiscordNotifications, saveNotificationSettings } = await import('@/server-actions/notifications')
    await saveNotificationSettings({
      enabled: true,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Pocketbook',
      avatarUrl: null,
      events: DEFAULT_NOTIFICATION_CONFIG.events,
    })

    const result = await disconnectDiscordNotifications()

    expect(result.settings.configured).toBe(false)
    expect(result.settings.webhookUrl).toBeNull()
    expect((await readNotificationConfig(process.env.PB_NOTIFICATION_CONFIG_PATH)).config.webhookUrl).toBeNull()
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
