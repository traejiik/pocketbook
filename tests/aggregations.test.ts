import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Aggregation month/day boundaries must be built in UTC so they line up with how
// `@db.Date` columns store calendar days. Local-timezone constructors slip a day
// in positive offsets (e.g. Budapest), silently pulling in the previous month or
// dropping the current one. These tests pin the boundaries handed to Prisma.

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  ruleFindMany: vi.fn(),
  settingsFindUnique: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    transaction: { findMany: mocks.findMany },
    recurringRule: { findMany: mocks.ruleFindMany },
    appSettings: { findUnique: mocks.settingsFindUnique },
    $queryRaw: mocks.queryRaw,
  },
}))

// FX is exercised elsewhere; here it just needs to return a number so the
// reducers run. Identity conversion keeps the focus on date boundaries.
vi.mock('@/lib/fx', () => ({
  toAnchor: vi.fn(async (amount: number) => amount),
  // `null` for the one currency with no FX path, so unconvertible groups are
  // observable in the carry-over tests below.
  frozenToAnchor: vi.fn(async (amount: number, currency: string) => (currency === 'XXX' ? null : amount)),
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
  getLastMonthExpensesByCategory,
  getUpcomingRenewals,
  getMonthlyTrend,
  getOpeningBalance,
  getBalanceMonthNet,
  getCurrentMonthOpeningBalance,
  getBalanceTrend,
} from '@/lib/aggregations'
import { toAnchor } from '@/lib/fx'

const iso = (d: Date) => d.toISOString()

// Mid-month, mid-day clock: the everyday case where local-time construction
// still slips the boundary back a day in any positive-offset timezone.
const NOW = new Date('2026-06-15T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.findMany.mockResolvedValue([])
  mocks.ruleFindMany.mockResolvedValue([])
  mocks.settingsFindUnique.mockResolvedValue(null)
  mocks.queryRaw.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

function lastDateWhere() {
  const call = mocks.findMany.mock.calls.at(-1)?.[0]
  return call?.where?.date as { gte: Date; lt: Date }
}

function lastCall() {
  return mocks.findMany.mock.calls.at(-1)?.[0] as {
    select?: Record<string, unknown>
    include?: Record<string, unknown>
  }
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

  it('getLastMonthExpensesByCategory spans the previous UTC month', async () => {
    await getLastMonthExpensesByCategory()
    const { gte, lt } = lastDateWhere()
    expect(iso(gte)).toBe('2026-05-01T00:00:00.000Z')
    expect(iso(lt)).toBe('2026-06-01T00:00:00.000Z')
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

  it('splits rows into their own month, keeps empty months as zero and counts rows per month', async () => {
    mocks.findMany.mockResolvedValue([
      tx('2026-04-10T00:00:00.000Z', 'INCOME', 1000),
      tx('2026-04-30T00:00:00.000Z', 'EXPENSE', 300),
      // May deliberately has no rows.
      tx('2026-06-01T00:00:00.000Z', 'INCOME', 500),
      tx('2026-06-15T00:00:00.000Z', 'SAVINGS', 200),
    ])

    expect(await getMonthlyTrend(3)).toEqual([
      { month: 'Apr', net: 700, count: 2 },
      { month: 'May', net: 0, count: 0 },   // no rows: the chart draws a placeholder, not a zero bar
      { month: 'Jun', net: 300, count: 2 },
    ])
  })

  it('ignores rows that fall outside the window', async () => {
    mocks.findMany.mockResolvedValue([
      tx('2026-03-31T00:00:00.000Z', 'INCOME', 9999),   // before the window
      tx('2026-07-01T00:00:00.000Z', 'INCOME', 9999),   // after it
      tx('2026-05-05T00:00:00.000Z', 'INCOME', 100),
    ])

    expect(await getMonthlyTrend(3)).toEqual([
      { month: 'Apr', net: 0, count: 0 },
      { month: 'May', net: 100, count: 1 },
      { month: 'Jun', net: 0, count: 0 },
    ])
  })

  it('boundary rows land in the month they start, not the one before', async () => {
    mocks.findMany.mockResolvedValue([
      tx('2026-05-01T00:00:00.000Z', 'INCOME', 400),   // first instant of May
      tx('2026-05-31T00:00:00.000Z', 'EXPENSE', 150),  // last day of May
    ])

    expect(await getMonthlyTrend(3)).toEqual([
      { month: 'Apr', net: 0, count: 0 },
      { month: 'May', net: 250, count: 2 },
      { month: 'Jun', net: 0, count: 0 },
    ])
  })
})

// These reads scan a date range and then convert every row, so the row *shape* is
// the payload. Selecting whole rows dragged `id`, `description`, `createdAt` and
// both foreign keys along for columns the reducers never read. `select` is easy to
// widen back by accident — an added `include`, or a copy-paste from a read that
// does need the whole row — so the projections are pinned here.
describe('aggregation reads project only the columns they use', () => {
  it('kpisForRange selects just the FX columns and the type', async () => {
    await getCurrentMonthKpis()
    const { select, include } = lastCall()

    expect(Object.keys(select ?? {}).sort()).toEqual(
      ['amount', 'currency', 'fxAnchor', 'fxRate', 'type'],
    )
    expect(include).toBeUndefined()
  })

  it('monthlyTrendFrom also selects date, which it now buckets on in memory', async () => {
    await getMonthlyTrend(3)
    const { select, include } = lastCall()

    expect(Object.keys(select ?? {}).sort()).toEqual(
      ['amount', 'currency', 'date', 'fxAnchor', 'fxRate', 'type'],
    )
    expect(include).toBeUndefined()
  })

  it('expensesByCategoryForRange joins only the two category columns it denormalises', async () => {
    await getExpensesByCategory()
    const { select, include } = lastCall()

    // `include: { category: true }` repeated the whole joined row — `id` and
    // `kind` included — once per transaction of that category.
    expect(include).toBeUndefined()
    expect(Object.keys(select ?? {}).sort()).toEqual(
      ['amount', 'category', 'categoryId', 'currency', 'fxAnchor', 'fxRate'],
    )
    expect(select?.category).toEqual({ select: { name: true, color: true } })
  })
})

describe('getOpeningBalance derives the month-to-month carry-over', () => {
  // The raw query is a tagged template: `strings` are the SQL fragments, and the
  // bound values are the interpolations. `Prisma.sql`/`Prisma.empty` fragments
  // land as `Sql` objects with their own `strings`/`values`.
  function lastQuery() {
    const call = mocks.queryRaw.mock.calls.at(-1) as [TemplateStringsArray, ...unknown[]]
    const [strings, ...values] = call
    const text = strings.join('?')
    return { text, values }
  }

  const group = (type: string, total: number, currency = 'HUF', n = 1) => ({
    type,
    currency,
    fxRate: 1,
    fxAnchor: 'HUF',
    total: String(total),
    n: String(n),
  })

  it('sums all history before the month when no starting balance is configured', async () => {
    mocks.queryRaw.mockResolvedValue([
      group('INCOME', 500_000),
      group('EXPENSE', 320_000),
      group('SAVINGS', 50_000),
    ])

    const result = await getOpeningBalance('2026-09')

    // The exclusive upper bound is the month's first day; no lower bound applies.
    const { text, values } = lastQuery()
    expect(text).toContain('"date" < ?::date')
    expect(values[0]).toBe('2026-09-01')
    const lower = values[1] as { strings?: string[] }
    expect(lower.strings?.join('')).toBe('')

    expect(result.opening).toBe(130_000)
    expect(result.carriedFromLedger).toBe(130_000)
    expect(result.startingBalance).toBeNull()
    expect(toAnchor).not.toHaveBeenCalled()
  })

  it('adds the starting balance and starts the scan at its effective month', async () => {
    mocks.settingsFindUnique.mockResolvedValue({
      openingBalance: '100000',
      openingBalanceCurrency: 'HUF',
      openingBalanceMonth: '2026-07',
    })
    mocks.queryRaw.mockResolvedValue([group('INCOME', 40_000), group('EXPENSE', 15_000)])

    const result = await getOpeningBalance('2026-09')

    const { values } = lastQuery()
    expect(values[0]).toBe('2026-09-01')
    const lower = values[1] as { strings: string[]; values: unknown[] }
    expect(lower.strings.join('?')).toContain('"date" >= ?::date')
    expect(lower.values[0]).toBe('2026-07-01')

    expect(result.startingBalance).toBe(100_000)
    expect(result.carriedFromLedger).toBe(25_000)
    expect(result.opening).toBe(125_000)
  })

  it('is exactly the starting balance in the effective month itself', async () => {
    mocks.settingsFindUnique.mockResolvedValue({
      openingBalance: '100000',
      openingBalanceCurrency: 'HUF',
      openingBalanceMonth: '2026-08',
    })
    // `[2026-08-01, 2026-08-01)` is empty, so the ledger contributes nothing.
    mocks.queryRaw.mockResolvedValue([])

    const result = await getOpeningBalance('2026-08')

    const { values } = lastQuery()
    expect(values[0]).toBe('2026-08-01')
    expect((values[1] as { values: unknown[] }).values[0]).toBe('2026-08-01')
    expect(result.opening).toBe(100_000)
  })

  it('ignores the starting balance for months before its effective month', async () => {
    mocks.settingsFindUnique.mockResolvedValue({
      openingBalance: '100000',
      openingBalanceCurrency: 'HUF',
      openingBalanceMonth: '2026-08',
    })
    mocks.queryRaw.mockResolvedValue([group('INCOME', 10_000)])

    const result = await getOpeningBalance('2026-06')

    const lower = lastQuery().values[1] as { strings?: string[] }
    expect(lower.strings?.join('')).toBe('')
    expect(result.startingBalance).toBeNull()
    expect(result.opening).toBe(10_000)
  })

  it('counts unconvertible groups instead of treating them as zero', async () => {
    mocks.queryRaw.mockResolvedValue([group('INCOME', 10_000), group('EXPENSE', 999, 'XXX', 3)])

    const result = await getOpeningBalance('2026-09')

    expect(result.opening).toBe(10_000)
    expect(result.unconvertibleCount).toBe(3)
  })

  it('yields a null opening when the starting balance itself has no FX path', async () => {
    mocks.settingsFindUnique.mockResolvedValue({
      openingBalance: '250',
      openingBalanceCurrency: 'GBP',
      openingBalanceMonth: '2026-01',
    })
    vi.mocked(toAnchor).mockResolvedValueOnce(null)
    mocks.queryRaw.mockResolvedValue([group('INCOME', 10_000)])

    const result = await getOpeningBalance('2026-09')

    expect(result.opening).toBeNull()
    expect(result.carriedFromLedger).toBe(10_000)
  })

  it('the current-month helper keys off the same UTC month as the KPIs', async () => {
    await getCurrentMonthOpeningBalance()
    expect(lastQuery().values[0]).toBe('2026-06-01')
  })

  // Opening reads have no lower bound (`Prisma.empty`); a month's balance net is
  // the same query bounded to `[monthStart, nextMonthStart)`.
  function routeCarryOver(opening: number, netByMonthStart: Record<string, number>) {
    mocks.queryRaw.mockImplementation(async (...args: unknown[]) => {
      const lower = args[2] as { values?: unknown[] } | undefined
      const start = lower?.values?.[0] as string | undefined
      if (!start) return [group('INCOME', opening)]
      const net = netByMonthStart[start] ?? 0
      return net === 0 ? [] : [group(net > 0 ? 'INCOME' : 'EXPENSE', Math.abs(net))]
    })
  }

  it('only sums categories that count toward the balance', async () => {
    mocks.queryRaw.mockResolvedValue([])
    await getOpeningBalance('2026-09')
    const { text } = lastQuery()
    expect(text).toContain('JOIN "Category" c ON c."id" = t."categoryId"')
    expect(text).toContain('c."includeInBalance"')
  })

  it('getBalanceMonthNet reads the month itself, bounded to its own days', async () => {
    routeCarryOver(100_000, { '2026-09-01': -40_000 })

    expect(await getBalanceMonthNet('2026-09')).toBe(-40_000)
    const { values } = lastQuery()
    expect(values[0]).toBe('2026-10-01')
    expect((values[1] as { values: unknown[] }).values).toEqual(['2026-09-01'])
  })

  it('getBalanceTrend adds each month its own opening, not one opening plus a running sum', async () => {
    // Every month opens at 100 000 here; only June moves the balance (+50 000).
    // June's reported net is +80 000: the other 30 000 sits in a category left out
    // of the balance, so the trend must add the balance net, not the trend net.
    routeCarryOver(100_000, { '2026-06-01': 50_000 })
    mocks.findMany.mockResolvedValue([
      { date: new Date('2026-06-10T00:00:00.000Z'), amount: 80_000, currency: 'HUF', fxRate: 1, fxAnchor: 'HUF', type: 'INCOME' },
    ])

    const trend = await getBalanceTrend(6)

    expect(trend.map(t => t.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'])
    expect(trend.map(t => t.balance)).toEqual([100_000, 100_000, 100_000, 100_000, 100_000, 150_000])
    // One opening read per month in the window, bounded by that month's first day.
    const bounds = mocks.queryRaw.mock.calls.map(c => (c as unknown[])[1])
    expect(bounds).toEqual(expect.arrayContaining(['2026-01-01', '2026-06-01']))
  })
})
