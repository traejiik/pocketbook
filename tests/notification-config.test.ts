import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_NOTIFICATION_CONFIG,
  notificationConfigPath,
  readNotificationConfig,
  toAuthenticatedNotificationSettings,
  validateDiscordWebhookUrl,
  writeNotificationConfig,
} from '@/lib/notifications/config'
import { hashNotificationIdentity } from '@/lib/notifications/verification'
import { DEFAULT_NOTIFICATION_EVENTS } from '@/lib/notifications/types'

async function tempConfigPath() {
  const dir = await mkdtemp(join(tmpdir(), 'pocketbook-notifications-'))
  return join(dir, 'nested', 'notifications.json')
}

describe('notification configuration', () => {
  it('uses a local .data path for development runs', () => {
    expect(notificationConfigPath({ NODE_ENV: 'development' }, '/repo/pocketbook')).toBe(
      '/repo/pocketbook/.data/notifications.json',
    )
  })

  it('uses the production data path in production', () => {
    expect(notificationConfigPath({ NODE_ENV: 'production' }, '/repo/pocketbook')).toBe(
      '/data/notifications.json',
    )
  })

  it('prefers the explicit notification config path override', () => {
    expect(
      notificationConfigPath(
        { NODE_ENV: 'production', PB_NOTIFICATION_CONFIG_PATH: '/tmp/pocketbook-notifications.json' },
        '/repo/pocketbook',
      ),
    ).toBe('/tmp/pocketbook-notifications.json')
  })

  it('starts disabled when no configuration file exists', async () => {
    const path = await tempConfigPath()

    await expect(readNotificationConfig(path)).resolves.toEqual({
      status: 'missing',
      config: DEFAULT_NOTIFICATION_CONFIG,
    })
  })

  it('accepts only Discord HTTPS webhook URLs', () => {
    expect(validateDiscordWebhookUrl('https://discord.com/api/webhooks/123/token-value')).toBe(true)
    expect(validateDiscordWebhookUrl('http://discord.com/api/webhooks/123/token-value')).toBe(false)
    expect(validateDiscordWebhookUrl('https://discord.com.evil.test/api/webhooks/123/token')).toBe(false)
    expect(validateDiscordWebhookUrl('https://example.com/api/webhooks/123/token')).toBe(false)
  })

  it('writes validated configuration atomically with mode 0600', async () => {
    const path = await tempConfigPath()
    const config = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      enabled: true,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Pocketbook Home',
      avatarUrl: 'https://example.com/pocketbook.png',
      events: { ...DEFAULT_NOTIFICATION_CONFIG.events, backupCompleted: false },
    }

    await writeNotificationConfig(config, path)

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(config)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    await expect(readNotificationConfig(path)).resolves.toEqual({ status: 'ready', config })
  })

  it('migrates version 1 in memory without rewriting the source file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pocketbook-notify-v1-'))
    const path = join(directory, 'notifications.json')
    const v1 = {
      version: 1,
      enabled: true,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      username: 'Pocketbook',
      avatarUrl: null,
      events: DEFAULT_NOTIFICATION_EVENTS,
    }
    await writeFile(path, `${JSON.stringify(v1, null, 2)}\n`, { mode: 0o600 })

    const result = await readNotificationConfig(path)

    expect(result).toEqual({
      status: 'ready',
      config: { ...v1, version: 2, verification: null },
    })
    expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(1)

    const settings = toAuthenticatedNotificationSettings(result.config, result.status)
    expect(settings).toEqual(expect.objectContaining({
      identityVerified: false,
      verifiedAt: null,
    }))
    expect(settings).not.toHaveProperty('verification')
  })

  it('falls back to disabled defaults when the file is corrupt', async () => {
    const path = await tempConfigPath()
    await writeNotificationConfig(DEFAULT_NOTIFICATION_CONFIG, path)
    await writeFile(path, '{not-json', { mode: 0o600 })

    await expect(readNotificationConfig(path)).resolves.toEqual({
      status: 'invalid',
      config: DEFAULT_NOTIFICATION_CONFIG,
    })
  })

  it('returns the stored webhook URL to authenticated Settings clients', () => {
    const config = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      webhookUrl: 'https://discord.com/api/webhooks/123/super-secret-token',
    }

    const settings = toAuthenticatedNotificationSettings(config, 'ready')

    expect(settings).toEqual({
      version: 2,
      enabled: false,
      webhookUrl: 'https://discord.com/api/webhooks/123/super-secret-token',
      username: 'Pocketbook',
      avatarUrl: null,
      events: DEFAULT_NOTIFICATION_EVENTS,
      configured: true,
      status: 'ready',
      identityVerified: false,
      verifiedAt: null,
    })
    expect(settings).not.toHaveProperty('verification')
  })

  it('projects only authenticated verification status for a matching v2 identity', () => {
    const config = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
      verification: {
        identityHash: hashNotificationIdentity({
          webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
          username: DEFAULT_NOTIFICATION_CONFIG.username,
          avatarUrl: DEFAULT_NOTIFICATION_CONFIG.avatarUrl,
        }),
        verifiedAt: '2026-08-19T12:00:00.000Z',
      },
    }

    const settings = toAuthenticatedNotificationSettings(config, 'ready')

    expect(settings).toEqual(expect.objectContaining({
      identityVerified: true,
      verifiedAt: '2026-08-19T12:00:00.000Z',
    }))
    expect(settings).not.toHaveProperty('verification')
  })
})
