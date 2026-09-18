import { describe, expect, it } from 'vitest'
import { finaliseNote } from '@/lib/insights-generation'
import type { InsightSnapshot } from '@/lib/insights-data'
import { findInventedFigures } from '@/lib/insights-figures'
import { buildPromptFromSnapshot, INSIGHT_SYSTEM_PROMPT } from '@/lib/insights-prompt'

// The real August 2026 ledger, as the notes read by hand in September were given
// it. Every "invented" case below is a figure one of those notes actually wrote.
const august: InsightSnapshot = {
  monthKey: '2026-08',
  monthName: 'August 2026',
  anchor: 'HUF',
  kpis: {
    income: 585_140,
    expense: 468_482,
    savings: 50_000,
    net: 66_658,
    operatingNet: 116_658,
    savingsRate: 9,
    unconvertibleCount: 0,
  },
  prev: { income: 287_505, expense: 289_708, savings: 0, operatingNet: -2_203 },
  categories: [
    { name: 'Housing', value: 150_000, prevValue: 150_000 },
    { name: 'Other Expense', value: 120_734, prevValue: 7_963 },
    { name: 'Food & Groceries', value: 86_165, prevValue: 38_947 },
    { name: 'Subscriptions', value: 32_920, prevValue: 35_238 },
    { name: 'Fitness', value: 29_570, prevValue: 1_190 },
    { name: 'Eating Out', value: 21_293, prevValue: 12_920 },
  ],
  trend: [
    { month: 'Mar', net: 0 },
    { month: 'Apr', net: 0 },
    { month: 'May', net: 66_372 },
    { month: 'Jun', net: 2_416 },
    { month: 'Jul', net: -2_203 },
    { month: 'Aug', net: 66_658 },
  ],
  largest: [
    { description: 'Rent', category: 'Housing', amount: 150_000, date: '2026-08-10T00:00:00.000Z' },
    { description: 'AirPods Pro 3', category: 'Other Expense', amount: 89_897, date: '2026-08-22T00:00:00.000Z' },
    { description: 'Spar Groceries', category: 'Food & Groceries', amount: 22_201, date: '2026-08-15T00:00:00.000Z' },
  ],
  expenseCount: 42,
  upcoming: [
    { name: 'PS Plus Extra', daysAway: 20, amount: 5_590 },
    { name: 'Rent', daysAway: 22, amount: 150_000 },
  ],
  installments: [],
  committed: {
    monthlyIncome: 585_140,
    monthlyExpenses: 200_871,
    monthlySavings: 50_000,
    netUsable: 0,
    expenseRatio: 0.34,
    hasNormalisedAnnuals: true,
    expensesByCategory: [],
  },
  priorNotes: [
    { monthName: 'June 2026', opening: 'Your income for June 2026 came in at 277,047 Ft, which is a stable amount.' },
  ],
  verdict: 'steady',
}

const { prompt } = buildPromptFromSnapshot(august)
const invented = (note: string) => findInventedFigures(note, prompt)

describe('findInventedFigures', () => {
  describe('passes figures the data contains', () => {
    it('accepts amounts and percentages copied from the prompt', () => {
      expect(
        invented(
          'Other Expense rose 1416% from 7963 Ft to 120 734 Ft, mostly the AirPods Pro 3 at 89 897 Ft. ' +
            'Income minus expenses was 116 658 Ft and the savings rate 9%.',
        ),
      ).toEqual([])
    })

    it('treats regrouped amounts as the same figure — form is checked elsewhere', () => {
      expect(invented('The AirPods cost 89,897 Ft and June closed at 2 416 Ft.')).toEqual([])
    })

    it('matches a negative figure by its size, as prose states it', () => {
      expect(invented('July, where expenses exceeded income by 2203 Ft.')).toEqual([])
    })

    it('ignores dates, day counts and transaction counts', () => {
      expect(invented('Rent on 2026-08-10 is due in 22 day(s); you recorded 42 expenses.')).toEqual([])
    })
  })

  describe('flags figures the data does not contain', () => {
    it.each([
      ['a total nobody computed', 'You have 24 742 Ft remaining after expenses.', ['24 742 Ft']],
      ['a history that does not exist', 'It went from 38 947 Ft in June to 40 000 Ft in July.', ['40 000 Ft']],
      ['a computed share', 'Housing represents 25.7% of your income.', ['25.7%']],
      ['a recomputed rate that contradicts the given one', 'A savings rate of 8.5% of your income.', ['8.5%']],
      ['a comma-grouped invention', 'The 104% rise over the 58,000 Ft recorded in July.', ['58,000 Ft']],
      ['a small invented share', 'Savings were 1.7% of your monthly income.', ['1.7%']],
    ])('%s', (_, note, expected) => {
      expect(invented(note)).toEqual(expected)
    })

    it('lists each invented figure once, as the note wrote it first', () => {
      expect(invented('A six-month total of 200 000 Ft. Again: 200,000 Ft.')).toEqual(['200 000 Ft'])
    })
  })

  describe('what counts as data', () => {
    // "a 24% rise in Housing" — 24% appears only in the system prompt's example of
    // how to write percentages. Housing was flat.
    it('does not accept the system prompt’s worked examples', () => {
      expect(INSIGHT_SYSTEM_PROMPT).toContain('"24%"')
      expect(invented('A 24% rise in Housing.')).toEqual(['24%'])
    })

    // Earlier notes' openings are in the prompt, but they are old prose, not the
    // ledger — and some of what they quoted was wrong when it was written.
    it('does not accept figures quoted from earlier notes’ openings', () => {
      expect(prompt).toContain('277,047 Ft')
      expect(invented('June income was 277,047 Ft.')).toEqual(['277,047 Ft'])
    })

    it('still reads the data after the openings block', () => {
      expect(invented('Rent of 150 000 Ft is due soon.')).toEqual([])
    })
  })

  it('handles anchors written with a leading symbol', () => {
    const usd = buildPromptFromSnapshot({ ...august, anchor: 'USD', priorNotes: [] }).prompt
    expect(usd).toContain('$150000.00')
    expect(findInventedFigures('Rent was $150,000.00 and something cost $123.45.', usd)).toEqual(['$123.45'])
  })
})

describe('finaliseNote with the prompt', () => {
  it('reports invented figures alongside the form checks', () => {
    const note = finaliseNote('You have 24742 Ft left, and Housing was 150000 Ft.', 'HUF', prompt)
    expect(note.content).toBe('You have 24 742 Ft left, and Housing was 150 000 Ft.')
    expect(note.repaired).toBe(2)
    expect(note.invented).toEqual(['24 742 Ft'])
    expect(note.defectCount).toBe(0)
  })

  it('reports nothing when it is not given the prompt', () => {
    expect(finaliseNote('You have 24 742 Ft left.', 'HUF').invented).toEqual([])
  })
})
