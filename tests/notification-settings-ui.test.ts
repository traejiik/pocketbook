import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'app/(app)/settings/NotificationSettings.tsx'),
  'utf8',
)

function textBetween(text: string, start: string, end: string) {
  const startIndex = text.indexOf(start)

  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(text.indexOf(start, startIndex + start.length)).toBe(-1)

  const endIndex = text.indexOf(end, startIndex + start.length)
  expect(endIndex).toBeGreaterThan(startIndex)
  expect(text.indexOf(end, endIndex + end.length)).toBe(-1)

  return text.slice(startIndex, endIndex)
}

function sourceBetween(start: string, end: string) {
  return textBetween(source, start, end)
}

function expectInOrder(text: string, snippets: string[]) {
  let previousIndex = -1

  for (const snippet of snippets) {
    const index = text.indexOf(snippet)
    expect(index).toBeGreaterThan(previousIndex)
    previousIndex = index
  }
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
    const sendTestBlock = sourceBetween('  function sendTest() {', '\n\n  const previewAvatar')
    const failedTestBlock = textBetween(
      sendTestBlock,
      '        if (!result.ok) {',
      '        setTransientVerification({',
    )
    const successfulTestBlock = textBetween(
      sendTestBlock,
      '        setTransientVerification({',
      '      } catch {',
    )
    const caughtTestBlock = textBetween(
      sendTestBlock,
      '      } catch {',
      '    })\n  }',
    )
    const footerBlock = sourceBetween(
      '<div className="flex flex-wrap items-center justify-between',
      '</section>',
    )

    expectInOrder(sendTestBlock, [
      'const testedIdentity = {',
      'const testedIdentityKey = notificationIdentityKey(testedIdentity)',
      'startTransition(async () => {',
      'await sendTestNotification(testedIdentity)',
    ])
    expect(sendTestBlock).toContain('webhookUrl,')
    expect(sendTestBlock).toContain('username: settings.username,')
    expect(sendTestBlock).toContain('avatarUrl: settings.avatarUrl,')
    expectInOrder(failedTestBlock, [
      'setTransientVerification(null)',
      'toast.error(result.error)',
      'return',
    ])
    expectInOrder(successfulTestBlock, [
      'identityKey: testedIdentityKey,',
      'receipt: result.receipt,',
      'expiresAt: result.expiresAt,',
      "toast.success('Test notification sent. Settings can now be saved.')",
    ])
    expectInOrder(caughtTestBlock, [
      'setTransientVerification(null)',
      "toast.error('Could not send test notification. Try again.')",
    ])
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
    const stateDerivationBlock = sourceBetween(
      '  const initialIdentityKey = notificationIdentityKey({',
      '\n\n  useEffect(() => {',
    )
    const initialIdentityBlock = textBetween(
      stateDerivationBlock,
      '  const initialIdentityKey = notificationIdentityKey({',
      '\n  const [settings, setSettings]',
    )
    const currentIdentityBlock = textBetween(
      stateDerivationBlock,
      '  const currentIdentity = {',
      '\n  const currentIdentityKey =',
    )
    const transientMatchesBlock = textBetween(
      stateDerivationBlock,
      '  const transientMatches =',
      '\n  const canSave =',
    )
    const canSaveBlock = sourceBetween('  const canSave =', '\n\n  useEffect(() => {')

    expectInOrder(stateDerivationBlock, [
      'const initialIdentityKey = notificationIdentityKey({',
      'initialSettings.identityVerified ? initialIdentityKey : null',
      'const currentIdentity = {',
      'const currentIdentityKey = notificationIdentityKey(currentIdentity)',
      'const transientMatches =',
      'const canSave =',
    ])
    expectInOrder(initialIdentityBlock, [
      "webhookUrl: initialSettings.webhookUrl ?? '',",
      'username: initialSettings.username,',
      'avatarUrl: initialSettings.avatarUrl,',
    ])
    expectInOrder(currentIdentityBlock, [
      'webhookUrl,',
      'username: settings.username,',
      'avatarUrl: settings.avatarUrl,',
    ])
    expect(transientMatchesBlock).toContain(
      'transientVerification?.identityKey === currentIdentityKey',
    )
    expect(transientMatchesBlock).toContain(
      'Date.parse(transientVerification.expiresAt) > Date.now()',
    )
    expect(canSaveBlock).toContain(
      'const canSave = persistedIdentityKey === currentIdentityKey || transientMatches',
    )
  })

  it('keeps the established notification layout and labels without verification chrome', () => {
    const presetBlock = sourceBetween(
      'const EVENT_OPTIONS: Array<{',
      '\n]\n\nexport function NotificationSettings',
    )
    const jsxBlock = sourceBetween(
      '  return (\n    <section id="notifications">',
      '\n  )\n}',
    )

    // Intentionally locks all returned Notifications markup, classes, copy, and hierarchy.
    // Update this fingerprint only when a layout change has been explicitly approved.
    expect(createHash('sha256').update(jsxBlock).digest('hex')).toBe(
      '9249785cea3f8e06a8476051f805894ac52d5216bbbec1a5a52e74ea713e1199',
    )

    expect(jsxBlock).toContain('<section id="notifications">')
    expect(jsxBlock).toContain('className="mb-3 flex items-center gap-2"')
    expect(jsxBlock).toContain('className="calm-card overflow-hidden"')
    expect(jsxBlock).toContain('className="space-y-5 p-6"')
    expect(jsxBlock).toContain('className="grid gap-4 md:grid-cols-2"')
    expect(jsxBlock).toContain('className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]"')
    expect(jsxBlock).toContain('className="border-t border-border px-6 py-5"')
    expect(jsxBlock).toContain('className="divide-y divide-border"')
    expect(jsxBlock).toContain(
      'className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-secondary/20 px-6 py-4"',
    )

    expect(jsxBlock).toContain('Discord webhook URL')
    expect(jsxBlock).toContain('Discord preview')
    expect(jsxBlock).toContain('Message presets')
    expect(jsxBlock).toContain('Send test')
    expect(jsxBlock).toContain('Save settings')
    expect(jsxBlock).toContain('aria-label="Enable Discord notifications"')
    expect(jsxBlock).toContain('{EVENT_OPTIONS.map((event) => (')
    expect(jsxBlock).toContain('checked={settings.events[event.key]}')
    expect(jsxBlock.match(/<Input\b/g) ?? []).toHaveLength(3)
    expect(jsxBlock.match(/<Label\b/g) ?? []).toHaveLength(3)
    expect(jsxBlock.match(/<Switch\b/g) ?? []).toHaveLength(2)
    expect(jsxBlock.match(/<Button\b/g) ?? []).toHaveLength(3)
    expect(jsxBlock.match(/<p\b/g) ?? []).toHaveLength(2)
    expect(source.match(/^\s*\{ key: '/gm) ?? []).toHaveLength(6)

    for (const [label, preview] of [
      ['System alerts', 'Pocketbook stopped unexpectedly'],
      ['Scheduled-job failures', 'FX sync failed · next retry in 15 minutes'],
      ['Recurring activity', 'Logged 3 recurring transactions'],
      ['Monthly insight ready', 'July 2026 · llama3.1:8b'],
      ['Backup completed', 'pocketbook-20260819-023000.dump · 14 kept'],
      ['Backup failed', 'Database connection unavailable'],
    ] as const) {
      expect(presetBlock).toContain(`label: '${label}', preview: '${preview}'`)
    }

    for (const forbidden of [
      'type="file"',
      'Upload',
      'upload',
      'accept="image',
      'ImgBB',
      'imgbb',
      '<Badge',
      'status-pill',
      'rounded-full px-',
      'role="status"',
      'helper-row',
      'Test required',
      'Verified just now',
      'Verification status',
      'Test passed',
      'Test succeeded',
      'settings.status',
      'identityVerified',
      'verifiedAt',
      '<a ',
      'href=',
    ]) {
      expect(jsxBlock).not.toContain(forbidden)
    }
    expect(source).not.toContain("from '@/components/ui/badge'")
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
    const effectBlock = sourceBetween('  useEffect(() => {', '\n\n  function save()')
    const saveBlock = sourceBetween('  function save() {', '\n\n  function disconnect()')

    expectInOrder(effectBlock, [
      'const remaining = Date.parse(transientVerification.expiresAt) - Date.now()',
      'const timer = window.setTimeout(',
      '() => setTransientVerification(null)',
      'Math.max(0, remaining)',
      'return () => window.clearTimeout(timer)',
      '}, [transientVerification])',
    ])
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
    const saveBlock = sourceBetween('  function save() {', '\n\n  function disconnect()')
    const failedSaveBlock = textBetween(
      saveBlock,
      '        if (!result.ok) {',
      '        setSettings(result.settings)',
    )
    const successfulSaveBlock = textBetween(
      saveBlock,
      '        setSettings(result.settings)',
      '      } catch {',
    )

    expectInOrder(failedSaveBlock, [
      "result.error.startsWith('Send a successful test')",
      'setTransientVerification(null)',
      'toast.error(result.error)',
      'return',
    ])
    expectInOrder(successfulSaveBlock, [
      'setSettings(result.settings)',
      "setWebhookUrl(result.settings.webhookUrl ?? '')",
      'const returnedIdentityKey = notificationIdentityKey({',
      "webhookUrl: result.settings.webhookUrl ?? '',",
      'username: result.settings.username,',
      'avatarUrl: result.settings.avatarUrl,',
      'setPersistedIdentityKey(result.settings.identityVerified ? returnedIdentityKey : null)',
      'setTransientVerification(null)',
      "toast.success('Notification settings saved')",
    ])
  })

  it('clears persisted and transient client proof after disconnecting', () => {
    const disconnectBlock = sourceBetween('  function disconnect() {', '\n\n  function sendTest()')

    expectInOrder(disconnectBlock, [
      'await disconnectDiscordNotifications()',
      'setSettings(result.settings)',
      "setWebhookUrl('')",
      'setPersistedIdentityKey(null)',
      'setTransientVerification(null)',
      "toast.success('Discord disconnected')",
    ])
  })
})
