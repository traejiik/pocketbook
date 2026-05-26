import { prisma } from '@/lib/prisma'
import { generateAndSaveInsight } from '@/lib/insights-generation'

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

  const monthCovered = new Date().toISOString().slice(0, 7)
  const existing = await prisma.aiInsight.findFirst({ where: { monthCovered } })
  if (existing) {
    return Response.json({ generated: false, skipped: true })
  }

  const insight = await generateAndSaveInsight({
    monthCovered,
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: settings.ollamaModel,
  })

  return Response.json({ generated: true, id: insight.id })
}
