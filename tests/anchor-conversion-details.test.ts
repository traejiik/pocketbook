import { describe, expect, it, vi } from 'vitest'

const liveRate = (amount: number, currency: string): number | null => {
  if (currency === 'USD') return amount * 358.4
  if (currency === 'EUR') return amount * 396.1
  if (currency === 'HUF') return amount
  return null
}

vi.mock('@/lib/fx', () => ({
  toAnchor: vi.fn(async (amount: number, currency: string) => liveRate(amount, currency)),
  // Frozen read: use the stored rate when present, else fall back to the live rate.
  frozenToAnchor: vi.fn(async (amount: number, currency: string, fxRate: number | null) =>
    fxRate != null ? amount * fxRate : liveRate(amount, currency),
  ),
  isCurrency: (value: string) => ['HUF', 'USD', 'EUR', 'GBP'].includes(value),
}))

const prismaMock = {
  category: { findMany: vi.fn() },
  transaction: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
}

// `$queryRaw` is a tagged template, so the mock receives the string fragments as
// its first argument. Rejoining them gives the SQL the read actually issues.
const lastRawSql = () => (prismaMock.$queryRaw.mock.calls.at(-1)?.[0] as string[]).join('?')

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

// Pass-through: `unstable_cache` needs a Next.js incremental cache to exist, and
// these tests assert conversion maths rather than caching behaviour.
vi.mock('next/cache', () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: vi.fn(),
}))

describe('anchor conversion detail amounts', () => {
  it('serialises recurring rules with converted anchor equivalents', async () => {
    const rules = [
      {
        id: 'usd-rule',
        name: 'Side Hustle',
        amount: 1000,
        currency: 'USD',
        cycle: 'MONTHLY',
        nextDue: new Date('2026-05-29T00:00:00.000Z'),
        kind: 'INCOME',
        categoryId: 'freelance',
        installmentPaid: null,
        installmentTotal: null,
        installmentEndsOn: null,
        archived: false,
        category: { id: 'freelance', name: 'Freelance', color: '#5AA3FF', kind: 'INCOME' },
      },
      {
        id: 'huf-rule',
        name: 'Rent',
        amount: 210000,
        currency: 'HUF',
        cycle: 'MONTHLY',
        nextDue: new Date('2026-06-05T00:00:00.000Z'),
        kind: 'EXPENSE',
        categoryId: 'rent',
        installmentPaid: null,
        installmentTotal: null,
        installmentEndsOn: null,
        archived: false,
        category: { id: 'rent', name: 'Rent', color: '#FF6B6B', kind: 'EXPENSE' },
      },
    ]

    const { buildRecurringRuleViewModels } = await import('@/lib/recurring-view-model')
    const serialised = await buildRecurringRuleViewModels(rules, 'HUF')

    expect(serialised.find((rule) => rule.id === 'usd-rule')?.anchorEquivalent).toBe(358400)
    expect(serialised.find((rule) => rule.id === 'huf-rule')?.anchorEquivalent).toBeNull()
  })

  it('sums category transaction totals in anchor currency', async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'subs', name: 'Subscriptions', color: '#C58CFF', kind: 'EXPENSE' },
    ])
    // Postgres returns `numeric`/`bigint` as strings, which is what the read has
    // to coerce — mocking them as JS numbers would hide that.
    prismaMock.$queryRaw.mockResolvedValue([
      { categoryId: 'subs', currency: 'HUF', fxRate: null, fxAnchor: null, total: '1000', n: '1' },
      { categoryId: 'subs', currency: 'EUR', fxRate: null, fxAnchor: null, total: '4.99', n: '1' },
    ])

    const { getCategoriesWithStats } = await import('@/lib/aggregations')
    const [category] = await getCategoriesWithStats()

    expect(category.txTotalHUF).toBe(2977)
    // A category's groups are per (currency, locked rate), so its count is the
    // sum of theirs rather than any single group's.
    expect(category.txCount).toBe(2)
  })

  it('takes the absolute value inside the SUM, in SQL', async () => {
    // The load-bearing detail of the grouped aggregation. `amount` is stored
    // signed and the sign is NOT reliable — Server Actions normalise it by type,
    // but CSV import writes whatever the file carried, so one category can hold
    // EXPENSE rows of both signs. `SUM(ABS(x))` and `ABS(SUM(x))` then disagree,
    // and the cheaper Prisma `groupBy` + `_sum` spelling can only express the
    // second. If this assertion ever fails, category totals are silently
    // cancelling instead of accumulating.
    prismaMock.category.findMany.mockResolvedValue([])
    prismaMock.$queryRaw.mockResolvedValue([])

    const { getCategoriesWithStats } = await import('@/lib/aggregations')
    await getCategoriesWithStats()

    const sql = lastRawSql().replace(/\s+/g, ' ')
    expect(sql).toMatch(/SUM\(ABS\("amount"\)\)/)
    expect(sql).toMatch(/GROUP BY "categoryId", "currency", "fxRate", "fxAnchor"/)
  })

  it('counts unconvertible rows but leaves them out of the total', async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'subs', name: 'Subscriptions', color: '#C58CFF', kind: 'EXPENSE' },
    ])
    prismaMock.$queryRaw.mockResolvedValue([
      { categoryId: 'subs', currency: 'HUF', fxRate: null, fxAnchor: null, total: '1000', n: '2' },
      // GBP has no stored pair in this mock, so it converts to null.
      { categoryId: 'subs', currency: 'GBP', fxRate: null, fxAnchor: null, total: '50', n: '3' },
    ])

    const { getCategoriesWithStats } = await import('@/lib/aggregations')
    const [category] = await getCategoriesWithStats()

    expect(category.txTotalHUF).toBe(1000)
    expect(category.txCount).toBe(5)
  })
})
