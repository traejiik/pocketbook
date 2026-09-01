import { prisma } from './prisma'
import { shiftMonthKey } from './format'
import { toAnchor } from './fx'
import {
  getAnchorCurrency,
  getMonthKpis,
  getMonthExpensesByCategory,
  getMonthExpenseHighlights,
  getMonthTrend,
  getUpcomingRenewals,
  getRecurringRules,
  getRecurringBudgetSummary,
  type RecurringBudgetSummary,
} from './aggregations'

/**
 * How the month went, decided in TypeScript rather than left to the model to
 * notice. A small model handed a table of numbers reaches for reassuring prose by
 * default, so the tone is picked here and the matching directive is injected into
 * the prompt (see `lib/insights-prompt.ts`).
 */
export type MonthVerdict = 'sparse' | 'deficit' | 'tight' | 'strong' | 'steady'

export type InsightKpis = {
  income: number
  expense: number
  savings: number
  /** income − expense − savings. What the dashboard shows. */
  net: number
  /** income − expense. Excludes savings, so this is the one that says whether the
   *  month actually overspent. */
  operatingNet: number
  savingsRate: number
  unconvertibleCount: number
}

export type InsightSnapshot = {
  monthKey: string
  monthName: string
  anchor: string
  kpis: InsightKpis
  prev: { income: number; expense: number; savings: number; operatingNet: number } | null
  categories: { name: string; value: number; prevValue: number | null }[]
  trend: { month: string; net: number }[]
  largest: { description: string; category: string; amount: number; date: string }[]
  expenseCount: number
  upcoming: { name: string; daysAway: number; amount: number | null }[]
  installments: { name: string; paid: number; total: number; endsOn: string | null; monthlyAmount: number | null }[]
  committed: RecurringBudgetSummary
  priorNotes: { monthName: string; opening: string }[]
  verdict: MonthVerdict
}

export function monthNameOf(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Order matters. `deficit` keys off `operatingNet` (income − expense) rather than
 * `net`, because `net` subtracts savings too: a month that moved a large sum into
 * savings shows a negative net while having spent well within its income. Those
 * two situations want opposite openings, and the old prompt could not tell them
 * apart because it only ever saw `net`.
 */
export function classifyMonth(input: {
  kpis: { income: number; expense: number; savings: number }
  expenseCount: number
}): MonthVerdict {
  const { income, expense, savings } = input.kpis
  const operatingNet = income - expense

  if (input.expenseCount < 5 || income <= 0) return 'sparse'
  if (operatingNet < 0) return 'deficit'
  if (operatingNet / income < 0.1) return 'tight'
  if (savings / income >= 0.2) return 'strong'
  return 'steady'
}

/** First sentence of a saved note, for the do-not-repeat block. */
function openingOf(content: string): string {
  const firstPara = content.split('\n\n')[0]?.trim() ?? ''
  const sentence = firstPara.split(/(?<=[.?])\s/)[0] ?? firstPara
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence
}

export async function collectInsightSnapshot(monthKey: string): Promise<InsightSnapshot> {
  const prevKey = shiftMonthKey(monthKey, -1)

  const [
    anchor,
    rawKpis,
    prevKpis,
    categories,
    prevCategories,
    trend,
    highlights,
    upcomingRaw,
    rules,
    committed,
    priorRows,
  ] = await Promise.all([
    getAnchorCurrency(),
    getMonthKpis(monthKey),
    getMonthKpis(prevKey),
    getMonthExpensesByCategory(monthKey),
    getMonthExpensesByCategory(prevKey),
    getMonthTrend(monthKey, 6),
    getMonthExpenseHighlights(monthKey, 3),
    getUpcomingRenewals(30),
    getRecurringRules(),
    getRecurringBudgetSummary(),
    // Not routed through `unstable_cache`, for the same reason the other AI-insight
    // reads are not: a `take: 3` lookup costs less than the incremental cache does.
    prisma.aiInsight.findMany({
      where: { monthCovered: { not: monthKey } },
      orderBy: { monthCovered: 'desc' },
      take: 3,
      select: { monthCovered: true, content: true },
    }),
  ])

  const kpis: InsightKpis = {
    income: Math.round(rawKpis.income),
    expense: Math.round(rawKpis.expense),
    savings: Math.round(rawKpis.savings),
    net: Math.round(rawKpis.net),
    operatingNet: Math.round(rawKpis.income - rawKpis.expense),
    savingsRate: rawKpis.income > 0 ? Math.round((rawKpis.savings / rawKpis.income) * 100) : 0,
    unconvertibleCount: rawKpis.unconvertibleCount,
  }

  // A month with no rows at all reads as a real zero month rather than a missing
  // baseline, so `prev` is only null when the prior month is genuinely empty.
  const prevHasData = prevKpis.income !== 0 || prevKpis.expense !== 0 || prevKpis.savings !== 0
  const prev = prevHasData
    ? {
        income: Math.round(prevKpis.income),
        expense: Math.round(prevKpis.expense),
        savings: Math.round(prevKpis.savings),
        operatingNet: Math.round(prevKpis.income - prevKpis.expense),
      }
    : null

  const prevByName = new Map(prevCategories.map((c) => [c.name, c.value]))

  const installmentRules = rules.filter(
    (r) => r.installmentTotal != null && r.installmentPaid != null,
  )
  const installments = await Promise.all(
    installmentRules.map(async (r) => ({
      name: r.name,
      paid: r.installmentPaid as number,
      total: r.installmentTotal as number,
      endsOn: r.installmentEndsOn ? r.installmentEndsOn.toISOString() : null,
      // Live conversion — recurring rules carry no frozen rate (AGENTS.md §9).
      monthlyAmount: await toAnchor(
        Math.abs(Number(r.amount)),
        r.currency as 'HUF' | 'USD' | 'EUR' | 'GBP',
      ),
    })),
  )

  const snapshot: Omit<InsightSnapshot, 'verdict'> = {
    monthKey,
    monthName: monthNameOf(monthKey),
    anchor,
    kpis,
    prev,
    categories: categories.slice(0, 6).map((c) => ({
      name: c.name,
      value: c.value,
      prevValue: prevByName.get(c.name) ?? null,
    })),
    trend,
    largest: highlights.largest,
    expenseCount: highlights.expenseCount,
    upcoming: upcomingRaw.slice(0, 5).map((u) => ({
      name: u.rule.name,
      daysAway: u.daysAway,
      // Stays null when no FX path exists. The old prompt coerced this to 0 and
      // told the model the renewal was free.
      amount: u.hufEquivalent,
    })),
    installments,
    committed,
    priorNotes: priorRows.map((r) => ({
      monthName: monthNameOf(r.monthCovered),
      opening: openingOf(r.content),
    })),
  }

  return { ...snapshot, verdict: classifyMonth(snapshot) }
}
