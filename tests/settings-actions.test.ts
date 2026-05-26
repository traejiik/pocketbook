import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const deleteMany = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    aiInsight: { deleteMany },
    transaction: { deleteMany },
    recurringRule: { deleteMany },
    category: { deleteMany },
    appSettings: { update: vi.fn(), findUnique: vi.fn() },
    exchangeRate: { upsert: vi.fn(), deleteMany: vi.fn() },
    user: { findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/frankfurter', () => ({ syncAllAutoRates: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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
