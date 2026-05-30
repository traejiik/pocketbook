import { describe, expect, it } from 'vitest'
import { planRecurringCatchUp, resumeNextDue } from '@/lib/recurring-backfill'

// UTC so the assertions hold regardless of the machine's local timezone.
const today = new Date(Date.UTC(2026, 4, 29))

function baseInput(overrides: Partial<Parameters<typeof planRecurringCatchUp>[0]> = {}) {
  return {
    name: 'Rent',
    amount: 210000,
    currency: 'HUF' as const,
    cycle: 'MONTHLY' as const,
    nextDue: '2026-06-05',
    kind: 'EXPENSE' as const,
    categoryId: 'cat_rent',
    installmentPaid: null,
    installmentTotal: null,
    today,
    ...overrides,
  }
}

describe('planRecurringCatchUp', () => {
  it('backfills the last four monthly occurrences and preserves a future next due date', () => {
    const plan = planRecurringCatchUp(baseInput())

    expect(plan.nextDue).toBe('2026-06-05')
    expect(plan.archived).toBe(false)
    expect(plan.transactions.map((tx) => tx.date)).toEqual([
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
    ])
    expect(plan.transactions[0]).toMatchObject({
      description: 'Rent',
      amount: -210000,
      currency: 'HUF',
      type: 'EXPENSE',
      categoryId: 'cat_rent',
    })
  })

  it('advances a past monthly next due date after backfilling recent occurrences', () => {
    const plan = planRecurringCatchUp(baseInput({ nextDue: '2026-03-05' }))

    expect(plan.nextDue).toBe('2026-06-05')
    expect(plan.transactions.map((tx) => tx.date)).toEqual([
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
    ])
  })

  it('includes today when the monthly due date is today and advances next due', () => {
    const plan = planRecurringCatchUp(baseInput({ nextDue: '2026-05-29' }))

    expect(plan.nextDue).toBe('2026-06-29')
    expect(plan.transactions.map((tx) => tx.date)).toEqual([
      '2026-02-28',
      '2026-03-29',
      '2026-04-29',
      '2026-05-29',
    ])
  })

  it('clamps month-end schedules to the last day of shorter months', () => {
    const plan = planRecurringCatchUp(baseInput({ nextDue: '2026-03-31' }))

    expect(plan.nextDue).toBe('2026-05-31')
    expect(plan.transactions.map((tx) => tx.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('backfills one annual occurrence and advances next due when annual due is past', () => {
    const plan = planRecurringCatchUp(baseInput({ cycle: 'ANNUAL', nextDue: '2026-05-01' }))

    expect(plan.nextDue).toBe('2027-05-01')
    expect(plan.transactions.map((tx) => tx.date)).toEqual(['2026-05-01'])
  })

  it('does not backfill future annual rules', () => {
    const plan = planRecurringCatchUp(baseInput({ cycle: 'ANNUAL', nextDue: '2026-07-01' }))

    expect(plan.nextDue).toBe('2026-07-01')
    expect(plan.transactions).toEqual([])
  })

  it('creates installment history that matches the paid count without changing the paid count', () => {
    const plan = planRecurringCatchUp(baseInput({
      name: 'Phone plan',
      amount: 6500,
      nextDue: '2026-06-20',
      installmentPaid: 9,
      installmentTotal: 15,
    }))

    expect(plan.nextDue).toBe('2026-06-20')
    expect(plan.archived).toBe(false)
    expect(plan.installmentPaid).toBe(9)
    expect(plan.transactions).toHaveLength(9)
    expect(plan.transactions.at(0)?.date).toBe('2025-09-20')
    expect(plan.transactions.at(-1)?.date).toBe('2026-05-20')
  })

  it('rejects installment rules where paid exceeds total', () => {
    expect(() => planRecurringCatchUp(baseInput({
      installmentPaid: 16,
      installmentTotal: 15,
    }))).toThrow('Installment paid count cannot exceed total installments.')
  })
})

describe('resumeNextDue', () => {
  it('advances a past monthly date to the next occurrence after today', () => {
    expect(resumeNextDue('MONTHLY', '2026-02-10', today)).toBe('2026-06-10')
  })

  it('keeps a still-future date unchanged', () => {
    expect(resumeNextDue('MONTHLY', '2026-08-01', today)).toBe('2026-08-01')
  })

  it('advances a past annual date to next year', () => {
    expect(resumeNextDue('ANNUAL', '2026-01-15', today)).toBe('2027-01-15')
  })
})
