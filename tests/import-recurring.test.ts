import { beforeEach, describe, expect, it, vi } from 'vitest'

const categoryFindMany = vi.fn()
const ruleFindMany = vi.fn()
const ruleCreate = vi.fn()
const txCreateMany = vi.fn()

const client = {
  category: { findMany: categoryFindMany },
  recurringRule: { findMany: ruleFindMany, create: ruleCreate },
  transaction: { createMany: txCreateMany },
}

vi.mock('@/lib/prisma', () => ({
  prisma: { ...client, $transaction: vi.fn(async (cb: (tx: typeof client) => unknown) => cb(client)) },
}))
vi.mock('@/lib/fx', () => ({ lockRate: vi.fn(async (c: string) => ({ fxRate: c === 'EUR' ? 390 : 1, fxAnchor: 'HUF' })) }))

const { parseRecurringRows, classifyRecurringRows, commitRecurringRows } = await import('@/lib/import/recurring')

const TODAY = new Date(Date.UTC(2026, 8, 20))
const HEADER = 'name,amount,currency,cycle,next_due,kind,category,installment_paid,installment_total'
const csv = (...lines: string[]) => [HEADER, ...lines].join('\n')

beforeEach(() => {
  categoryFindMany.mockResolvedValue([
    { id: 'housing', name: 'Housing', kind: 'EXPENSE' },
    { id: 'salary', name: 'Salary', kind: 'INCOME' },
  ])
  ruleFindMany.mockResolvedValue([{ name: 'Netflix' }])
  let n = 0
  ruleCreate.mockImplementation(async () => ({ id: `rule-${++n}` }))
  txCreateMany.mockResolvedValue({ count: 0 })
})

describe('parseRecurringRows', () => {
  it('reads cycle aliases, ignores the amount sign and detects installment plans', () => {
    const [rent, phone] = parseRecurringRows(csv(
      'Rent,-210000,HUF,monthly,2026-10-05,expense,Housing,,',
      'Phone,15000,HUF,Monthly,2026-10-10,EXPENSE,Housing,3,12',
    ))
    expect(rent.value).toMatchObject({ amount: 210000, cycle: 'MONTHLY', cycleInterval: 1, anchorDay: 5, kind: 'EXPENSE', hasInstallment: false, installmentPaid: null })
    expect(phone.value).toMatchObject({ hasInstallment: true, installmentPaid: 3, installmentTotal: 12 })
  })

  it('reports bad rows without aborting the file', () => {
    const rows = parseRecurringRows(csv(
      'Gym,9000,HUF,daily,2026-10-01,EXPENSE,Housing,,',
      'Loan,5000,HUF,MONTHLY,2026-10-01,EXPENSE,Housing,13,12',
    ))
    expect(rows[0].errors).toEqual(['Invalid cycle "daily" (expected WEEKLY, MONTHLY or ANNUAL)'])
    expect(rows[1].errors).toEqual(['Installment paid count cannot exceed total installments.'])
  })

  it.each([
    ['week', '', 'WEEKLY', 1],
    ['fortnightly', '', 'WEEKLY', 2],
    ['biweekly', '2', 'WEEKLY', 2],
    ['quarterly', '3', 'MONTHLY', 3],
    ['semiannual', '', 'MONTHLY', 6],
    ['half-yearly', '6', 'MONTHLY', 6],
    ['yearly', '', 'ANNUAL', 1],
    ['weekly', '4', 'WEEKLY', 4],
    ['annual', '5', 'ANNUAL', 5],
  ])('reads %s with interval "%s"', (cycle, interval, expectedCycle, cycleInterval) => {
    const [row] = parseRecurringRows([
      'name,amount,currency,cycle,interval,next_due,kind',
      `Rule,5000,HUF,${cycle},${interval},2026-11-16,EXPENSE`,
    ].join('\n'))
    expect(row.value).toMatchObject({ cycle: expectedCycle, cycleInterval })
    expect(row.value?.anchorDay).toBe(expectedCycle === 'WEEKLY' ? undefined : 16)
  })

  it.each([
    ['fortnightly', '1', '', /conflicts/],
    ['quarterly', '4', '', /conflicts/],
    ['weekly', '53', '', /interval/],
    ['monthly', '13', '', /interval/],
    ['annual', '6', '', /interval/],
    ['weekly', '1.5', '', /interval/],
    ['weekly', '2', '16', /anchor_day/],
    ['monthly', '3', '32', /anchor_day/],
  ])('rejects cycle %s, interval %s, anchor %s', (cycle, interval, anchorDay, error) => {
    const [row] = parseRecurringRows([
      'name,amount,currency,cycle,interval,next_due,anchor_day,kind',
      `Rule,5000,HUF,${cycle},${interval},2026-11-16,${anchorDay},EXPENSE`,
    ].join('\n'))
    expect(row.value).toBeNull()
    expect(row.errors[0]).toMatch(error)
  })
})

describe('classifyRecurringRows', () => {
  it('resolves categories, flags taken names and previews catch-up charges', async () => {
    const rows = await classifyRecurringRows(parseRecurringRows(csv(
      'Rent,210000,HUF,MONTHLY,2026-10-05,EXPENSE,Housing,,',
      'netflix,4990,HUF,MONTHLY,2026-10-01,EXPENSE,Housing,,',
      'Bonus,100000,HUF,ANNUAL,2026-12-01,INCOME,Gifts,,',
    )), undefined, TODAY)

    expect(rows[0]).toMatchObject({ status: 'new', rule: { categoryId: 'housing' } })
    // Monthly rules log the last four occurrences on creation (lib/recurring/backfill.ts).
    expect(rows[0].backfill).toEqual({ count: 4, from: '2026-06-05', to: '2026-09-05', nextDue: '2026-10-05' })
    expect(rows[1]).toMatchObject({ status: 'duplicate', messages: ['An active rule already has this name'] })
    expect(rows[2]).toMatchObject({ status: 'new', rule: { categoryId: null } })
    expect(rows[2].messages[0]).toMatch(/No income category named "Gifts"/)
    expect(rows[2].backfill?.count).toBe(0)
  })
})

describe('commitRecurringRows', () => {
  const rent = {
    name: 'Rent', amount: 210000, currency: 'EUR', cycle: 'MONTHLY', nextDue: '2026-10-05',
    kind: 'EXPENSE', categoryId: 'housing', hasInstallment: false, installmentPaid: null, installmentTotal: null, installmentEndsOn: null,
  }

  it('creates rules with rate-locked catch-up charges', async () => {
    const result = await commitRecurringRows([rent], TODAY)
    expect(result).toMatchObject({ imported: 1, skipped: 0, backfilled: 4, errors: [] })
    expect(ruleCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Rent', nextDue: new Date(Date.UTC(2026, 9, 5)), archived: false }),
    })
    const [{ data }] = txCreateMany.mock.calls[0]
    expect(data).toHaveLength(4)
    expect(data[0]).toMatchObject({ amount: -210000, recurringRuleId: 'rule-1', fxRate: 390, fxAnchor: 'HUF' })
  })

  it('honours the review sheet backfill controls', async () => {
    const off = await commitRecurringRows([{ ...rent, backfill: false }], TODAY)
    expect(off.backfilled).toBe(0)
    expect(txCreateMany).not.toHaveBeenCalled()

    const two = await commitRecurringRows([{ ...rent, backfillMonths: 2 }], TODAY)
    expect(two.backfilled).toBe(2)
  })

  it('keeps the CSV billing day when catch-up leaves next due in a shorter month', async () => {
    const now = new Date(Date.UTC(2026, 1, 1))
    const rows = await classifyRecurringRows(parseRecurringRows(csv(
      'Rent,210000,HUF,MONTHLY,2026-01-31,EXPENSE,Housing,,',
    )), undefined, now)
    expect(rows[0].backfill?.nextDue).toBe('2026-02-28')
    expect(await commitRecurringRows([rows[0].rule], now)).toMatchObject({ imported: 1 })
    expect(ruleCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      nextDue: new Date(Date.UTC(2026, 1, 28)), anchorDay: 31,
    }) })
  })

  it('stores an explicit billing day from a clamped quarterly installment', async () => {
    const now = new Date(Date.UTC(2027, 3, 29))
    const [row] = await classifyRecurringRows(parseRecurringRows([
      'name,amount,currency,cycle,interval,next_due,anchor_day,kind,category,installment_paid,installment_total,installment_ends_on',
      'Loan,5990,HUF,MONTHLY,3,2027-04-30,31,EXPENSE,Housing,2,4,2027-07-31',
    ].join('\n')), undefined, now)
    expect(row.backfill).toEqual({ count: 2, from: '2026-10-31', to: '2027-01-31', nextDue: '2027-04-30' })
    expect(await commitRecurringRows([row.rule], now)).toMatchObject({ imported: 1, backfilled: 2 })
    expect(ruleCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      cycle: 'MONTHLY', cycleInterval: 3, nextDue: new Date('2027-04-30'), anchorDay: 31,
      installmentPaid: 2, installmentTotal: 4, installmentEndsOn: new Date('2027-07-31'),
    }) })
  })

  it('re-checks names and categories against the database as it is now', async () => {
    const result = await commitRecurringRows([
      { ...rent, name: 'NETFLIX' },
      { ...rent, name: 'Salary', categoryId: 'housing', kind: 'INCOME' },
      { ...rent, name: 'Rent' },
      { ...rent, name: 'rent' },
      { name: 'broken' },
    ], TODAY)
    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(4)
    expect(result.errors).toHaveLength(4)
    expect(ruleCreate).toHaveBeenCalledTimes(1)
  })
})
