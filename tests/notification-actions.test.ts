import { mkdtemp } from 'node:fs/promises'
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
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Pocketbook',
      avatarUrl: null,
      events: DEFAULT_NOTIFICATION_CONFIG.events,
    })).rejects.toThrow('Unauthorised')
  })

  it('persists a webhook but returns only public masked settings', async () => {
    const { saveNotificationSettings } = await import('@/server-actions/notifications')

    const result = await saveNotificationSettings({
      enabled: true,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Pocketbook Home',
      avatarUrl: 'https://example.com/avatar.png',
      events: { ...DEFAULT_NOTIFICATION_CONFIG.events, backupCompleted: false },
    })

    expect(result).toEqual(expect.objectContaining({ ok: true, settings: expect.objectContaining({ configured: true }) }))
    expect(JSON.stringify(result)).not.toContain('token-value')
    expect((await readNotificationConfig(process.env.PB_NOTIFICATION_CONFIG_PATH)).config.webhookUrl).toContain('token-value')
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
