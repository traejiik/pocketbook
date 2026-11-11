import { describe, expect, it } from 'vitest'
import { summariseRenewalHorizon } from '@/lib/recurring/renewals'

const weekly = {
  rule: {
    cycle: 'WEEKLY' as const, cycleInterval: 1, anchorDay: null,
    nextDue: '2026-11-11', installmentPaid: null, installmentTotal: null,
  },
  daysAway: 0,
  hufEquivalent: 4000,
}

describe('renewal horizon', () => {
  it('counts five weekly occurrences while retaining one row', () => {
    const summary = summariseRenewalHorizon([weekly], 30)
    expect(summary).toMatchObject({
      items: [{ ...weekly, occurrences: 5 }],
      total: 20_000, unconvertibleOccurrences: 0,
    })
  })

  it('includes a charge on the horizon edge and excludes later rules', () => {
    const edge = { ...weekly, daysAway: 2, rule: { ...weekly.rule, nextDue: '2026-11-13' } }
    expect(summariseRenewalHorizon([edge, { ...weekly, daysAway: 31 }], 30).items)
      .toEqual([{ ...edge, occurrences: 5 }])
  })

  it('caps installments and excludes missing FX from the total', () => {
    const installment = {
      ...weekly,
      rule: { ...weekly.rule, installmentPaid: 8, installmentTotal: 10 },
    }
    const unconvertible = { ...weekly, hufEquivalent: null }
    const summary = summariseRenewalHorizon([installment, unconvertible], 30)
    expect(summary).toMatchObject({
      items: [{ occurrences: 2 }, { occurrences: 5 }],
      total: 8000, unconvertibleOccurrences: 5,
    })
  })

  it('counts later monthly occurrences on their persisted billing day', () => {
    const monthly = {
      ...weekly,
      rule: { ...weekly.rule, cycle: 'MONTHLY' as const, anchorDay: 31, nextDue: '2027-02-28' },
    }
    expect(summariseRenewalHorizon([monthly], 30).items[0].occurrences).toBe(1)
    expect(summariseRenewalHorizon([monthly], 31).items[0].occurrences).toBe(2)
  })
})
