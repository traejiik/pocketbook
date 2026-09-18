import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const deleteMany = vi.fn()
const settingsUpdate = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    aiInsight: { deleteMany },
    transaction: { deleteMany },
    recurringRule: { deleteMany },
    category: { deleteMany },
    appSettings: { update: settingsUpdate, findUnique: vi.fn() },
    exchangeRate: { upsert: vi.fn(), deleteMany: vi.fn() },
    user: { findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/frankfurter', () => ({ syncAllAutoRates: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

describe('clearAllData', () => {
  beforeEach(() => {
    authMock.mockResolvedValue(null)
    vi.resetModules()
  })

  it('rejects unauthenticated callers before deleting anything', async () => {
    const { clearAllData } = await import('@/server-actions/settings')
    await expect(clearAllData()).rejects.toThrow('Unauthorised')
    expect(deleteMany).not.toHaveBeenCalled()
  })
})

describe('setAnchorCurrency', () => {
  beforeEach(() => {
    authMock.mockResolvedValue(null)
    vi.resetModules()
  })

  it('rejects unauthenticated callers', async () => {
    const { setAnchorCurrency } = await import('@/server-actions/settings')
    await expect(setAnchorCurrency('EUR')).rejects.toThrow('Unauthorised')
  })
})

describe('opening balance', () => {
  beforeEach(() => {
    settingsUpdate.mockReset()
    vi.resetModules()
  })

  it('rejects unauthenticated callers before writing', async () => {
    authMock.mockResolvedValue(null)
    const { setOpeningBalance, clearOpeningBalance } = await import('@/server-actions/settings')
    await expect(setOpeningBalance({ amount: 1, currency: 'HUF', month: '2026-08' })).rejects.toThrow('Unauthorised')
    await expect(clearOpeningBalance()).rejects.toThrow('Unauthorised')
    expect(settingsUpdate).not.toHaveBeenCalled()
  })

  it('rejects a month key that is not YYYY-MM', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } })
    const { setOpeningBalance } = await import('@/server-actions/settings')
    await expect(setOpeningBalance({ amount: 1, currency: 'HUF', month: '2026-13' })).rejects.toThrow()
    await expect(setOpeningBalance({ amount: 1, currency: 'HUF', month: '2026-8' })).rejects.toThrow()
    expect(settingsUpdate).not.toHaveBeenCalled()
  })

  it('writes amount, currency and effective month to the singleton row', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } })
    const { setOpeningBalance } = await import('@/server-actions/settings')
    await setOpeningBalance({ amount: 100_000, currency: 'HUF', month: '2026-08' })
    expect(settingsUpdate).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      data: { openingBalance: 100_000, openingBalanceCurrency: 'HUF', openingBalanceMonth: '2026-08' },
    })
  })

  it('clearing nulls the effective month so carry-over restarts from zero', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } })
    const { clearOpeningBalance } = await import('@/server-actions/settings')
    await clearOpeningBalance()
    expect(settingsUpdate).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      data: { openingBalance: 0, openingBalanceMonth: null },
    })
  })
})
