import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findDueRules: vi.fn(),
  createMany: vi.fn(),
  updateRule: vi.fn(),
  transaction: vi.fn(),
}))

const txClient = {
  transaction: { createMany: mocks.createMany },
  recurringRule: { update: mocks.updateRule },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recurringRule: { findMany: mocks.findDueRules },
    $transaction: mocks.transaction,
  },
}))

const today = new Date(2026, 4, 29)

function dateStr(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

function rule(overrides = {}) {
  return {
    id: 'rule-rent',
    name: 'Rent',
    amount: 210000,
    currency: 'HUF',
    cycle: 'MONTHLY',
    nextDue: new Date(2026, 2, 5),
    kind: 'EXPENSE',
    categoryId: 'cat_rent',
    installmentPaid: null,
    installmentTotal: null,
    transactions: [],
    ...overrides,
  } as const
}

describe('planDueRecurringRule', () => {
  it('logs all missed monthly due dates, signs expenses negative, and advances nextDue', async () => {
    const { planDueRecurringRule } = await import('@/lib/recurring-sync')
    const plan = planDueRecurringRule(rule(), today)

    expect(plan.nextDue).toBe('2026-06-05')
    expect(plan.archived).toBe(false)
    expect(plan.installmentPaid).toBeNull()
    expect(plan.transactions.map((tx) => tx.date)).toEqual([
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
    ])
    expect(plan.transactions[0]).toMatchObject({
      amount: -210000,
      type: 'EXPENSE',
      recurringRuleId: 'rule-rent',
    })
  })

  it('skips already-linked transactions while still advancing the rule', async () => {
    const { planDueRecurringRule } = await import('@/lib/recurring-sync')
    const plan = planDueRecurringRule(rule({
      transactions: [{ date: new Date(2026, 3, 5) }],
    }), today)

    expect(plan.nextDue).toBe('2026-06-05')
    expect(plan.transactions.map((tx) => tx.date)).toEqual(['2026-03-05', '2026-05-05'])
  })

  it('increments installments and archives rules when the final payment is logged', async () => {
    const { planDueRecurringRule } = await import('@/lib/recurring-sync')
    const plan = planDueRecurringRule(rule({
      id: 'rule-phone',
      name: 'Phone plan',
      amount: 6500,
      nextDue: new Date(2026, 4, 20),
      installmentPaid: 14,
      installmentTotal: 15,
    }), today)

    expect(plan.transactions.map((tx) => tx.date)).toEqual(['2026-05-20'])
    expect(plan.installmentPaid).toBe(15)
    expect(plan.archived).toBe(true)
    expect(plan.nextDue).toBe('2026-06-20')
  })

  it('logs annual income as positive and advances by year', async () => {
    const { planDueRecurringRule } = await import('@/lib/recurring-sync')
    const plan = planDueRecurringRule(rule({
      name: 'Bonus',
      amount: 1000,
      cycle: 'ANNUAL',
      nextDue: new Date(2026, 4, 1),
      kind: 'INCOME',
      categoryId: 'cat_salary',
    }), today)

    expect(plan.nextDue).toBe('2027-05-01')
    expect(plan.transactions).toHaveLength(1)
    expect(plan.transactions[0]).toMatchObject({ amount: 1000, type: 'INCOME' })
  })
})

describe('syncDueRecurringRules', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 29, 9))
    vi.resetModules()
    mocks.findDueRules.mockResolvedValue([rule()])
    mocks.createMany.mockResolvedValue({ count: 3 })
    mocks.updateRule.mockResolvedValue({})
    mocks.transaction.mockImplementation(async (callback) => callback(txClient))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates due transactions and updates nextDue atomically', async () => {
    const { syncDueRecurringRules } = await import('@/lib/recurring-sync')

    const result = await syncDueRecurringRules()

    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          description: 'Rent',
          amount: -210000,
          recurringRuleId: 'rule-rent',
        }),
      ]),
      skipDuplicates: true,
    })
    const [{ data }] = mocks.createMany.mock.calls[0]
    expect(data.map((tx: { date: Date }) => dateStr(tx.date))).toEqual([
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
    ])
    expect(mocks.updateRule).toHaveBeenCalledWith({
      where: { id: 'rule-rent' },
      data: expect.objectContaining({ nextDue: new Date(2026, 5, 5), archived: false }),
    })
    expect(result).toEqual({ rulesProcessed: 1, transactionsCreated: 3 })
  })
})
