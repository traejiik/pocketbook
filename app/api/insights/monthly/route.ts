import { prisma } from '@/lib/prisma'
import { generateAndSaveInsight } from '@/lib/insights-generation'
import { sendNotification } from '@/lib/notifications/send'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const secret = request.headers.get('x-internal-job-token')
  const expected = process.env.PB_INTERNAL_JOB_TOKEN

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
  // First day of the current month = the moment `monthCovered` finished. Any
  // insight generated at/after this is "final" (computed over the whole month).
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthCovered = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7)
  // Skip only when a final insight already exists (retry-safe). A note generated
  // mid-month over partial data is stale once the month closes, so it gets
  // regenerated and replaced rather than kept.
  const latest = await prisma.aiInsight.findFirst({
    where: { monthCovered },
    orderBy: { generatedAt: 'desc' },
  })
  if (latest && latest.generatedAt >= monthEnd) {
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
  await sendNotification({
    type: 'monthlyInsightReady',
    month: monthName,
    model: settings.ollamaModel,
  }, {
    instanceName: process.env.PB_INSTANCE_NAME,
  })

  return Response.json({ generated: true, id: insight.id, monthCovered })
}
