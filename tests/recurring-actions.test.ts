import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const revalidatePathMock = vi.fn()
const revalidateTagMock = vi.fn()
const findDuplicateRule = vi.fn()
const findRule = vi.fn()
const createRule = vi.fn()
const updateRule = vi.fn()
const createBackfillTransactions = vi.fn()
const transactionMock = vi.fn()

const transactionClient = {
  recurringRule: { create: createRule, findUnique: findRule, update: updateRule },
  $queryRaw: vi.fn().mockResolvedValue([{ id: 'rule-1' }]),
  transaction: { createMany: createBackfillTransactions },
}

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}))
vi.mock('@/lib/fx', () => ({
  lockRate: vi.fn(async () => ({ fxRate: 1, fxAnchor: 'HUF' })),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    recurringRule: {
      findFirst: findDuplicateRule,
      findUnique: findRule,
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
    findRule.mockResolvedValue({
      cycle: 'MONTHLY', cycleInterval: 1, nextDue: new Date('2026-06-05'), anchorDay: 5, installmentTotal: null,
    })
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
      // Catch-up charges are ordinary transactions, so they freeze the rate too.
      fxRate: 1,
      fxAnchor: 'HUF',
    })
    expect(result).toMatchObject({
      ok: true,
      backfilledCount: 4,
      backfilledFrom: '2026-02-05',
      backfilledTo: '2026-05-05',
      nextDue: '2026-06-05',
    })
  })

  it('logs only the months the form asked for, and none when the switch is off', async () => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')

    await upsertRecurringRule({ ...validRule(), backfillMonths: 2 })
    expect(createBackfillTransactions.mock.calls[0][0].data).toHaveLength(2)

    createBackfillTransactions.mockClear()
    await upsertRecurringRule({ ...validRule(), backfill: false })
    expect(createBackfillTransactions).not.toHaveBeenCalled()
  })

  it('updates existing rules without running catch-up backfill', async () => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')

    await upsertRecurringRule(validRule({ id: 'rule-1', name: 'Rent corrected' }))

    expect(updateRule).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: expect.objectContaining({ name: 'Rent corrected' }),
    })
    expect(transactionMock).toHaveBeenCalledOnce()
    expect(createBackfillTransactions).not.toHaveBeenCalled()
  })

  it('preserves an unchanged billing day and allows an explicit correction', async () => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')
    const nextDue = new Date(Date.UTC(2026, 1, 28))
    const input = validRule({ id: 'rule-1', nextDue: '2026-02-28' })
    findRule.mockResolvedValue({ cycle: 'MONTHLY', cycleInterval: 1, nextDue, anchorDay: 30, installmentTotal: null })

    await upsertRecurringRule(input)
    expect(updateRule.mock.lastCall?.[0].data).not.toHaveProperty('anchorDay')
    expect(updateRule.mock.lastCall?.[0].data).not.toHaveProperty('nextDue')

    await upsertRecurringRule({ ...input, anchorDay: 31 })
    expect(updateRule).toHaveBeenLastCalledWith({ where: { id: 'rule-1' }, data: expect.objectContaining({ nextDue, anchorDay: 31 }) })

    await upsertRecurringRule({ ...input, nextDue: '2026-03-25' })
    expect(updateRule).toHaveBeenLastCalledWith({ where: { id: 'rule-1' }, data: expect.objectContaining({ anchorDay: 25 }) })
  })

  it.each([
    ['MONTHLY', 31, 31],
    ['ANNUAL', undefined, 5],
  ] as const)('honours the billing day when switching weekly to %s', async (cycle, anchorDay, expectedDay) => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')
    const scheduleSnapshot = { cycle: 'WEEKLY', cycleInterval: 1, anchorDay: null, nextDue: '2026-06-05' } as const
    const nextDue = new Date(scheduleSnapshot.nextDue)
    findRule.mockResolvedValue({ ...scheduleSnapshot, nextDue, installmentTotal: null })

    expect(await upsertRecurringRule({
      ...validRule({ id: 'rule-1' }), cycle, anchorDay, scheduleSnapshot,
    })).toEqual({ ok: true })

    expect(updateRule).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: expect.objectContaining({ cycle, nextDue, anchorDay: expectedDay }),
    })
  })

  it('clears the billing day when switching to weekly', async () => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')
    const scheduleSnapshot = { cycle: 'MONTHLY', cycleInterval: 1, anchorDay: 5, nextDue: '2026-06-05' } as const
    const nextDue = new Date(scheduleSnapshot.nextDue)

    expect(await upsertRecurringRule({
      ...validRule({ id: 'rule-1' }), cycle: 'WEEKLY', scheduleSnapshot,
    })).toEqual({ ok: true })
    expect(updateRule).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: expect.objectContaining({ cycle: 'WEEKLY', nextDue, anchorDay: null }),
    })
  })

  it('rejects a scheduling change made from a stale editor snapshot', async () => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')
    findRule.mockResolvedValue({
      cycle: 'MONTHLY', cycleInterval: 1, anchorDay: 5, nextDue: new Date('2026-07-05'),
    })

    const result = await upsertRecurringRule({
      ...validRule({ id: 'rule-1' }),
      anchorDay: 10,
      scheduleSnapshot: { cycle: 'MONTHLY', cycleInterval: 1, anchorDay: 5, nextDue: '2026-06-05' },
    })

    expect(result).toEqual({ error: expect.stringMatching(/reload/i) })
    expect(updateRule).not.toHaveBeenCalled()
  })

  it('preserves a newer schedule when saving metadata from a stale editor', async () => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')
    findRule.mockResolvedValue({
      cycle: 'MONTHLY', cycleInterval: 3, anchorDay: 12, nextDue: new Date('2026-09-12'), installmentTotal: null,
    })

    expect(await upsertRecurringRule({
      ...validRule({ id: 'rule-1', name: 'Rent corrected' }),
      anchorDay: 5,
      scheduleSnapshot: { cycle: 'MONTHLY', cycleInterval: 1, anchorDay: 5, nextDue: '2026-06-05' },
    })).toEqual({ ok: true })
    expect(updateRule).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: expect.objectContaining({ name: 'Rent corrected' }),
    })
    const [request] = updateRule.mock.calls[0]
    expect(request.data).not.toHaveProperty('nextDue')
    expect(request.data).not.toHaveProperty('cycle')
    expect(request.data).not.toHaveProperty('cycleInterval')
    expect(request.data).not.toHaveProperty('anchorDay')
  })

  it.each([false, true])('protects a reconciled installment count during a stale edit = %s', async (editPaid) => {
    const { upsertRecurringRule } = await import('@/server-actions/recurring')
    const scheduleSnapshot = { cycle: 'MONTHLY', cycleInterval: 1, anchorDay: 5, nextDue: '2026-06-05' } as const
    findRule.mockResolvedValue({
      ...scheduleSnapshot, nextDue: new Date(scheduleSnapshot.nextDue),
      installmentPaid: 3, installmentTotal: 5, installmentEndsOn: null,
    })

    const result = await upsertRecurringRule({
      ...validRule({ id: 'rule-1', name: 'Rent corrected' }),
      hasInstallment: true, installmentPaid: editPaid ? 1 : 2, installmentTotal: 5,
      installmentSnapshot: { installmentPaid: 2, installmentTotal: 5, installmentEndsOn: null },
      scheduleSnapshot,
    })

    if (editPaid) {
      expect(result).toEqual({ error: expect.stringMatching(/reload/i) })
      expect(updateRule).not.toHaveBeenCalled()
    } else {
      expect(result).toEqual({ ok: true })
      expect(updateRule.mock.lastCall?.[0].data).not.toHaveProperty('installmentPaid')
      expect(updateRule.mock.lastCall?.[0].data).not.toHaveProperty('installmentTotal')
    }
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
