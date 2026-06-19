import { beforeEach, describe, expect, it, vi } from 'vitest'

// Exercises the per-transaction FX lock: a transaction freezes its rate at write
// time, so later rate changes never move its anchor value (dashboard/ledger), while
// the live path stays available for recurring + as a fallback.

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

const HUF_PAIRS_DAY1 = [
  { fromCurrency: 'USD', toCurrency: 'HUF', rate: 358.4 },
  { fromCurrency: 'HUF', toCurrency: 'USD', rate: 0.0028 },
]
const HUF_PAIRS_DAY2 = [
  { fromCurrency: 'USD', toCurrency: 'HUF', rate: 400.0 }, // USD spiked overnight
  { fromCurrency: 'HUF', toCurrency: 'USD', rate: 0.0025 },
]

describe('lockRate', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.findSettings.mockResolvedValue({ anchorCurrency: 'HUF' })
    mocks.findRates.mockResolvedValue(HUF_PAIRS_DAY1)
  })

  it('snapshots the current rate to the anchor', async () => {
    const { lockRate } = await import('@/lib/fx')
    expect(await lockRate('USD')).toEqual({ fxRate: 358.4, fxAnchor: 'HUF' })
  })

  it('locks rate 1 for the anchor currency itself', async () => {
    const { lockRate } = await import('@/lib/fx')
    expect(await lockRate('HUF')).toEqual({ fxRate: 1, fxAnchor: 'HUF' })
  })

  it('locks against an explicitly requested anchor (used on anchor switch)', async () => {
    const { lockRate } = await import('@/lib/fx')
    expect(await lockRate('HUF', 'USD')).toEqual({ fxRate: 0.0028, fxAnchor: 'USD' })
  })

  it('returns a null rate (not 0) when no FX path exists', async () => {
    const { lockRate } = await import('@/lib/fx')
    expect(await lockRate('GBP')).toEqual({ fxRate: null, fxAnchor: 'HUF' })
  })
})

describe('frozenToAnchor', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.findSettings.mockResolvedValue({ anchorCurrency: 'HUF' })
    mocks.findRates.mockResolvedValue(HUF_PAIRS_DAY1)
  })

  it('uses the frozen rate, ignoring a later rate change (the core guard)', async () => {
    const { frozenToAnchor } = await import('@/lib/fx')
    // Logged at 358.4 → 100 USD froze at 35,840.
    const lockedAt = 358.4
    // Rates move to 400 afterwards…
    mocks.findRates.mockResolvedValue(HUF_PAIRS_DAY2)
    // …but the frozen value does NOT move.
    expect(await frozenToAnchor(100, 'USD', lockedAt, 'HUF')).toBe(35840)
  })

  it('falls back to a live conversion when no rate was locked (legacy rows)', async () => {
    const { frozenToAnchor } = await import('@/lib/fx')
    expect(await frozenToAnchor(100, 'USD', null, null)).toBeCloseTo(100 * 358.4)
  })

  it('falls back to live when the locked anchor no longer matches the current anchor', async () => {
    const { frozenToAnchor } = await import('@/lib/fx')
    // Row locked against USD, but the app anchor is HUF → recompute live.
    expect(await frozenToAnchor(100, 'USD', 0.0028, 'USD')).toBeCloseTo(100 * 358.4)
  })

  it('returns null when frozen rate is null and the live fallback also has no path', async () => {
    const { frozenToAnchor } = await import('@/lib/fx')
    expect(await frozenToAnchor(50, 'GBP', null, null)).toBeNull()
  })
})
