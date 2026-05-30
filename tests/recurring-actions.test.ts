import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const revalidatePathMock = vi.fn()
const findDuplicateRule = vi.fn()
const createRule = vi.fn()
const updateRule = vi.fn()
const createBackfillTransactions = vi.fn()
const transactionMock = vi.fn()

const transactionClient = {
  recurringRule: { create: createRule },
  transaction: { createMany: createBackfillTransactions },
}

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    recurringRule: {
      findFirst: findDuplicateRule,
      create: createRule,
      update: updateRule,
    },
    transaction: {
      createMany: createBackfillTransactions,
    },
    $transaction: transactionMock,
  },
}))

function dateStr(value: Date) {
  // UTC getters — the action stores `@db.Date` at UTC midnight (timezone-independent).
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function validRule(overrides = {}) {
  return {
    name: 'Rent',
    amount: 210000,
    currency: 'HUF',
    cycle: 'MONTHLY',
    nextDue: '2026-06-05',
    kind: 'EXPENSE',
    categoryId: 'cat_rent',
    hasInstallment: false,
    installmentPaid: null,
    installmentTotal: null,
    installmentEndsOn: null,
    ...overrides,
  } as const
}

describe('upsertRecurringRule', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 29, 9)))
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    findDuplicateRule.mockResolvedValue(null)
    createRule.mockResolvedValue({ id: 'rule-1' })
    updateRule.mockResolvedValue({ id: 'rule-1' })
    createBackfillTransactions.mockResolvedValue({ count: 4 })
    transactionMock.mockImplementation(async (callback) => callback(transactionClient))
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a rule and its catch-up transactions atomically', async () => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')

    const result = await upsertRecurringRule(validRule())

    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(createRule).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Rent',
        amount: 210000,
        nextDue: new Date(Date.UTC(2026, 5, 5)),
        archived: false,
      }),
    })
    expect(createBackfillTransactions).toHaveBeenCalledTimes(1)
    const [{ data }] = createBackfillTransactions.mock.calls[0]
    expect(data).toHaveLength(4)
    expect(data.map((tx: { date: Date }) => dateStr(tx.date))).toEqual([
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
    ])
    expect(data[0]).toMatchObject({
      description: 'Rent',
      amount: -210000,
      currency: 'HUF',
      type: 'EXPENSE',
      categoryId: 'cat_rent',
      recurringRuleId: 'rule-1',
    })
    expect(result).toMatchObject({
      ok: true,
      backfilledCount: 4,
      backfilledFrom: '2026-02-05',
      backfilledTo: '2026-05-05',
      nextDue: '2026-06-05',
    })
  })

  it('updates existing rules without running catch-up backfill', async () => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')

    await upsertRecurringRule(validRule({ id: 'rule-1', name: 'Rent corrected' }))

    expect(updateRule).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: expect.objectContaining({ name: 'Rent corrected' }),
    })
    expect(transactionMock).not.toHaveBeenCalled()
    expect(createBackfillTransactions).not.toHaveBeenCalled()
  })

  it('signs income positive and savings negative in generated transactions', async () => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')

    await upsertRecurringRule(validRule({ name: 'Salary', amount: 800000, kind: 'INCOME', categoryId: 'cat_salary' }))
    let [{ data }] = createBackfillTransactions.mock.calls[createBackfillTransactions.mock.calls.length - 1]
    expect(data[0].amount).toBe(800000)
    expect(data[0].type).toBe('INCOME')

    await upsertRecurringRule(validRule({ name: 'Emergency fund', amount: 50000, kind: 'SAVINGS', categoryId: 'cat_savings' }))
    ;[{ data }] = createBackfillTransactions.mock.calls[createBackfillTransactions.mock.calls.length - 1]
    expect(data[0].amount).toBe(-50000)
    expect(data[0].type).toBe('SAVINGS')
  })

  it('revalidates transactions and recurring surfaces when catch-up transactions are created', async () => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')

    await upsertRecurringRule(validRule())

    expect(revalidatePathMock).toHaveBeenCalledWith('/transactions')
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard')
    expect(revalidatePathMock).toHaveBeenCalledWith('/renewals')
    expect(revalidatePathMock).toHaveBeenCalledWith('/recurring')
  })
})
