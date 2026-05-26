import { prisma } from './prisma'
import { fmtHUF } from './format'
import {
  getCurrentMonthKpis,
  getExpensesByCategory,
  getUpcomingRenewals,
  getRecurringRules,
} from './aggregations'
import { streamGenerate } from './ollama'

export async function buildInsightPrompt(): Promise<string> {
  const [kpis, byCategory, upcoming, rules] = await Promise.all([
    getCurrentMonthKpis(),
    getExpensesByCategory(),
    getUpcomingRenewals(30),
    getRecurringRules(),
  ])

  const now = new Date()
  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

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
  const prompt = await buildInsightPrompt()
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

  return prisma.aiInsight.create({
    data: {
      userId: user.id,
      monthCovered: options.monthCovered,
      modelUsed: options.ollamaModel,
      content,
    },
  })
}
