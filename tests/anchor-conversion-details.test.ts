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
}))

const prismaMock = {
  category: { findMany: vi.fn() },
  transaction: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
}

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

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
    prismaMock.transaction.groupBy.mockResolvedValue([
      { categoryId: 'subs', _count: { id: 2 } },
    ])
    prismaMock.transaction.findMany.mockResolvedValue([
      { categoryId: 'subs', amount: 1000, currency: 'HUF' },
      { categoryId: 'subs', amount: 4.99, currency: 'EUR' },
    ])

    const { getCategoriesWithStats } = await import('@/lib/aggregations')
    const [category] = await getCategoriesWithStats()

    expect(category.txTotalHUF).toBe(2977)
  })
})
