import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const categoryFindUnique = vi.fn()
const txFindMany = vi.fn()
const txCreate = vi.fn()
const txUpdate = vi.fn()
const txFindUnique = vi.fn()

const client = {
  transaction: { create: txCreate, update: txUpdate, findUnique: txFindUnique },
  recurringRule: { findUnique: vi.fn(), update: vi.fn() },
}

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/fx', () => ({
  lockRate: vi.fn(async () => ({ fxRate: 1, fxAnchor: 'HUF' })),
  getAnchorCurrency: vi.fn(async () => 'HUF'),
  frozenToAnchor: vi.fn(async (amount: number) => amount),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    category: { findUnique: categoryFindUnique },
    transaction: { findMany: txFindMany },
    $transaction: vi.fn(async (cb: (tx: typeof client) => unknown) => cb(client)),
  },
}))

const withdrawal = {
  date: '2026-10-10', description: 'Lisbon trip', amount: 150000, currency: 'HUF' as const,
  type: 'WITHDRAWAL' as const, categoryId: 'travel',
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'user-1' } })
  categoryFindUnique.mockResolvedValue({ kind: 'SAVINGS', name: 'Travel' })
  // Travel holds 400 000 in, 100 000 out.
  txFindMany.mockResolvedValue([
    { amount: -400000, currency: 'HUF', fxRate: 1, fxAnchor: 'HUF', type: 'SAVINGS' },
    { amount: 100000, currency: 'HUF', fxRate: 1, fxAnchor: 'HUF', type: 'WITHDRAWAL' },
  ])
  txCreate.mockResolvedValue({ id: 'tx-new' })
})

describe('savings withdrawals', () => {
  it('stores a withdrawal positive, against its pot', async () => {
    const { upsertTransaction } = await import('@/server-actions/transactions')
    expect(await upsertTransaction(withdrawal)).toEqual({ ok: true })
    expect(txCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 150000, type: 'WITHDRAWAL', categoryId: 'travel', recurringRuleId: null }),
    })
  })

  it('refuses to take more than the pot holds', async () => {
    const { upsertTransaction } = await import('@/server-actions/transactions')
    const result = await upsertTransaction({ ...withdrawal, amount: 300001 })
    expect(result).toEqual({ error: expect.stringMatching(/^Travel only holds 300\D000 Ft\.$/) })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('judges an edit without the row being edited', async () => {
    txFindUnique.mockResolvedValue({ recurringRuleId: null, coversDueDate: null, currency: 'HUF', fxRate: 1, fxAnchor: 'HUF' })
    const { upsertTransaction } = await import('@/server-actions/transactions')
    await upsertTransaction({ ...withdrawal, id: 'tx-1' })
    expect(txFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ categoryId: 'travel', id: { not: 'tx-1' } }),
    }))
  })

  it('rejects a withdrawal from a category that is not a savings pot', async () => {
    categoryFindUnique.mockResolvedValue({ kind: 'EXPENSE', name: 'Groceries' })
    const { upsertTransaction } = await import('@/server-actions/transactions')
    expect(await upsertTransaction(withdrawal)).toEqual({ error: '"Groceries" is not a savings category.' })
  })

  it('rejects a withdrawal linked to a recurring rule', async () => {
    const { upsertTransaction } = await import('@/server-actions/transactions')
    expect(await upsertTransaction({ ...withdrawal, recurringRuleId: 'rule-1', logEarly: true }))
      .toEqual({ error: 'A withdrawal cannot be linked to a recurring rule.' })
  })

  it('stores a deposit negative whatever sign it arrived with', async () => {
    const { upsertTransaction } = await import('@/server-actions/transactions')
    await upsertTransaction({ ...withdrawal, type: 'SAVINGS', amount: 50000 })
    expect(txCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: -50000, type: 'SAVINGS' }) })
    expect(txFindMany).not.toHaveBeenCalled()
  })
})
