import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
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

const validIdentity = {
  webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
  username: 'Pocketbook',
  avatarUrl: 'https://i.ibb.co/logo.png',
}

const validSettingsInput = {
  enabled: true,
  ...validIdentity,
  events: DEFAULT_NOTIFICATION_CONFIG.events,
}

const verificationRequiredError =
  'Send a successful test for the current webhook, username, and avatar before saving.'

function verifiedConfig() {
  const config = {
    ...DEFAULT_NOTIFICATION_CONFIG,
    enabled: true,
    ...validIdentity,
  }

  return {
    ...config,
    verification: {
      identityHash: hashNotificationIdentity(validIdentity),
      verifiedAt: '2026-08-19T12:00:00.000Z',
    },
  }
}

async function storedConfig() {
  return readNotificationConfig(process.env.PB_NOTIFICATION_CONFIG_PATH)
}

describe('notification settings actions', () => {
  beforeEach(async () => {
    process.env.PB_NOTIFICATION_CONFIG_PATH = join(
      await mkdtemp(join(tmpdir(), 'pocketbook-notification-actions-')),
      'notifications.json',
    )
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('authenticates Test and Save before validation, delivery, or persistence', async () => {
    authMock.mockResolvedValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { saveNotificationSettings, sendTestNotification } = await import('@/server-actions/notifications')
    const invalidIdentity = { webhookUrl: 'not-a-discord-webhook', username: '', avatarUrl: null }

    await expect(sendTestNotification(invalidIdentity)).rejects.toThrow('Unauthorised')
    await expect(saveNotificationSettings({
      enabled: true,
      ...invalidIdentity,
      events: DEFAULT_NOTIFICATION_CONFIG.events,
    })).rejects.toThrow('Unauthorised')

    expect(fetchMock).not.toHaveBeenCalled()
    await expect(storedConfig()).resolves.toEqual({
      status: 'missing',
      config: DEFAULT_NOTIFICATION_CONFIG,
    })
  })

  it('tests the current unsaved identity and returns a verification receipt without writing config', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { sendTestNotification } = await import('@/server-actions/notifications')

    const result = await sendTestNotification(validIdentity)

    expect(result).toEqual({
      ok: true,
      receipt: expect.any(String),
      expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${validIdentity.webhookUrl}?wait=true`)
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({
      username: validIdentity.username,
      avatar_url: validIdentity.avatarUrl,
    }))
    await expect(storedConfig()).resolves.toEqual({
      status: 'missing',
      config: DEFAULT_NOTIFICATION_CONFIG,
    })
  })

  it('rejects a new identity without a successful-test receipt and writes nothing', async () => {
    const { saveNotificationSettings } = await import('@/server-actions/notifications')

    await expect(saveNotificationSettings(validSettingsInput, null)).resolves.toEqual({
      ok: false,
      error: verificationRequiredError,
    })
    await expect(storedConfig()).resolves.toEqual({
      status: 'missing',
      config: DEFAULT_NOTIFICATION_CONFIG,
    })
  })

  it('persists the exact tested identity with a 64-character verification hash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { saveNotificationSettings, sendTestNotification } = await import('@/server-actions/notifications')
    const testResult = await sendTestNotification(validIdentity)
    expect(testResult.ok).toBe(true)
    if (!testResult.ok) throw new Error(testResult.error)

    const result = await saveNotificationSettings(validSettingsInput, testResult.receipt)

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      settings: expect.objectContaining({
        ...validIdentity,
        configured: true,
        identityVerified: true,
      }),
    }))
    const stored = await storedConfig()
    expect(stored.config).toEqual(expect.objectContaining(validIdentity))
    expect(stored.config.verification).toEqual({
      identityHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      verifiedAt: expect.any(String),
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([
    {
      name: 'webhook',
      input: { webhookUrl: 'https://discord.com/api/webhooks/456/other-token' },
    },
    {
      name: 'username',
      input: { username: 'Pocketbook Home' },
    },
    {
      name: 'avatar',
      input: { avatarUrl: 'https://example.com/pocketbook.png' },
    },
  ])('rejects Save when the $name differs from the tested identity', async ({ input }) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { saveNotificationSettings, sendTestNotification } = await import('@/server-actions/notifications')
    const testResult = await sendTestNotification(validIdentity)
    expect(testResult.ok).toBe(true)
    if (!testResult.ok) throw new Error(testResult.error)

    const result = await saveNotificationSettings({ ...validSettingsInput, ...input }, testResult.receipt)

    expect(result).toEqual({ ok: false, error: verificationRequiredError })
    expect((await storedConfig()).status).toBe('missing')
  })

  it('rejects a tampered verification receipt and writes nothing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { saveNotificationSettings, sendTestNotification } = await import('@/server-actions/notifications')
    const testResult = await sendTestNotification(validIdentity)
    expect(testResult.ok).toBe(true)
    if (!testResult.ok) throw new Error(testResult.error)
    const lastCharacter = testResult.receipt.at(-1)
    const tamperedReceipt = `${testResult.receipt.slice(0, -1)}${lastCharacter === 'A' ? 'B' : 'A'}`

    await expect(saveNotificationSettings(validSettingsInput, tamperedReceipt)).resolves.toEqual({
      ok: false,
      error: verificationRequiredError,
    })
    expect((await storedConfig()).status).toBe('missing')
  })

  it('preserves verification when only master and event switches change', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { saveNotificationSettings, sendTestNotification } = await import('@/server-actions/notifications')
    const testResult = await sendTestNotification(validIdentity)
    expect(testResult.ok).toBe(true)
    if (!testResult.ok) throw new Error(testResult.error)
    await saveNotificationSettings(validSettingsInput, testResult.receipt)
    const verification = (await storedConfig()).config.verification

    const result = await saveNotificationSettings({
      ...validSettingsInput,
      enabled: false,
      events: { ...validSettingsInput.events, backupCompleted: false },
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      settings: expect.objectContaining({
        enabled: false,
        identityVerified: true,
        events: expect.objectContaining({ backupCompleted: false }),
      }),
    }))
    expect((await storedConfig()).config.verification).toEqual(verification)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('uses a blank webhook only for an already verified matching saved identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { saveNotificationSettings, sendTestNotification } = await import('@/server-actions/notifications')
    const testResult = await sendTestNotification(validIdentity)
    expect(testResult.ok).toBe(true)
    if (!testResult.ok) throw new Error(testResult.error)
    await saveNotificationSettings(validSettingsInput, testResult.receipt)
    const verification = (await storedConfig()).config.verification

    const result = await saveNotificationSettings({
      ...validSettingsInput,
      enabled: false,
      webhookUrl: '',
      events: { ...validSettingsInput.events, recurringActivity: false },
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      settings: expect.objectContaining({
        webhookUrl: validIdentity.webhookUrl,
        identityVerified: true,
      }),
    }))
    expect((await storedConfig()).config).toEqual(expect.objectContaining({
      webhookUrl: validIdentity.webhookUrl,
      verification,
    }))
  })

  it('does not let a blank webhook bootstrap an identity when no webhook is saved', async () => {
    const { saveNotificationSettings } = await import('@/server-actions/notifications')

    await expect(saveNotificationSettings({
      ...validSettingsInput,
      webhookUrl: '',
    })).resolves.toEqual({ ok: false, error: verificationRequiredError })
    expect((await storedConfig()).status).toBe('missing')
  })

  it('does not let a blank webhook bootstrap a legacy unverified identity', async () => {
    const legacyConfig = {
      version: 1,
      enabled: false,
      ...validIdentity,
      events: DEFAULT_NOTIFICATION_CONFIG.events,
    }
    await writeFile(
      process.env.PB_NOTIFICATION_CONFIG_PATH!,
      `${JSON.stringify(legacyConfig, null, 2)}\n`,
      { mode: 0o600 },
    )
    const { saveNotificationSettings } = await import('@/server-actions/notifications')

    await expect(saveNotificationSettings({
      ...validSettingsInput,
      webhookUrl: '',
    })).resolves.toEqual({ ok: false, error: verificationRequiredError })
    expect(JSON.parse(await readFile(process.env.PB_NOTIFICATION_CONFIG_PATH!, 'utf8')).version).toBe(1)
  })

  it('disconnects and removes the webhook secret and verification', async () => {
    const { disconnectDiscordNotifications } = await import('@/server-actions/notifications')
    await writeNotificationConfig(verifiedConfig(), process.env.PB_NOTIFICATION_CONFIG_PATH)

    const result = await disconnectDiscordNotifications()

    expect(result.settings.configured).toBe(false)
    expect(result.settings.webhookUrl).toBeNull()
    expect(result.settings.identityVerified).toBe(false)
    expect((await storedConfig()).config).toEqual(expect.objectContaining({
      webhookUrl: null,
      verification: null,
    }))
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
  ])('returns a useful Save validation error for $name', async ({ input, error }) => {
    const { saveNotificationSettings } = await import('@/server-actions/notifications')

    const result = await saveNotificationSettings({ ...validSettingsInput, ...input })

    expect(result).toEqual({ ok: false, error })
    expect((await storedConfig()).status).toBe('missing')
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
  ])('returns a useful Test validation error for $name without fetching', async ({ input, error }) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { sendTestNotification } = await import('@/server-actions/notifications')

    const result = await sendTestNotification({ ...validIdentity, ...input })

    expect(result).toEqual({ ok: false, error })
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await storedConfig()).status).toBe('missing')
  })

  it('returns a safe error when verified notification settings cannot be written', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { saveNotificationSettings, sendTestNotification } = await import('@/server-actions/notifications')
    const testResult = await sendTestNotification(validIdentity)
    expect(testResult.ok).toBe(true)
    if (!testResult.ok) throw new Error(testResult.error)
    const directory = await mkdtemp(join(tmpdir(), 'pocketbook-notification-actions-blocked-'))
    const blocker = join(directory, 'blocker')
    await writeFile(blocker, 'not a directory')
    process.env.PB_NOTIFICATION_CONFIG_PATH = join(blocker, 'notifications.json')

    await expect(saveNotificationSettings(validSettingsInput, testResult.receipt)).resolves.toEqual({
      ok: false,
      error: 'Could not save notification settings. Check that the notification data directory is writable.',
    })
  })

  it.each([
    [401, 'Discord rejected this webhook. Check the URL and try again.'],
    [404, 'Discord rejected this webhook. Check the URL and try again.'],
    [429, 'Discord is rate-limiting tests. Wait a moment and try again.'],
    [500, 'Discord did not accept the test notification.'],
    [418, 'Discord did not accept the test notification.'],
  ])('maps Discord HTTP %i to a safe Test error and writes nothing', async (status, error) => {
    const secretBody = `Discord debug body containing ${validIdentity.webhookUrl}`
    const fetchMock = vi.fn().mockResolvedValue(new Response(secretBody, { status }))
    vi.stubGlobal('fetch', fetchMock)
    const { sendTestNotification } = await import('@/server-actions/notifications')

    const result = await sendTestNotification(validIdentity)

    expect(result).toEqual({ ok: false, error })
    expect(result.error).not.toContain(secretBody)
    expect(result.error).not.toContain(validIdentity.webhookUrl)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect((await storedConfig()).status).toBe('missing')
  })

  it('maps a Discord network rejection to a safe Test error and writes nothing', async () => {
    const networkError = `network failed for ${validIdentity.webhookUrl}`
    const fetchMock = vi.fn().mockRejectedValue(new Error(networkError))
    vi.stubGlobal('fetch', fetchMock)
    const { sendTestNotification } = await import('@/server-actions/notifications')

    const result = await sendTestNotification(validIdentity)

    expect(result).toEqual({ ok: false, error: 'Discord did not accept the test notification.' })
    expect(result.error).not.toContain(networkError)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect((await storedConfig()).status).toBe('missing')
  })

  it('maps a Discord timeout to a safe Test error and writes nothing', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('timed out with secret response')))
      })
    )) as typeof fetch
    vi.stubGlobal('fetch', fetchMock)
    const { sendTestNotification } = await import('@/server-actions/notifications')

    const resultPromise = sendTestNotification(validIdentity)
    await vi.advanceTimersByTimeAsync(5000)
    const result = await resultPromise

    expect(result).toEqual({ ok: false, error: 'Discord did not accept the test notification.' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect((await storedConfig()).status).toBe('missing')
  })
})
