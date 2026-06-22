import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Aggregation month/day boundaries must be built in UTC so they line up with how
// `@db.Date` columns store calendar days. Local-timezone constructors slip a day
// in positive offsets (e.g. Budapest), silently pulling in the previous month or
// dropping the current one. These tests pin the boundaries handed to Prisma.

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  ruleFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    transaction: { findMany: mocks.findMany },
    recurringRule: { findMany: mocks.ruleFindMany },
  },
}))

// FX is exercised elsewhere; here it just needs to return a number so the
// reducers run. Identity conversion keeps the focus on date boundaries.
vi.mock('@/lib/fx', () => ({
  toAnchor: vi.fn(async (amount: number) => amount),
  frozenToAnchor: vi.fn(async (amount: number) => amount),
}))

import {
  getCurrentMonthKpis,
  getLastMonthKpis,
  getExpensesByCategory,
  getUpcomingRenewals,
  getMonthlyTrend,
} from '@/lib/aggregations'

const iso = (d: Date) => d.toISOString()

// Mid-month, mid-day clock: the everyday case where local-time construction
// still slips the boundary back a day in any positive-offset timezone.
const NOW = new Date('2026-06-15T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.findMany.mockResolvedValue([])
  mocks.ruleFindMany.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

function lastDateWhere() {
  const call = mocks.findMany.mock.calls.at(-1)?.[0]
  return call?.where?.date as { gte: Date; lt: Date }
}

describe('aggregation date boundaries are UTC', () => {
  it('getCurrentMonthKpis spans the current UTC month', async () => {
    await getCurrentMonthKpis()
    const { gte, lt } = lastDateWhere()
    expect(iso(gte)).toBe('2026-06-01T00:00:00.000Z')
    expect(iso(lt)).toBe('2026-07-01T00:00:00.000Z')
  })

  it('getLastMonthKpis spans the previous UTC month', async () => {
    await getLastMonthKpis()
    const { gte, lt } = lastDateWhere()
    expect(iso(gte)).toBe('2026-05-01T00:00:00.000Z')
    expect(iso(lt)).toBe('2026-06-01T00:00:00.000Z')
  })

  it('getExpensesByCategory spans the current UTC month', async () => {
    await getExpensesByCategory()
    const { gte, lt } = lastDateWhere()
    expect(iso(gte)).toBe('2026-06-01T00:00:00.000Z')
    expect(iso(lt)).toBe('2026-07-01T00:00:00.000Z')
  })

  it('getUpcomingRenewals anchors today/horizon at UTC midnight', async () => {
    await getUpcomingRenewals(7)
    const where = mocks.ruleFindMany.mock.calls.at(-1)?.[0]?.where as {
      nextDue: { gte: Date; lte: Date }
    }
    expect(iso(where.nextDue.gte)).toBe('2026-06-15T00:00:00.000Z')
    expect(iso(where.nextDue.lte)).toBe('2026-06-22T00:00:00.000Z')
  })

  it('getMonthlyTrend uses UTC month windows and UTC labels', async () => {
    const trend = await getMonthlyTrend(3)
    expect(trend.map((t) => t.month)).toEqual(['Apr', 'May', 'Jun'])

    const ranges = mocks.findMany.mock.calls.map((c) => c[0].where.date as { gte: Date; lt: Date })
    expect(ranges.map((r) => iso(r.gte))).toEqual([
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
      '2026-06-01T00:00:00.000Z',
    ])
    expect(ranges.map((r) => iso(r.lt))).toEqual([
      '2026-05-01T00:00:00.000Z',
      '2026-06-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ])
  })
})
