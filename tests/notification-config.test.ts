import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_NOTIFICATION_CONFIG,
  notificationConfigPath,
  readNotificationConfig,
  toPublicNotificationSettings,
  validateDiscordWebhookUrl,
  writeNotificationConfig,
} from '@/lib/notifications/config'

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

  it('falls back to disabled defaults when the file is corrupt', async () => {
    const path = await tempConfigPath()
    await writeNotificationConfig(DEFAULT_NOTIFICATION_CONFIG, path)
    await writeFile(path, '{not-json', { mode: 0o600 })

    await expect(readNotificationConfig(path)).resolves.toEqual({
      status: 'invalid',
      config: DEFAULT_NOTIFICATION_CONFIG,
    })
  })

  it('never exposes the stored webhook URL to Settings clients', () => {
    const config = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      webhookUrl: 'https://discord.com/api/webhooks/123/super-secret-token',
    }

    const publicSettings = toPublicNotificationSettings(config, 'ready')

    expect(publicSettings).toEqual(expect.objectContaining({ configured: true, status: 'ready' }))
    expect(JSON.stringify(publicSettings)).not.toContain('super-secret-token')
    expect(publicSettings).not.toHaveProperty('webhookUrl')
  })
})
