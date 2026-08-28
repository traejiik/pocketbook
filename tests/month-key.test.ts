import { describe, expect, it, vi } from 'vitest'

// `monthKeyOf` / `shiftMonthKey` replaced `date-fns` (`format`, `subMonths`,
// `addMonths`) in the Transactions month navigator so the client bundle no
// longer eagerly loads the library. These pin the behaviour that swap relied on:
// local-part reads (not UTC) and correct year rollover in both directions.

import { dayKeyOf, monthKeyOf, shiftMonthKey, todayIso } from '@/lib/format'

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

describe('dayKeyOf', () => {
  it('formats a date as zero-padded YYYY-MM-DD', () => {
    expect(dayKeyOf(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dayKeyOf(new Date(2026, 8, 30))).toBe('2026-09-30')
    expect(dayKeyOf(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('reads local parts, so a positive-offset timezone keeps the local day', () => {
    expect(dayKeyOf(new Date(2026, 2, 1, 0, 30))).toBe('2026-03-01')
  })
})

describe('todayIso', () => {
  // Date defaults used to come from `toISOString().slice(0, 10)`, which reports the
  // UTC day. Between local midnight and the UTC rollover that is still yesterday, so
  // a transaction logged at 00:40 in Budapest was stored a day early.
  const withTimezone = (tz: string, run: () => void) => {
    const original = process.env.TZ
    process.env.TZ = tz
    try {
      run()
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
      vi.useRealTimers()
    }
  }

  it('follows the local calendar day when UTC is still on the previous one', () => {
    withTimezone('Europe/Budapest', () => {
      vi.useFakeTimers()
      // 23:40 UTC on 28 Feb is 00:40 on 1 Mar in Budapest (CET, +1).
      vi.setSystemTime(new Date('2026-02-28T23:40:00Z'))
      expect(todayIso()).toBe('2026-03-01')
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-02-28')
    })
  })

  it('agrees with UTC once the day has rolled over there too', () => {
    withTimezone('Europe/Budapest', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-01T09:00:00Z'))
      expect(todayIso()).toBe('2026-03-01')
    })
  })
})
