/**
 * Best-effort Discord notifications. Posts to the webhook in PB_DISCORD_WEBHOOK
 * (the same variable the entrypoint and the fx-sync/db-backup sidecars use).
 * Never throws and never blocks the caller for more than 5s — a notification
 * failure must not fail the operation being reported.
 */
export async function notifyDiscord(content: string): Promise<void> {
  const webhook = process.env.PB_DISCORD_WEBHOOK
  if (!webhook) return

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Discord rejects messages over 2000 characters.
      body: JSON.stringify({ content: content.slice(0, 1900) }),
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
