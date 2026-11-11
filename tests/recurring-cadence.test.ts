import { describe, expect, it } from 'vitest'
import { cadenceLabel } from '@/lib/recurring/cadence'
import {
  addCycles,
  firstOccurrenceAfter,
  formatDateOnly,
  monthlyEquivalent,
  occurrenceOnOrBefore,
  parseDateOnly,
} from '@/lib/recurring/dates'
import { planNewRule, recurringRuleSchema } from '@/lib/recurring/create'

const weekly = { cycle: 'WEEKLY', cycleInterval: 2, anchorDay: null } as const
const quarterly = { cycle: 'MONTHLY', cycleInterval: 3, anchorDay: 31 } as const
const leapYear = { cycle: 'ANNUAL', cycleInterval: 1, anchorDay: 29 } as const

describe('recurring cadence calendar', () => {
  it.each([
    [quarterly, '2027-01-31', 1, '2027-04-30'],
    [quarterly, '2027-04-30', 1, '2027-07-31'],
    [quarterly, '2027-04-30', -1, '2027-01-31'],
    [quarterly, '2027-04-10', 0, '2027-04-10'],
    [leapYear, '2025-02-28', 3, '2028-02-29'],
    [leapYear, '2024-02-29', -1, '2023-02-28'],
    [weekly, '2026-12-28', 1, '2027-01-11'],
    [weekly, '2027-01-11', -1, '2026-12-28'],
  ] as const)('steps %j from %s by %s cycle(s) to %s', (cadence, seed, count, expected) => {
    expect(formatDateOnly(addCycles(cadence, parseDateOnly(seed), count))).toBe(expected)
  })

  it.each([
    [quarterly, '2027-01-31', '2027-04-30', '2027-04-30', '2027-07-31'],
    [quarterly, '2027-01-31', '2027-04-29', '2027-01-31', '2027-04-30'],
    [quarterly, '2027-04-10', '2027-04-09', '2027-01-31', '2027-04-10'],
    [quarterly, '2027-04-10', '2027-04-25', '2027-04-10', '2027-07-31'],
    [weekly, '2027-01-11', '2027-01-03', '2026-12-28', '2027-01-11'],
    [leapYear, '2025-02-28', '2028-02-28', '2027-02-28', '2028-02-29'],
  ] as const)('finds both occurrences around a cutoff for %j seeded on %s at %s', (cadence, seed, cutoff, before, after) => {
    const origin = parseDateOnly(seed)
    const day = parseDateOnly(cutoff)
    expect(formatDateOnly(occurrenceOnOrBefore(cadence, origin, day))).toBe(before)
    expect(formatDateOnly(firstOccurrenceAfter(cadence, origin, day))).toBe(after)
  })

  it.each([
    [{ cycle: 'WEEKLY', cycleInterval: 1 }, 52],
    [{ cycle: 'WEEKLY', cycleInterval: 4 }, 13],
    [{ cycle: 'MONTHLY', cycleInterval: 1 }, 12],
    [{ cycle: 'MONTHLY', cycleInterval: 3 }, 4],
    [{ cycle: 'ANNUAL', cycleInterval: 1 }, 1],
    [{ cycle: 'ANNUAL', cycleInterval: 2 }, 0.5],
  ] as const)('converts %j to the monthly equivalent of %s charges a year', (cadence, chargesPerYear) => {
    expect(monthlyEquivalent(1200, cadence)).toBe(100 * chargesPerYear)
  })
})

describe('cadence labels', () => {
  it.each([
    [weekly, 'fortnightly'],
    [quarterly, 'quarterly'],
    [leapYear, 'annual'],
    [{ cycle: 'WEEKLY', cycleInterval: 4 }, 'every 4 weeks'],
    [{ cycle: 'MONTHLY', cycleInterval: 6 }, 'every 6 months'],
    [{ cycle: 'ANNUAL', cycleInterval: 2 }, 'every 2 years'],
  ] as const)('formats %j as %s', (cadence, expected) => {
    expect(cadenceLabel(cadence)).toBe(expected)
  })
})

describe('recurring rule cadence validation', () => {
  const input = {
    name: 'Insurance',
    amount: 12_000,
    currency: 'HUF',
    cycle: 'MONTHLY',
    nextDue: '2027-04-30',
    kind: 'EXPENSE',
    categoryId: 'insurance',
  }

  it('defaults legacy callers to an interval of one', () => {
    expect(recurringRuleSchema.parse(input).cycleInterval).toBe(1)
  })

  it.each([
    ['WEEKLY', 52],
    ['MONTHLY', 12],
    ['ANNUAL', 5],
  ])('validates the %s upper limit of %s', (cycle, limit) => {
    expect(recurringRuleSchema.safeParse({ ...input, cycle, cycleInterval: limit }).success).toBe(true)
    expect(recurringRuleSchema.safeParse({ ...input, cycle, cycleInterval: limit + 1 }).success).toBe(false)
  })

  it.each([0, -1, 2.5])('rejects an invalid interval of %s', (cycleInterval) => {
    expect(recurringRuleSchema.safeParse({ ...input, cycleInterval }).success).toBe(false)
  })

  it('rejects a billing day on a weekly rule', () => {
    expect(recurringRuleSchema.safeParse({ ...input, cycle: 'WEEKLY', anchorDay: 30 }).success).toBe(false)
  })

  it('accepts a nullable billing day in a weekly schedule snapshot', () => {
    const scheduleSnapshot = { cycle: 'WEEKLY', cycleInterval: 2, anchorDay: null, nextDue: '2027-04-12' }
    expect(recurringRuleSchema.parse({ ...input, scheduleSnapshot }).scheduleSnapshot).toEqual(scheduleSnapshot)
  })

  it('uses an explicit billing day when planning from a clamped date', () => {
    const fields = recurringRuleSchema.parse({ ...input, cycleInterval: 3, anchorDay: 31 })
    const plan = planNewRule(fields, parseDateOnly('2027-04-30'))
    expect(plan.anchorDay).toBe(31)
    expect(plan.nextDue).toBe('2027-07-31')
  })
})
