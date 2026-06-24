import { prisma } from './prisma'
import { fmtHUF } from './format'
import {
  getMonthKpis,
  getMonthExpensesByCategory,
  getUpcomingRenewals,
  getRecurringRules,
} from './aggregations'
import { streamGenerate } from './ollama'

// `monthCovered` is a `YYYY-MM` key. The financial data in the prompt comes
// from that month, so a cron run on the 1st can summarise the month that just
// ended instead of the (empty) month that just started. Defaults to the
// current month for on-demand generation from the insights stream.
export async function buildInsightPrompt(monthCovered?: string): Promise<string> {
  const monthKey = monthCovered ?? new Date().toISOString().slice(0, 7)
  const [kpis, byCategory, upcoming, rules] = await Promise.all([
    getMonthKpis(monthKey),
    getMonthExpensesByCategory(monthKey),
    getUpcomingRenewals(30),
    getRecurringRules(),
  ])

  const [year, month] = monthKey.split('-').map(Number)
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const savingsRate = kpis.income > 0
    ? Math.round(((kpis.savings) / kpis.income) * 100)
    : 0

  const topCategories = byCategory
    .slice(0, 5)
    .map(c => `  - ${c.name}: ${fmtHUF(c.value)}`)
    .join('\n')

  const upcomingList = upcoming
    .slice(0, 5)
    .map(u => `  - ${u.rule.name}: due in ${u.daysAway} day(s), ${fmtHUF(u.hufEquivalent ?? 0)}`)
    .join('\n')

  const installments = rules
    .filter(r => r.installmentTotal != null && r.installmentPaid != null)
    .map(r => `  - ${r.name}: ${r.installmentPaid}/${r.installmentTotal} paid`)
    .join('\n')

  return `You are a personal finance assistant giving a monthly summary for ${monthName}.

FINANCIAL DATA:
- Income: ${fmtHUF(kpis.income)}
- Expenses: ${fmtHUF(kpis.expense)}
- Savings: ${fmtHUF(kpis.savings)}
- Net: ${fmtHUF(kpis.net)}
- Savings rate: ${savingsRate}%

TOP EXPENSE CATEGORIES:
${topCategories || '  (no data)'}

UPCOMING RENEWALS (next 30 days):
${upcomingList || '  (none)'}

INSTALLMENT PROGRESS:
${installments || '  (none)'}

INSTRUCTIONS:
Write a conversational monthly summary in plain text. Rules:
- Max 6 short paragraphs
- No exclamation marks, no emoji, no bullet points in the output
- All amounts in HUF (Forint) unless originally in another currency
- Tone: calm, analytical, like a trusted financial advisor
- Point out anything worth watching: doubled subscriptions, installments ending soon, trends
- Do not start with "Here is" or "Based on" — start with the actual insight`
}

export async function generateAndSaveInsight(options: {
  monthCovered: string
  ollamaUrl: string
  ollamaModel: string
}): Promise<{ id: string }> {
  const prompt = await buildInsightPrompt(options.monthCovered)
  let content = ''

  for await (const chunk of streamGenerate({
    baseUrl: options.ollamaUrl,
    model: options.ollamaModel,
    prompt,
  })) {
    content += chunk.response
    if (chunk.done) break
  }

  const user = await prisma.user.findFirst()
  if (!user) throw new Error('No user found')

  const record = await prisma.aiInsight.create({
    data: {
      userId: user.id,
      monthCovered: options.monthCovered,
      modelUsed: options.ollamaModel,
      content,
    },
  })

  // One insight per month: the freshly generated note replaces any earlier
  // (e.g. mid-month) notes for the same month.
  await prisma.aiInsight.deleteMany({
    where: { monthCovered: options.monthCovered, id: { not: record.id } },
  })

  return record
}
