import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findSettings: vi.fn(),
  findRates: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appSettings: { findFirst: mocks.findSettings },
    exchangeRate: { findMany: mocks.findRates },
  },
}))

// Only HUF pairs are stored — every cross rate has to be triangulated through HUF.
const HUF_PAIRS = [
  { fromCurrency: 'HUF', toCurrency: 'USD', rate: 0.0028 },
  { fromCurrency: 'USD', toCurrency: 'HUF', rate: 358.4 },
  { fromCurrency: 'HUF', toCurrency: 'EUR', rate: 0.0025 },
  { fromCurrency: 'EUR', toCurrency: 'HUF', rate: 396.1 },
]

describe('fx rate resolution', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.findSettings.mockResolvedValue({ anchorCurrency: 'HUF' })
    mocks.findRates.mockResolvedValue(HUF_PAIRS)
  })

  it('converts directly to the anchor currency', async () => {
    const { toAnchor } = await import('@/lib/fx')
    expect(await toAnchor(10, 'USD')).toBeCloseTo(3584)
  })

  it('triangulates a cross rate through a pivot currency', async () => {
    const { getRate } = await import('@/lib/fx')
    // EUR→USD is not stored; derive via EUR→HUF→USD.
    expect(await getRate('EUR', 'USD')).toBeCloseTo(396.1 * 0.0028)
  })

  it('triangulates to a non-HUF anchor instead of dropping the row', async () => {
    mocks.findSettings.mockResolvedValue({ anchorCurrency: 'USD' })
    const { toAnchor } = await import('@/lib/fx')
    expect(await toAnchor(100, 'EUR')).toBeCloseTo(100 * 396.1 * 0.0028)
  })

  it('returns null (not 0) when no conversion path exists', async () => {
    const { toAnchor } = await import('@/lib/fx')
    expect(await toAnchor(50, 'GBP')).toBeNull()
  })
})
