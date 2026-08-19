import { describe, expect, it } from 'vitest'

// `monthKeyOf` / `shiftMonthKey` replaced `date-fns` (`format`, `subMonths`,
// `addMonths`) in the Transactions month navigator so the client bundle no
// longer eagerly loads the library. These pin the behaviour that swap relied on:
// local-part reads (not UTC) and correct year rollover in both directions.

import { monthKeyOf, shiftMonthKey } from '@/lib/format'

describe('monthKeyOf', () => {
  it('formats a date as zero-padded YYYY-MM', () => {
    expect(monthKeyOf(new Date(2026, 0, 15))).toBe('2026-01')
    expect(monthKeyOf(new Date(2026, 8, 1))).toBe('2026-09')
    expect(monthKeyOf(new Date(2026, 11, 31))).toBe('2026-12')
  })

  it('reads local parts, so a positive-offset timezone keeps the local month', () => {
    // 1 Mar 2026 00:30 local in Budapest is still February in UTC. The month
    // navigator labels what the user sees, so the local month is the right answer.
    const localMarch = new Date(2026, 2, 1, 0, 30)
    expect(monthKeyOf(localMarch)).toBe('2026-03')
  })
})

describe('shiftMonthKey', () => {
  it('steps forward and back within a year', () => {
    expect(shiftMonthKey('2026-05', 1)).toBe('2026-06')
    expect(shiftMonthKey('2026-05', -1)).toBe('2026-04')
  })

  it('rolls the year over in both directions', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
  })

  it('never lands on a neighbouring month via day overflow', () => {
    // The classic Date pitfall: 31 Jan + 1 month overflows to 3 March. The helper
    // anchors on day 1, so every month key round-trips cleanly.
    for (let m = 1; m <= 12; m++) {
      const key = `2026-${String(m).padStart(2, '0')}`
      expect(shiftMonthKey(shiftMonthKey(key, 1), -1)).toBe(key)
    }
  })

  it('is stable across a multi-year walk', () => {
    let key = '2024-01'
    for (let i = 0; i < 36; i++) key = shiftMonthKey(key, 1)
    expect(key).toBe('2027-01')
  })
})
