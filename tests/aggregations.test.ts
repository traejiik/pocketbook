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

// `unstable_cache` throws without a Next.js incremental cache, and caching is not
// what these tests are about — pass straight through to the underlying read so the
// boundaries handed to Prisma stay observable. The cache layer itself is covered in
// aggregation-cache.test.ts.
vi.mock('next/cache', () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: vi.fn(),
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

  it('getMonthlyTrend spans the whole window in one UTC query', async () => {
    const trend = await getMonthlyTrend(3)
    expect(trend.map((t) => t.month)).toEqual(['Apr', 'May', 'Jun'])

    // One round-trip for the window, not one per month. This is the invariant the
    // per-month `await prisma.findMany` loop used to break.
    expect(mocks.findMany).toHaveBeenCalledTimes(1)

    const { gte, lt } = lastDateWhere()
    expect(iso(gte)).toBe('2026-04-01T00:00:00.000Z')
    expect(iso(lt)).toBe('2026-07-01T00:00:00.000Z')
  })
})

describe('getMonthlyTrend buckets one row set by UTC month', () => {
  const tx = (date: string, type: string, amount: number) => ({
    date: new Date(date),
    amount,
    currency: 'HUF',
    fxRate: 1,
    fxAnchor: 'HUF',
    type,
  })

  it('splits rows into their own month and keeps empty months as zero', async () => {
    mocks.findMany.mockResolvedValue([
      tx('2026-04-10T00:00:00.000Z', 'INCOME', 1000),
      tx('2026-04-30T00:00:00.000Z', 'EXPENSE', 300),
      // May deliberately has no rows.
      tx('2026-06-01T00:00:00.000Z', 'INCOME', 500),
      tx('2026-06-15T00:00:00.000Z', 'SAVINGS', 200),
    ])

    expect(await getMonthlyTrend(3)).toEqual([
      { month: 'Apr', net: 700 },
      { month: 'May', net: 0 },
      { month: 'Jun', net: 300 },
    ])
  })

  it('ignores rows that fall outside the window', async () => {
    mocks.findMany.mockResolvedValue([
      tx('2026-03-31T00:00:00.000Z', 'INCOME', 9999),   // before the window
      tx('2026-07-01T00:00:00.000Z', 'INCOME', 9999),   // after it
      tx('2026-05-05T00:00:00.000Z', 'INCOME', 100),
    ])

    expect(await getMonthlyTrend(3)).toEqual([
      { month: 'Apr', net: 0 },
      { month: 'May', net: 100 },
      { month: 'Jun', net: 0 },
    ])
  })

  it('boundary rows land in the month they start, not the one before', async () => {
    mocks.findMany.mockResolvedValue([
      tx('2026-05-01T00:00:00.000Z', 'INCOME', 400),   // first instant of May
      tx('2026-05-31T00:00:00.000Z', 'EXPENSE', 150),  // last day of May
    ])

    expect(await getMonthlyTrend(3)).toEqual([
      { month: 'Apr', net: 0 },
      { month: 'May', net: 250 },
      { month: 'Jun', net: 0 },
    ])
  })
})
