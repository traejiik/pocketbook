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

describe('notification settings verification behaviour', () => {
  it('tests the current unsaved identity and gates Save on matching proof', () => {
    const sendTestBlock = sourceBetween('function sendTest()', 'const previewAvatar')
    const footerBlock = sourceBetween(
      '<div className="flex flex-wrap items-center justify-between',
      '</section>',
    )

    expect(sendTestBlock).toContain('const testedIdentity = {')
    expect(sendTestBlock).toContain('webhookUrl,')
    expect(sendTestBlock).toContain('username: settings.username,')
    expect(sendTestBlock).toContain('avatarUrl: settings.avatarUrl,')
    expect(sendTestBlock).toContain('const testedIdentityKey = notificationIdentityKey(testedIdentity)')
    expect(sendTestBlock).toContain('sendTestNotification(testedIdentity)')
    expect(sendTestBlock).toContain('identityKey: testedIdentityKey,')
    expect(sendTestBlock).toContain('receipt: result.receipt,')
    expect(sendTestBlock).toContain('expiresAt: result.expiresAt,')
    expect(sendTestBlock).toContain(
      "toast.success('Test notification sent. Settings can now be saved.')",
    )
    expect(footerBlock).not.toContain('!settings.configured')
    expect(footerBlock).toContain(
      'disabled={isPending || !webhookUrl.trim() || !settings.username.trim()}',
    )
    expect(footerBlock).toContain('disabled={isPending || !canSave}')
    expect(footerBlock).toContain(
      "title={!canSave ? 'Send a successful test before saving this identity.' : undefined}",
    )
  })

  it('trusts only an initially verified persisted identity or an unexpired matching receipt', () => {
    expect(source).toContain('const initialIdentityKey = notificationIdentityKey({')
    expect(source).toContain('initialSettings.identityVerified ? initialIdentityKey : null')
    expect(source).toContain('const currentIdentityKey = notificationIdentityKey(currentIdentity)')
    expect(source).toContain(
      'const canSave = persistedIdentityKey === currentIdentityKey || transientMatches',
    )
  })

  it('keeps the established notification layout and labels without verification chrome', () => {
    expect(source).toContain('Discord webhook URL')
    expect(source).toContain('Discord preview')
    expect(source).toContain('Message presets')
    expect(source).toContain('Send test')
    expect(source).toContain('Save settings')
    expect(source).not.toContain('Test required')
    expect(source).not.toContain('Verified just now')
  })

  it('invalidates transient proof only when an identity field changes', () => {
    const masterSwitchBlock = sourceBetween(
      'aria-label="Enable Discord notifications"',
      '<div className="grid gap-4 md:grid-cols-2">',
    )
    const webhookBlock = sourceBetween('id="discord-webhook"', 'id="discord-username"')
    const usernameBlock = sourceBetween('id="discord-username"', 'id="discord-avatar"')
    const avatarBlock = sourceBetween('id="discord-avatar"', 'Discord preview')
    const eventSwitchesBlock = sourceBetween(
      '{EVENT_OPTIONS.map((event) => (',
      '<div className="flex flex-wrap items-center justify-between',
    )

    expect(webhookBlock).toContain('setTransientVerification(null)')
    expect(usernameBlock).toContain('setTransientVerification(null)')
    expect(avatarBlock).toContain('setTransientVerification(null)')
    expect(masterSwitchBlock).not.toContain('setTransientVerification')
    expect(eventSwitchesBlock).not.toContain('setTransientVerification')
  })

  it('expires transient proof and forwards only a receipt matching the current identity', () => {
    const saveBlock = sourceBetween('function save()', 'function disconnect()')

    expect(source).toContain('Math.max(0, remaining)')
    expect(source).toContain('return () => window.clearTimeout(timer)')
    expect(source).toContain('transientVerification?.identityKey === currentIdentityKey')
    expect(source).toContain('Date.parse(transientVerification.expiresAt) > Date.now()')
    expect(saveBlock).toContain(
      'const matchingReceipt = transientVerification?.identityKey === currentIdentityKey',
    )
    expect(saveBlock).toContain('? transientVerification.receipt')
    expect(saveBlock).toContain(': null')
    expect(saveBlock).toContain('}, matchingReceipt)')
  })

  it('promotes only verified action results and drops rejected verification proof', () => {
    const saveBlock = sourceBetween('function save()', 'function disconnect()')

    expect(saveBlock).toContain("result.error.startsWith('Send a successful test')")
    expect(saveBlock).toContain('setTransientVerification(null)')
    expect(saveBlock).toContain('const returnedIdentityKey = notificationIdentityKey({')
    expect(saveBlock).toContain(
      'setPersistedIdentityKey(result.settings.identityVerified ? returnedIdentityKey : null)',
    )
  })

  it('clears persisted and transient client proof after disconnecting', () => {
    const disconnectBlock = sourceBetween('function disconnect()', 'function sendTest()')

    expect(disconnectBlock).toContain('setPersistedIdentityKey(null)')
    expect(disconnectBlock).toContain('setTransientVerification(null)')
  })
})
