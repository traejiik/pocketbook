import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const revalidatePathMock = vi.fn()
const txFindUnique = vi.fn()
const txCreate = vi.fn()
const txUpdate = vi.fn()
const txDelete = vi.fn()
const txCount = vi.fn()
const ruleFindUnique = vi.fn()
const ruleUpdate = vi.fn()
const transactionMock = vi.fn()

const transactionClient = {
  transaction: { create: txCreate, update: txUpdate, delete: txDelete, count: txCount },
  recurringRule: { findUnique: ruleFindUnique, update: ruleUpdate },
}

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    transaction: { findUnique: txFindUnique },
    $transaction: transactionMock,
  },
}))

describe('transaction installment reconciliation', () => {
  beforeEach(() => {
    vi.resetModules()
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    transactionMock.mockImplementation(async (cb) => cb(transactionClient))
    txDelete.mockResolvedValue({})
    txCreate.mockResolvedValue({ id: 'tx-new' })
    txUpdate.mockResolvedValue({})
    ruleUpdate.mockResolvedValue({})
  })

  it('rolls back installmentPaid and un-archives the rule when a linked payment is deleted', async () => {
    txFindUnique.mockResolvedValue({ recurringRuleId: 'rule-phone' })
    ruleFindUnique.mockResolvedValue({ installmentTotal: 15 })
    txCount.mockResolvedValue(14) // one payment removed → 14 remain

    const { deleteTransaction } = await import('@/server-actions/transactions')
    await deleteTransaction('tx-1')

    expect(txDelete).toHaveBeenCalledWith({ where: { id: 'tx-1' } })
    expect(ruleUpdate).toHaveBeenCalledWith({
      where: { id: 'rule-phone' },
      data: { installmentPaid: 14, archived: false },
    })
  })

  it('leaves rules untouched when the deleted transaction is not linked to one', async () => {
    txFindUnique.mockResolvedValue({ recurringRuleId: null })

    const { deleteTransaction } = await import('@/server-actions/transactions')
    await deleteTransaction('tx-2')

    expect(txDelete).toHaveBeenCalledWith({ where: { id: 'tx-2' } })
    expect(ruleFindUnique).not.toHaveBeenCalled()
    expect(ruleUpdate).not.toHaveBeenCalled()
  })

  it('does not touch non-installment rules on delete', async () => {
    txFindUnique.mockResolvedValue({ recurringRuleId: 'rule-rent' })
    ruleFindUnique.mockResolvedValue({ installmentTotal: null })

    const { deleteTransaction } = await import('@/server-actions/transactions')
    await deleteTransaction('tx-3')

    expect(ruleUpdate).not.toHaveBeenCalled()
  })

  it('archives the rule when creating the final installment payment', async () => {
    ruleFindUnique.mockResolvedValue({ installmentTotal: 15 })
    txCount.mockResolvedValue(15) // count after the new payment is created

    const { upsertTransaction } = await import('@/server-actions/transactions')
    await upsertTransaction({
      date: '2026-05-20',
      description: 'Phone plan',
      amount: 6500,
      currency: 'HUF',
      type: 'EXPENSE',
      categoryId: 'cat_phone',
      recurringRuleId: 'rule-phone',
    })

    expect(txCreate).toHaveBeenCalledOnce()
    expect(ruleUpdate).toHaveBeenCalledWith({
      where: { id: 'rule-phone' },
      data: { installmentPaid: 15, archived: true },
    })
  })

  it('reconciles both the old and new rule when an edit moves the link', async () => {
    txFindUnique.mockResolvedValue({ recurringRuleId: 'rule-old' })
    ruleFindUnique.mockResolvedValue({ installmentTotal: 12 })
    txCount.mockResolvedValue(5)

    const { upsertTransaction } = await import('@/server-actions/transactions')
    await upsertTransaction({
      id: 'tx-9',
      date: '2026-05-20',
      description: 'Moved payment',
      amount: 6500,
      currency: 'HUF',
      type: 'EXPENSE',
      categoryId: 'cat_phone',
      recurringRuleId: 'rule-new',
    })

    expect(txUpdate).toHaveBeenCalledOnce()
    const reconciledRuleIds = ruleUpdate.mock.calls.map((c) => c[0].where.id)
    expect(new Set(reconciledRuleIds)).toEqual(new Set(['rule-old', 'rule-new']))
  })
})
