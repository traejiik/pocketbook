/**
 * Best-effort Discord notifications. Posts an embed to the webhook in
 * PB_DISCORD_WEBHOOK (the same variable the entrypoint and the
 * fx-sync/db-backup sidecars use). Never throws and never blocks the caller
 * for more than 5s — a notification failure must not fail the operation
 * being reported.
 */

export const DISCORD_GREEN = 0x2ecc71
export const DISCORD_RED = 0xe74c3c
export const DISCORD_BLURPLE = 0x5865f2

export type DiscordNotification = {
  title: string
  description?: string
  /** Embed strip colour; defaults to blurple. */
  color?: number
  fields?: { name: string; value: string; inline?: boolean }[]
}

export async function notifyDiscord(notification: DiscordNotification): Promise<void> {
  const webhook = process.env.PB_DISCORD_WEBHOOK
  if (!webhook) return

  const instance = process.env.PB_INSTANCE_NAME
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Pocketbook',
        embeds: [
          {
            // Discord limits: title 256, description 4096, fields 25.
            title: notification.title.slice(0, 256),
            description: notification.description?.slice(0, 4000),
            color: notification.color ?? DISCORD_BLURPLE,
            fields: notification.fields?.slice(0, 25),
            footer: { text: instance ? `Pocketbook · ${instance}` : 'Pocketbook' },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      console.error(`[notify] Discord webhook returned ${res.status}`)
    }
  } catch (err) {
    console.error('[notify] Discord webhook failed:', err)
  }
}
