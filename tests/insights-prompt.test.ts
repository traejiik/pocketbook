import { describe, expect, it } from 'vitest'
import { classifyMonth, type InsightKpis, type InsightSnapshot } from '@/lib/insights-data'
import {
  buildPromptFromSnapshot as buildPrompt,
  INSIGHT_SYSTEM_PROMPT,
  type PromptVariants,
} from '@/lib/insights-prompt'

// This file covers the full data prompt — what sparse months and months with
// nothing to compare against get, and the control for probe runs. Production
// months with a story get the brief instead; `insights-story.test.ts` covers that.
const buildPromptFromSnapshot = (s: InsightSnapshot, variants: PromptVariants = {}) =>
  buildPrompt(s, { story: false, ...variants })

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
    categoryDetail: [
      { category: 'Groceries', count: 12, largest: { description: 'Tesco', amount: 30_000, date: '2026-08-09T00:00:00.000Z', recurring: false } },
      { category: 'Transport', count: 5, largest: { description: 'Train', amount: 20_000, date: '2026-08-03T00:00:00.000Z', recurring: false } },
    ],
    expenseCount: 42,
    upcoming: [{ name: 'Netflix', category: 'Subscriptions', daysAway: 6, amount: 4_990 }],
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
    expect(prompt).toContain('so the month did not overspend')
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
      snapshot({ upcoming: [{ name: 'Spotify', category: 'Subscriptions', daysAway: 3, amount: null }] }),
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

// Three prompt shapes, each tracing a failure the models tested on the real
// August 2026 prompt reproduced. `stateVerdict` earned its place as the default;
// the other two stay opt-in until a probe run says they help.
describe('prompt variants', () => {
  it('leaves the prompt untouched when no variant is asked for', () => {
    const plain = buildPromptFromSnapshot(snapshot())
    expect(buildPromptFromSnapshot(snapshot(), {})).toEqual(plain)
    expect(buildPromptFromSnapshot(snapshot(), { stateVerdict: true, priorOpenings: true })).toEqual(
      plain,
    )
  })

  describe('absoluteDeltas', () => {
    // No model found Other Expense's +112 771 Ft, because ranking the month's
    // movements meant subtracting six pairs of numbers. They reached for the
    // largest percentage instead — Fitness at 2385%, worth only +28 380 Ft.
    it('gives a rise its size in the anchor currency as well as a percentage', () => {
      const { prompt } = buildPromptFromSnapshot(snapshot(), { absoluteDeltas: true })
      expect(prompt).toContain('Groceries: 180 000 Ft (up 40 000 Ft, 29% from 140 000 Ft last month)')
    })

    it('gives a fall its size too, unsigned, because the direction word carries it', () => {
      const { prompt } = buildPromptFromSnapshot(
        snapshot({ categories: [{ name: 'Subscription', value: 32_920, prevValue: 35_238 }] }),
        { absoluteDeltas: true },
      )
      expect(prompt).toContain('Subscription: 32 920 Ft (down 2318 Ft, 7% from 35 238 Ft last month)')
    })

    it('applies to the headline figures, not only the categories', () => {
      const { prompt } = buildPromptFromSnapshot(snapshot({ kpis: { expense: 500_000 } }), {
        absoluteDeltas: true,
      })
      expect(prompt).toContain('Expenses: 500 000 Ft (up 80 000 Ft, 19% from 420 000 Ft last month)')
    })

    it('says nothing extra where there is no percentage to qualify', () => {
      const { prompt } = buildPromptFromSnapshot(snapshot(), { absoluteDeltas: true })
      expect(prompt).toContain('Transport: 60 000 Ft (not present last month)')
      expect(prompt).toContain('Savings put aside: 100 000 Ft (flat vs 100 000 Ft last month)')
    })
  })

  describe('stateVerdict', () => {
    // The old line put "overspent" beside the figure without stating its sign.
    // Three of the seven runs that reached prose called the surplus an
    // overspend, two lifting 116 658 Ft verbatim as the shortfall.
    it('says by default that a surplus did not overspend', () => {
      const { prompt } = buildPromptFromSnapshot(snapshot())
      expect(prompt).toContain(
        'Income minus expenses: 300 000 Ft — income exceeded expenses by this much, so the month did not overspend',
      )
      expect(prompt).not.toContain('this is the figure that says whether the month overspent')
    })

    it('names the shortfall and its size when expenses did exceed income', () => {
      const { prompt } = buildPromptFromSnapshot(
        snapshot({ kpis: { income: 500_000, expense: 600_000, operatingNet: -100_000 } }),
      )
      expect(prompt).toContain(
        'Income minus expenses: −100 000 Ft — expenses exceeded income by 100 000 Ft, so the month overspent',
      )
    })

    it('treats an exactly covered month as not overspending', () => {
      const { prompt } = buildPromptFromSnapshot(snapshot({ kpis: { operatingNet: 0 } }))
      expect(prompt).toContain('income exactly covered expenses, so the month did not overspend')
    })

    it('restores the old unsigned wording when turned off, for control runs', () => {
      const { prompt } = buildPromptFromSnapshot(snapshot(), { stateVerdict: false })
      expect(prompt).toContain(
        'Income minus expenses: 300 000 Ft — this is the figure that says whether the month overspent',
      )
      expect(prompt).not.toContain('so the month did not overspend')
    })

    it('keeps the savings caveat alongside it', () => {
      const { prompt } = buildPromptFromSnapshot(snapshot())
      expect(prompt).toContain('Net after savings: 200 000 Ft — savings are subtracted here')
    })
  })

  describe('priorOpenings', () => {
    // The block is the only fully-formed example sentence in the prompt. One run
    // reproduced July's "overspent by X, a shortfall driven primarily by…"
    // skeleton verbatim, importing July's verdict along with its phrasing.
    it('drops the do-not-repeat block when turned off', () => {
      const { prompt } = buildPromptFromSnapshot(snapshot(), { priorOpenings: false })
      expect(prompt).not.toContain('YOU ALREADY WROTE THESE')
      expect(prompt).not.toContain('Spending held steady across the board.')
    })

    it('leaves the rest of the prompt intact', () => {
      const { prompt } = buildPromptFromSnapshot(snapshot(), { priorOpenings: false })
      expect(prompt).toContain('THE MONTH IN FIGURES')
      expect(prompt).toContain('Write the note now.')
    })
  })
})

// The closing action used to allow "what changes if they act" — a figure the data
// never contains — so it demanded exactly what the invention ban forbids. None of
// the thirteen notes measured passed it.
describe('closing action figure', () => {
  it('requires a figure copied from the data', () => {
    expect(INSIGHT_SYSTEM_PROMPT).toContain('carry a figure copied from the data above')
  })

  it('forbids computing a saving instead', () => {
    expect(INSIGHT_SYSTEM_PROMPT).not.toContain('what changes if they act')
    expect(INSIGHT_SYSTEM_PROMPT).toContain('do not work out a new figure for what they would save')
  })

  it('keeps the leave-it-alone fallback', () => {
    expect(INSIGHT_SYSTEM_PROMPT).toContain('recommending they leave alone, and why')
  })
})

// The only six-month figures are net totals. Asked for "the sharpest departure
// from the six-month pattern", three notes invented a category history.
describe('steady month directive', () => {
  it('no longer asks for a six-month comparison the data cannot support', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot({ verdict: 'steady' }))
    expect(prompt).not.toContain('six-month pattern')
  })

  it('says category history is one month deep', () => {
    const { prompt } = buildPromptFromSnapshot(snapshot({ verdict: 'steady' }))
    expect(prompt).toContain('Category figures go back one month only')
    expect(prompt).toContain('the six-month history is net totals')
  })
})
