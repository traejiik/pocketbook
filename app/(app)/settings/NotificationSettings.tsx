'use client'

import { useState, useTransition } from 'react'
import { Bell, Check, Link2Off, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { NotificationEventKey, PublicNotificationSettings } from '@/lib/notifications/types'
import {
  disconnectDiscordNotifications,
  saveNotificationSettings,
  sendTestNotification,
} from '@/server-actions/notifications'

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

export function NotificationSettings({ initialSettings }: { initialSettings: PublicNotificationSettings }) {
  const [settings, setSettings] = useState(initialSettings)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      try {
        const result = await saveNotificationSettings({
          enabled: settings.enabled,
          webhookUrl,
          username: settings.username,
          avatarUrl: settings.avatarUrl,
          events: settings.events,
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        setSettings(result.settings)
        setWebhookUrl('')
        toast.success('Notification settings saved')
      } catch {
        toast.error('Check the webhook and avatar URLs, then try again.')
      }
    })
  }

  function disconnect() {
    startTransition(async () => {
      const result = await disconnectDiscordNotifications()
      setSettings(result.settings)
      setWebhookUrl('')
      toast.success('Discord disconnected')
    })
  }

  function sendTest() {
    startTransition(async () => {
      const result = await sendTestNotification()
      if (result.ok) toast.success('Test notification sent')
      else toast.error(result.error)
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
                type="password"
                autoComplete="off"
                value={webhookUrl}
                onChange={(event) => setWebhookUrl(event.target.value)}
                placeholder={settings.configured ? 'Connected · paste to replace' : 'https://discord.com/api/webhooks/…'}
              />
              <p className="text-[10.5px] text-muted-foreground">
                Stored only in Pocketbook&apos;s protected data volume and never returned to this page.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discord-username">Username</Label>
              <Input
                id="discord-username"
                maxLength={80}
                value={settings.username}
                onChange={(event) => setSettings((current) => ({ ...current, username: event.target.value }))}
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
                onChange={(event) => setSettings((current) => ({
                  ...current,
                  avatarUrl: event.target.value || null,
                }))}
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
            <Button variant="outline" size="sm" disabled={isPending || !settings.configured} onClick={sendTest}>
              <Send className="mr-1.5 h-3.5 w-3.5" />Send test
            </Button>
            {settings.configured && (
              <Button variant="ghost" size="sm" disabled={isPending} onClick={disconnect}>
                <Link2Off className="mr-1.5 h-3.5 w-3.5" />Disconnect
              </Button>
            )}
          </div>
          <Button size="sm" disabled={isPending} onClick={save}>
            <Check className="mr-1.5 h-3.5 w-3.5" />Save settings
          </Button>
        </div>
      </div>
    </section>
  )
}
