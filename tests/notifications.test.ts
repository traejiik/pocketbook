import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_NOTIFICATION_CONFIG, writeNotificationConfig } from '@/lib/notifications/config'
import {
  deliverNotificationWithConfig,
  DISCORD_TIMEOUT_MS,
  renderNotification,
  sendNotification,
} from '@/lib/notifications/send'

async function configuredPath(overrides: Partial<typeof DEFAULT_NOTIFICATION_CONFIG> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'pocketbook-notify-send-'))
  const path = join(dir, 'notifications.json')
  await writeNotificationConfig({
    ...DEFAULT_NOTIFICATION_CONFIG,
    enabled: true,
    webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
    username: 'Pocketbook Home',
    avatarUrl: 'https://example.com/avatar.png',
    ...overrides,
  }, path)
  return path
}

describe('notification presets', () => {
  it('renders recurring activity from typed live data', () => {
    expect(renderNotification({
      type: 'recurringActivity',
      count: 2,
      lines: ['Netflix · −4,490 HUF', 'Rent · −180,000 HUF'],
    })).toEqual(expect.objectContaining({
      eventKey: 'recurringActivity',
      title: '🔁 Logged 2 recurring transactions',
      description: 'Netflix · −4,490 HUF\nRent · −180,000 HUF',
    }))
  })

  it('renders all six configurable event presets', () => {
    const events = [
      { type: 'systemAlerts', title: 'System alert', description: 'Something stopped' },
      { type: 'scheduledJobFailures', job: 'fx-sync', error: 'offline', scheduledFor: '2026-08-19T03:00:00Z' },
      { type: 'recurringActivity', count: 1, lines: ['Rent · −180,000 HUF'] },
      { type: 'monthlyInsightReady', month: 'July 2026', model: 'llama3.1:8b' },
      { type: 'backupCompleted', filename: 'pocketbook.dump', size: '2 MB', kept: 14, source: 'scheduled' },
      { type: 'backupFailed', error: 'offline', source: 'manual' },
    ] as const

    expect(events.map((event) => renderNotification(event).eventKey)).toEqual([
      'systemAlerts',
      'scheduledJobFailures',
      'recurringActivity',
      'monthlyInsightReady',
      'backupCompleted',
      'backupFailed',
    ])
  })
})

describe('Discord delivery', () => {
  it('delivers a test message from an unsaved explicit configuration', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const config = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      webhookUrl: 'https://discord.com/api/webhooks/999/unsaved-token',
      username: 'Unsaved Pocketbook',
      avatarUrl: 'https://i.ibb.co/logo.png',
    }

    const result = await deliverNotificationWithConfig(config, { type: 'test' }, {
      configPath: join(await mkdtemp(join(tmpdir(), 'pocketbook-notify-unsaved-')), 'missing.json'),
      fetchImpl,
    })

    expect(result).toEqual({ delivered: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://discord.com/api/webhooks/999/unsaved-token?wait=true')
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({
      username: 'Unsaved Pocketbook',
      avatar_url: 'https://i.ibb.co/logo.png',
    }))
  })

  it.each([401, 404, 429])(
    'returns the exact Discord HTTP %i delivery failure for an unsaved explicit configuration',
    async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status }))
      const config = {
        ...DEFAULT_NOTIFICATION_CONFIG,
        webhookUrl: 'https://discord.com/api/webhooks/999/unsaved-token',
      }

      await expect(deliverNotificationWithConfig(config, { type: 'test' }, { fetchImpl })).resolves.toEqual({
        delivered: false,
        reason: 'delivery-failed',
        status,
      })
    },
  )

  it('respects the master and event switches', async () => {
    const masterOff = await configuredPath({ enabled: false })
    const eventOff = await configuredPath({
      events: { ...DEFAULT_NOTIFICATION_CONFIG.events, backupCompleted: false },
    })
    const fetchImpl = vi.fn()

    await expect(sendNotification({
      type: 'backupCompleted', filename: 'pocketbook.dump', size: '2 MB', kept: 14, source: 'scheduled',
    }, { configPath: masterOff, fetchImpl })).resolves.toEqual({ delivered: false, reason: 'disabled' })
    await expect(sendNotification({
      type: 'backupCompleted', filename: 'pocketbook.dump', size: '2 MB', kept: 14, source: 'scheduled',
    }, { configPath: eventOff, fetchImpl })).resolves.toEqual({ delivered: false, reason: 'event-disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends a safe Discord payload with configured identity and confirmation enabled', async () => {
    const configPath = await configuredPath()
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    const result = await sendNotification({
      type: 'monthlyInsightReady', month: 'July 2026', model: 'llama3.1:8b',
    }, { configPath, fetchImpl, instanceName: 'x'.repeat(500) })

    expect(result).toEqual({ delivered: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://discord.com/api/webhooks/123/token-value?wait=true')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({
      username: 'Pocketbook Home',
      avatar_url: 'https://example.com/avatar.png',
      allowed_mentions: { parse: [] },
      embeds: [expect.objectContaining({
        title: '🤖 Monthly insight ready',
        footer: { text: expect.stringMatching(/^Pocketbook · x+…$/) },
      })],
    }))
    expect(JSON.parse(String(init.body)).embeds[0].footer.text).toHaveLength(256)
  })

  it('lets a test message bypass disabled switches but still requires a configured webhook', async () => {
    const configPath = await configuredPath({ enabled: false })
    const missingPath = join(await mkdtemp(join(tmpdir(), 'pocketbook-notify-missing-')), 'missing.json')
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    await expect(sendNotification({ type: 'test' }, { configPath, fetchImpl })).resolves.toEqual({ delivered: true })
    await expect(sendNotification({ type: 'test' }, { configPath: missingPath, fetchImpl })).resolves.toEqual({
      delivered: false,
      reason: 'not-configured',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('aborts Discord delivery after five seconds', async () => {
    expect(DISCORD_TIMEOUT_MS).toBe(5000)
    const configPath = await configuredPath()
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })) as typeof fetch

    await expect(sendNotification(
      { type: 'test' },
      { configPath, fetchImpl, timeoutMs: 10 },
    )).resolves.toEqual({ delivered: false, reason: 'delivery-failed' })
  })
})
