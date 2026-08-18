import { beforeEach, describe, expect, it, vi } from 'vitest'

// The aggregation reads are wrapped in `unstable_cache`, which stores entries as
// JSON. A cache *miss* returns the callback's value directly; a cache *hit*
// returns `JSON.parse(...)` of what was stored. Anything that doesn't survive
// that round-trip (a `Date`, a Prisma `Decimal`) would therefore have a different
// runtime shape depending on whether the entry happened to be warm — which is
// exactly the kind of bug that only shows up in production, on the second
// pageview. These tests pin the serialisation contract and the tag matrix.

type CacheRegistration = {
  keyParts: string[]
  options: { tags: string[]; revalidate: number }
}

const mocks = vi.hoisted(() => ({
  ruleFindMany: vi.fn(),
  registrations: [] as CacheRegistration[],
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  unstable_cache: (
    fn: (...args: unknown[]) => Promise<unknown>,
    keyParts: string[],
    options: { tags: string[]; revalidate: number },
  ) => {
    mocks.registrations.push({ keyParts, options })
    // Always simulate a cache HIT, so every assertion below runs against the
    // shape callers actually get once an entry is warm.
    return async (...args: unknown[]) => JSON.parse(JSON.stringify(await fn(...args)))
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    transaction: { findMany: vi.fn(), groupBy: vi.fn() },
    recurringRule: { findMany: mocks.ruleFindMany },
    category: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/fx', () => ({
  toAnchor: vi.fn(async (amount: number) => amount * 2),
  frozenToAnchor: vi.fn(async (amount: number) => amount),
}))

import { getUpcomingRenewals } from '@/lib/aggregations'
import { AGGREGATION_TTL_SECONDS, CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache'

// Stands in for a Prisma `Decimal`: not a number, coerces through `Number()`,
// and serialises to a string rather than a number.
const decimal = (value: number) => ({
  toString: () => String(value),
  toJSON: () => String(value),
  valueOf: () => value,
})

const rule = {
  id: 'netflix',
  name: 'Netflix',
  amount: decimal(4990),
  currency: 'HUF',
  cycle: 'MONTHLY',
  nextDue: new Date('2026-06-20T00:00:00.000Z'),
  kind: 'EXPENSE',
  categoryId: 'subs',
  installmentPaid: 3,
  installmentTotal: 12,
  installmentEndsOn: new Date('2027-03-20T00:00:00.000Z'),
  archived: false,
  category: { id: 'subs', name: 'Subscriptions', color: '#C58CFF', kind: 'EXPENSE' },
}

describe('cached renewals survive the cache round-trip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
    mocks.ruleFindMany.mockResolvedValue([rule])
  })

  it('rehydrates nextDue and installmentEndsOn as real Dates', async () => {
    const [renewal] = await getUpcomingRenewals(30)

    // The dashboard and renewals pages call Date methods on both of these.
    expect(renewal.rule.nextDue).toBeInstanceOf(Date)
    expect(renewal.rule.nextDue.toISOString()).toBe('2026-06-20T00:00:00.000Z')
    expect(renewal.rule.installmentEndsOn).toBeInstanceOf(Date)
    expect(renewal.rule.installmentEndsOn?.toISOString()).toBe('2027-03-20T00:00:00.000Z')

    vi.useRealTimers()
  })

  it('emits amount as a number rather than a stringified Decimal', async () => {
    const [renewal] = await getUpcomingRenewals(30)

    expect(renewal.rule.amount).toBe(4990)
    expect(renewal.hufEquivalent).toBe(9980)
    expect(renewal.daysAway).toBe(5)

    vi.useRealTimers()
  })

  it('keeps a null installmentEndsOn null instead of epoch', async () => {
    mocks.ruleFindMany.mockResolvedValue([{ ...rule, installmentEndsOn: null }])

    const [renewal] = await getUpcomingRenewals(30)

    expect(renewal.rule.installmentEndsOn).toBeNull()

    vi.useRealTimers()
  })
})

describe('cache tag matrix', () => {
  // Drift here is silent and expensive: a read that forgets a tag keeps serving
  // stale money numbers until the TTL backstop expires.
  const registrationFor = (key: string) =>
    mocks.registrations.find((r) => r.keyParts.includes(key))

  it.each([
    ['kpis-for-range', [CACHE_TAGS.transactions, CACHE_TAGS.fx]],
    ['expenses-by-category-for-range', [CACHE_TAGS.transactions, CACHE_TAGS.categories, CACHE_TAGS.fx]],
    ['monthly-trend', [CACHE_TAGS.transactions, CACHE_TAGS.fx]],
    ['upcoming-renewals', [CACHE_TAGS.recurring, CACHE_TAGS.categories, CACHE_TAGS.fx]],
    ['categories-with-stats', [CACHE_TAGS.transactions, CACHE_TAGS.categories, CACHE_TAGS.fx]],
    ['recurring-budget-summary', [CACHE_TAGS.recurring, CACHE_TAGS.categories, CACHE_TAGS.fx]],
  ])('%s is invalidated by the right tags', (key, tags) => {
    expect(registrationFor(key)?.options.tags).toEqual(tags)
  })

  it('gives every cached read the TTL backstop', () => {
    expect(mocks.registrations).not.toHaveLength(0)
    for (const registration of mocks.registrations) {
      expect(registration.options.revalidate).toBe(AGGREGATION_TTL_SECONDS)
    }
  })
})

describe('revalidateFinanceTags', () => {
  // `expire: 0` (not a stale-while-revalidate profile) is what makes a write
  // visible on the very next read instead of after a grace window.
  it('expires each tag immediately', () => {
    mocks.revalidateTag.mockClear()

    revalidateFinanceTags(CACHE_TAGS.transactions, CACHE_TAGS.recurring)

    expect(mocks.revalidateTag).toHaveBeenCalledTimes(2)
    expect(mocks.revalidateTag).toHaveBeenCalledWith('pb-transactions', { expire: 0 })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('pb-recurring', { expire: 0 })
  })
})
