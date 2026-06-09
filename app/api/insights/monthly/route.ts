import { prisma } from '@/lib/prisma'
import { generateAndSaveInsight } from '@/lib/insights-generation'
import { notifyDiscord } from '@/lib/notify'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret')
  const expected = process.env.FX_SYNC_SECRET

  if (!expected || secret !== expected) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
  if (!settings?.autoInsightsMonthly) {
    return Response.json({ generated: false, skipped: true })
  }

  // The cron fires at 03:05 on the 1st, so the month to summarise is the one
  // that just ended — generating for the current month here would produce an
  // insight over a day's worth (or less) of data.
  const now = new Date()
  const monthCovered = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7)
  const existing = await prisma.aiInsight.findFirst({ where: { monthCovered } })
  if (existing) {
    return Response.json({ generated: false, skipped: true })
  }

  const insight = await generateAndSaveInsight({
    monthCovered,
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: settings.ollamaModel,
  })

  const monthName = new Date(`${monthCovered}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  await notifyDiscord(`🤖 Pocketbook: monthly AI insight for ${monthName} generated (model: ${settings.ollamaModel})`)

  return Response.json({ generated: true, id: insight.id, monthCovered })
}
