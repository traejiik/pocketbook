import { describe, expect, it } from 'vitest'
import { classifyMonth, type InsightKpis, type InsightSnapshot } from '@/lib/insights-data'
import { buildPromptFromSnapshot, INSIGHT_SYSTEM_PROMPT } from '@/lib/insights-prompt'

type SnapshotOverride = Partial<Omit<InsightSnapshot, 'kpis'>> & { kpis?: Partial<InsightKpis> }

function snapshot(over: SnapshotOverride = {}): InsightSnapshot {
  const base: InsightSnapshot = {
    monthKey: '2026-08',
    monthName: 'August 2026',
    anchor: 'HUF',
    kpis: {
      income: 800_000,
      expense: 500_000,
      savings: 100_000,
      net: 200_000,
      operatingNet: 300_000,
      savingsRate: 13,
      unconvertibleCount: 0,
    },
    prev: { income: 800_000, expense: 420_000, savings: 100_000, operatingNet: 380_000 },
    categories: [
      { name: 'Groceries', value: 180_000, prevValue: 140_000 },
      { name: 'Transport', value: 60_000, prevValue: null },
    ],
    trend: [
      { month: 'Mar', net: 120_000 },
      { month: 'Apr', net: -40_000 },
    ],
    largest: [
      { description: 'Laptop', category: 'Electronics', amount: 240_000, date: '2026-08-12T00:00:00.000Z' },
    ],
    expenseCount: 42,
    upcoming: [{ name: 'Netflix', daysAway: 6, amount: 4_990 }],
    installments: [
      { name: 'Phone', paid: 10, total: 12, endsOn: '2026-10-01T00:00:00.000Z', monthlyAmount: 25_000 },
    ],
    committed: {
      monthlyIncome: 800_000,
      monthlyExpenses: 200_000,
      monthlySavings: 100_000,
      netUsable: 500_000,
      expenseRatio: 0.25,
      hasNormalisedAnnuals: false,
      expensesByCategory: [],
    },
    priorNotes: [{ monthName: 'July 2026', opening: 'Spending held steady across the board.' }],
    verdict: 'steady',
  }
  return { ...base, ...over, kpis: { ...base.kpis, ...(over.kpis ?? {}) } }
}

describe('classifyMonth', () => {
  it('classifies a real overspend as a deficit', () => {
    expect(
      classifyMonth({ kpis: { income: 500_000, expense: 600_000, savings: 0 }, expenseCount: 40 }),
    ).toBe('deficit')
  })

  // The bug this rewrite exists to fix: `net` = income − expense − savings, so a
  // month that moved a large sum into savings shows a negative net while having
  // spent well within its income. That is not a bad month.
  it('does not call a heavy savings month a deficit, even though net is negative', () => {
    const kpis = { income: 500_000, expense: 300_000, savings: 1_200_000 }
    expect(kpis.income - kpis.expense - kpis.savings).toBeLessThan(0) // net is negative
    expect(classifyMonth({ kpis, expenseCount: 40 })).toBe('strong')
  })

  it('classifies a thin margin as tight', () => {
    expect(
      classifyMonth({ kpis: { income: 500_000, expense: 480_000, savings: 0 }, expenseCount: 40 }),
    ).toBe('tight')
  })

  it('classifies an ordinary month as steady', () => {
    expect(
      classifyMonth({ kpis: { income: 500_000, expense: 350_000, savings: 50_000 }, expenseCount: 40 }),
    ).toBe('steady')
  })

  it('classifies too few transactions as sparse before anything else', () => {
    expect(
      classifyMonth({ kpis: { income: 500_000, expense: 900_000, savings: 0 }, expenseCount: 2 }),
    ).toBe('sparse')
  })

  it('classifies a month with no income as sparse rather than a deficit', () => {
    expect(
      classifyMonth({ kpis: { income: 0, expense: 90_000, savings: 0 }, expenseCount: 30 }),
    ).toBe('sparse')
  })
})

describe('buildPromptFromSnapshot', () => {
  it('tells a deficit month not to soften the shortfall', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot({ verdict: 'deficit' }))
    expect(prompt).toContain('spent more than it took in')
    expect(prompt).toContain('Do not open with reassurance')
  })

  it('does not carry the deficit directive into a strong month', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot({ verdict: 'strong' }))
    expect(prompt).not.toContain('Do not open with reassurance')
    expect(prompt).toContain('Do not congratulate')
  })

  it('separates operating net from net after savings', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot())
    expect(prompt).toContain('Income minus expenses: 300 000 Ft')
    expect(prompt).toContain('whether the month overspent')
    expect(prompt).toContain('Net after savings: 200 000 Ft')
    expect(prompt).toContain('savings are subtracted here')
  })

  it('does not raise the savings caveat when nothing was put aside', () => {
    const { prompt } = buildPromptFromSnapshot(
      snapshot({ kpis: { savings: 0, net: 300_000, operatingNet: 300_000, savingsRate: 0 } }),
    )
    expect(prompt).toContain('the same figure, because nothing was put aside this month')
    expect(prompt).not.toContain('savings are subtracted here')
  })

  it('formats amounts in the anchor currency, not always HUF', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot({ anchor: 'EUR' }))
    expect(prompt).toContain('€')
    expect(prompt).not.toContain('Ft')
    expect(prompt).toContain('All amounts are in EUR')
  })

  it('reports an unconvertible renewal as unavailable rather than free', () => {
    const { prompt } = buildPromptFromSnapshot(
      snapshot({ upcoming: [{ name: 'Spotify', daysAway: 3, amount: null }] }),
    )
    expect(prompt).toContain('Spotify: due in 3 day(s), amount unavailable (no exchange rate)')
    expect(prompt).not.toContain('Spotify: due in 3 day(s), 0 Ft')
  })

  it('flags totals as incomplete when transactions could not be converted', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot({ kpis: { unconvertibleCount: 3 } }))
    expect(prompt).toContain('INCOMPLETE FIGURES')
    expect(prompt).toContain('3 transaction(s) had no exchange rate')
  })

  it('omits the incomplete-figures block when everything converted', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot())
    expect(prompt).not.toContain('INCOMPLETE FIGURES')
  })

  it('shows category movement against last month', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot())
    expect(prompt).toContain('Groceries: 180 000 Ft (up 29% from 140 000 Ft last month)')
    expect(prompt).toContain('Transport: 60 000 Ft (not present last month)')
  })

  it('forbids reusing the openings of recent notes', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot())
    expect(prompt).toContain('YOU ALREADY WROTE THESE')
    expect(prompt).toContain('Spending held steady across the board.')
  })

  it('omits the do-not-repeat block when there are no earlier notes', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot({ priorNotes: [] }))
    expect(prompt).not.toContain('YOU ALREADY WROTE THESE')
  })

  it('requires a concrete closing action in the system prompt', () => {
    const { system } = buildPromptFromSnapshot(snapshot())
    expect(system).toBe(INSIGHT_SYSTEM_PROMPT)
    expect(system).toContain('THE LAST PARAGRAPH IS AN ACTION')
    expect(system).toContain('consider budgeting')
    expect(system).toContain('Generic advice is a failure')
  })
})

describe('amount fidelity rules', () => {
  // A note came back saying "half an extra thousand pounds" against a HUF anchor,
  // and spelled figures out as "one hundred fifty thousand forint". The rule
  // existed but was one clause inside a paragraph of prose; a 4B model needs it
  // isolated, explicit, and repeated at the end where recency helps.
  it('states the amount rules as their own section', () => {
    const { system } = buildPromptFromSnapshot(snapshot())
    expect(system).toContain('AMOUNTS (THE STRICTEST RULE HERE)')
    expect(system).toContain('Do not rename the currency')
    expect(system).toContain('Do not spell any number out in words')
    expect(system).toContain('never "150,000 pounds"')
  })

  it('extends the rule to percentages and digit grouping', () => {
    const { system } = buildPromptFromSnapshot(snapshot())
    expect(system).toContain('never "seventy percent"')
    expect(system).toContain('never "289708 Ft"')
  })

  it('repeats the amount rule in the closing instruction', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot())
    expect(prompt).toContain('Copy every amount exactly as written above')
    expect(prompt).toContain('never spelled out in words')
  })
})

describe('sparse month directive', () => {
  // On the 1st the month has not happened yet. The model narrated that absence as
  // an event: "an abrupt end to your financial activity", "an administrative
  // pause", "income dropped by 100% from last month".
  it('forbids narrating an empty month as an event', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot({ verdict: 'sparse' }))
    expect(prompt).toContain('Do not narrate the absence of data as if it were an event')
    expect(prompt).toContain('the month simply has not happened yet')
  })

  it('forbids comparing empty figures against last month', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot({ verdict: 'sparse' }))
    expect(prompt).toContain('a 100% fall from a month that has barely started is an artefact')
  })

  it('keeps those restrictions out of months that have data', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot({ verdict: 'steady' }))
    expect(prompt).not.toContain('the month simply has not happened yet')
  })
})
