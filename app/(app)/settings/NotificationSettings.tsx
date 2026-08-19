'use client'

import { useEffect, useState, useTransition } from 'react'
import { Bell, Check, Link2Off, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { notificationIdentityKey } from '@/lib/notifications/identity'
import type { AuthenticatedNotificationSettings, NotificationEventKey } from '@/lib/notifications/types'
import {
  disconnectDiscordNotifications,
  saveNotificationSettings,
  sendTestNotification,
} from '@/server-actions/notifications'

type TransientVerification = {
  identityKey: string
  receipt: string
  expiresAt: string
}

const EVENT_OPTIONS: Array<{
  key: NotificationEventKey
  label: string
  preview: string
}> = [
  { key: 'systemAlerts', label: 'System alerts', preview: 'Pocketbook stopped unexpectedly' },
  { key: 'scheduledJobFailures', label: 'Scheduled-job failures', preview: 'FX sync failed · next retry in 15 minutes' },
  { key: 'recurringActivity', label: 'Recurring activity', preview: 'Logged 3 recurring transactions' },
  { key: 'monthlyInsightReady', label: 'Monthly insight ready', preview: 'July 2026 · llama3.1:8b' },
  { key: 'backupCompleted', label: 'Backup completed', preview: 'pocketbook-20260819-023000.dump · 14 kept' },
  { key: 'backupFailed', label: 'Backup failed', preview: 'Database connection unavailable' },
]

export function NotificationSettings({ initialSettings }: { initialSettings: AuthenticatedNotificationSettings }) {
  const initialIdentityKey = notificationIdentityKey({
    webhookUrl: initialSettings.webhookUrl ?? '',
    username: initialSettings.username,
    avatarUrl: initialSettings.avatarUrl,
  })
  const [settings, setSettings] = useState(initialSettings)
  const [webhookUrl, setWebhookUrl] = useState(initialSettings.webhookUrl ?? '')
  const [persistedIdentityKey, setPersistedIdentityKey] = useState<string | null>(
    initialSettings.identityVerified ? initialIdentityKey : null,
  )
  const [transientVerification, setTransientVerification] = useState<TransientVerification | null>(null)
  const [isPending, startTransition] = useTransition()

  const currentIdentity = {
    webhookUrl,
    username: settings.username,
    avatarUrl: settings.avatarUrl,
  }
  const currentIdentityKey = notificationIdentityKey(currentIdentity)
  const transientMatches = transientVerification?.identityKey === currentIdentityKey
    // eslint-disable-next-line react-hooks/purity -- A delayed expiry timer must not keep Save enabled.
    && Date.parse(transientVerification.expiresAt) > Date.now()
  const canSave = persistedIdentityKey === currentIdentityKey || transientMatches

  useEffect(() => {
    if (!transientVerification) return
    const remaining = Date.parse(transientVerification.expiresAt) - Date.now()
    const timer = window.setTimeout(
      () => setTransientVerification(null),
      Math.max(0, remaining),
    )
    return () => window.clearTimeout(timer)
  }, [transientVerification])

  function save() {
    startTransition(async () => {
      try {
        const matchingReceipt = transientVerification?.identityKey === currentIdentityKey
          ? transientVerification.receipt
          : null
        const result = await saveNotificationSettings({
          enabled: settings.enabled,
          webhookUrl,
          username: settings.username,
          avatarUrl: settings.avatarUrl,
          events: settings.events,
        }, matchingReceipt)
        if (!result.ok) {
          if (result.error.startsWith('Send a successful test')) {
            setTransientVerification(null)
          }
          toast.error(result.error)
          return
        }
        setSettings(result.settings)
        setWebhookUrl(result.settings.webhookUrl ?? '')
        const returnedIdentityKey = notificationIdentityKey({
          webhookUrl: result.settings.webhookUrl ?? '',
          username: result.settings.username,
          avatarUrl: result.settings.avatarUrl,
        })
        setPersistedIdentityKey(result.settings.identityVerified ? returnedIdentityKey : null)
        setTransientVerification(null)
        toast.success('Notification settings saved')
      } catch {
        toast.error('Could not save notification settings. Try again.')
      }
    })
  }

  function disconnect() {
    startTransition(async () => {
      const result = await disconnectDiscordNotifications()
      setSettings(result.settings)
      setWebhookUrl('')
      setPersistedIdentityKey(null)
      setTransientVerification(null)
      toast.success('Discord disconnected')
    })
  }

  function sendTest() {
    const testedIdentity = {
      webhookUrl,
      username: settings.username,
      avatarUrl: settings.avatarUrl,
    }
    const testedIdentityKey = notificationIdentityKey(testedIdentity)
    startTransition(async () => {
      try {
        const result = await sendTestNotification(testedIdentity)
        if (!result.ok) {
          setTransientVerification(null)
          toast.error(result.error)
          return
        }
        setTransientVerification({
          identityKey: testedIdentityKey,
          receipt: result.receipt,
          expiresAt: result.expiresAt,
        })
        toast.success('Test notification sent. Settings can now be saved.')
      } catch {
        setTransientVerification(null)
        toast.error('Could not send test notification. Try again.')
      }
    })
  }

  const previewAvatar = settings.avatarUrl

  return (
    <section id="notifications">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-[14px] font-semibold tracking-tight">Notifications</h2>
      </div>
      <div className="calm-card overflow-hidden">
        <div className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="text-[13px] font-medium">Discord notifications</div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                Delivery is best-effort. Finance and backup work never rolls back if Discord is unavailable.
              </div>
            </div>
            <Switch
              aria-label="Enable Discord notifications"
              checked={settings.enabled}
              onCheckedChange={(enabled) => setSettings((current) => ({ ...current, enabled }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="discord-webhook">Discord webhook URL</Label>
              <Input
                id="discord-webhook"
                aria-describedby="discord-webhook-help"
                type="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={webhookUrl}
                onChange={(event) => {
                  setWebhookUrl(event.target.value)
                  setTransientVerification(null)
                }}
                placeholder="https://discord.com/api/webhooks/123456789/token"
              />
              <p id="discord-webhook-help" className="text-[10.5px] text-muted-foreground">
                This URL can post to your Discord channel. Keep it private.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discord-username">Username</Label>
              <Input
                id="discord-username"
                maxLength={80}
                value={settings.username}
                onChange={(event) => {
                  setSettings((current) => ({ ...current, username: event.target.value }))
                  setTransientVerification(null)
                }}
                placeholder="Pocketbook"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-2">
              <Label htmlFor="discord-avatar">Avatar URL <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                id="discord-avatar"
                type="url"
                value={settings.avatarUrl ?? ''}
                onChange={(event) => {
                  setSettings((current) => ({
                    ...current,
                    avatarUrl: event.target.value || null,
                  }))
                  setTransientVerification(null)
                }}
                placeholder="https://example.com/pocketbook.png"
              />
              <p className="text-[10.5px] text-muted-foreground">Must be a publicly reachable HTTPS image.</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/35 p-3">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Discord preview</div>
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-primary/12 bg-cover bg-center text-[12px] font-semibold text-primary"
                  style={previewAvatar ? { backgroundImage: `url(${JSON.stringify(previewAvatar)})` } : undefined}
                >
                  {!previewAvatar && (settings.username.trim().charAt(0) || 'P').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold">{settings.username || 'Pocketbook'} <span className="text-[9px] font-medium text-primary">APP</span></div>
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground">Pocketbook notifications connected</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-6 py-5">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Message presets</div>
          <div className="divide-y divide-border">
            {EVENT_OPTIONS.map((event) => (
              <div key={event.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Switch
                  aria-label={event.label}
                  checked={settings.events[event.key]}
                  onCheckedChange={(enabled) => setSettings((current) => ({
                    ...current,
                    events: { ...current.events, [event.key]: enabled },
                  }))}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium">{event.label}</div>
                  <div className="truncate text-[10.5px] text-muted-foreground">{event.preview}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-secondary/20 px-6 py-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={isPending || !webhookUrl.trim() || !settings.username.trim()} onClick={sendTest}>
              <Send className="mr-1.5 h-3.5 w-3.5" />Send test
            </Button>
            {settings.configured && (
              <Button variant="ghost" size="sm" disabled={isPending} onClick={disconnect}>
                <Link2Off className="mr-1.5 h-3.5 w-3.5" />Disconnect
              </Button>
            )}
          </div>
          <Button
            size="sm"
            disabled={isPending || !canSave}
            title={!canSave ? 'Send a successful test before saving this identity.' : undefined}
            onClick={save}
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />Save settings
          </Button>
        </div>
      </div>
    </section>
  )
}
