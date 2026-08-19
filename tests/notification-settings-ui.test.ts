import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'app/(app)/settings/NotificationSettings.tsx'),
  'utf8',
)

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)

  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)

  return source.slice(startIndex, endIndex)
}

describe('notification settings webhook field', () => {
  it('shows the stored webhook in a visible URL field and retains it after save', () => {
    const webhookBlock = sourceBetween('id="discord-webhook"', 'id="discord-username"')

    expect(source).toContain("useState(initialSettings.webhookUrl ?? '')")
    expect(webhookBlock).toContain('type="url"')
    expect(webhookBlock).not.toContain('type="password"')
    expect(webhookBlock).toContain('autoComplete="off"')
    expect(webhookBlock).toContain('autoCapitalize="none"')
    expect(webhookBlock).toContain('spellCheck={false}')
    expect(webhookBlock).toContain('placeholder="https://discord.com/api/webhooks/123456789/token"')
    expect(source).toContain("setWebhookUrl(result.settings.webhookUrl ?? '')")
  })

  it('describes the webhook field with its privacy helper', () => {
    const webhookBlock = sourceBetween('id="discord-webhook"', 'id="discord-username"')

    expect(webhookBlock).toContain('aria-describedby="discord-webhook-help"')
    expect(webhookBlock).toContain('id="discord-webhook-help"')
    expect(webhookBlock).toContain('This URL can post to your Discord channel. Keep it private.')
  })

  it('uses a generic transport error without masking action validation errors', () => {
    expect(source).toContain("toast.error('Could not save notification settings. Try again.')")
    expect(source).not.toContain('Check the webhook and avatar URLs, then try again.')
  })
})
