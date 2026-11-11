import { beforeEach, describe, expect, it, vi } from 'vitest'

const { auth, findCategories, findRules } = vi.hoisted(() => ({
  auth: vi.fn(),
  findCategories: vi.fn(),
  findRules: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth }))
vi.mock('@/lib/prisma', () => ({
  prisma: { category: { findMany: findCategories }, recurringRule: { findMany: findRules } },
}))
vi.mock('@/lib/fx', () => ({ lockRate: vi.fn() }))

import { parseCsv } from '@/lib/csv'
import { classifyRecurringRows, parseRecurringRows } from '@/lib/import/recurring'
import { exportRecurringCsv } from '@/server-actions/export'

const header = [
  'name', 'amount', 'currency', 'cycle', 'interval', 'next_due', 'anchor_day',
  'kind', 'category', 'category_id', 'installment_paid', 'installment_total', 'installment_ends_on',
]
const category = { id: 'source-housing', name: 'Housing, utilities', kind: 'EXPENSE' }
const loan = {
  name: 'Loan, "green"',
  amount: '5990.25',
  currency: 'HUF',
  cycle: 'MONTHLY',
  cycleInterval: 3,
  nextDue: new Date('2027-04-30'),
  anchorDay: 31,
  kind: 'EXPENSE',
  category,
  installmentPaid: 2,
  installmentTotal: 4,
  installmentEndsOn: new Date('2027-07-31'),
}
const cleaning = {
  ...loan,
  name: 'Cleaning',
  amount: '8000',
  cycle: 'WEEKLY',
  cycleInterval: 2,
  nextDue: new Date('2027-04-26'),
  anchorDay: null,
  installmentPaid: null,
  installmentTotal: null,
  installmentEndsOn: null,
}

beforeEach(() => {
  auth.mockResolvedValue({ user: { id: 'owner' } })
  findCategories.mockResolvedValue([{ ...category, id: 'target-housing' }])
  findRules.mockResolvedValueOnce([cleaning, loan]).mockResolvedValue([])
})

describe('exportRecurringCsv', () => {
  it('writes the import columns for active rules, preserving weekly blanks and decimal amounts', async () => {
    const result = await exportRecurringCsv()
    expect(result).toMatchObject({ filename: 'pocketbook-recurring-rules.csv', count: 2 })
    expect(findRules).toHaveBeenCalledWith(expect.objectContaining({ where: { archived: false } }))
    expect(parseCsv(result.csv)).toEqual([
      header,
      ['Cleaning', '8000', 'HUF', 'WEEKLY', '2', '2027-04-26', '', 'EXPENSE', category.name, category.id, '', '', ''],
      [loan.name, '5990.25', 'HUF', 'MONTHLY', '3', '2027-04-30', '31', 'EXPENSE', category.name, category.id, '2', '4', '2027-07-31'],
    ])
  })

  it('preserves an installment schedule in the review on a different instance', async () => {
    const { csv } = await exportRecurringCsv()
    const rows = await classifyRecurringRows(parseRecurringRows(csv), undefined, new Date('2027-04-25'))
    expect(rows[0]).toMatchObject({ status: 'new', rule: { cycle: 'WEEKLY', cycleInterval: 2 } })
    expect(rows[1]).toMatchObject({
      status: 'new',
      rule: {
        name: loan.name, cycle: 'MONTHLY', cycleInterval: 3, nextDue: '2027-04-30', anchorDay: 31,
        categoryId: 'target-housing', installmentPaid: 2, installmentTotal: 4, installmentEndsOn: '2027-07-31',
      },
      backfill: { count: 2, from: '2026-10-31', to: '2027-01-31', nextDue: '2027-04-30' },
    })
  })

  it('marks a file from the source instance as duplicate by active name', async () => {
    findRules.mockResolvedValue([{ name: cleaning.name }, { name: loan.name }])
    const { csv } = await exportRecurringCsv()
    const rows = await classifyRecurringRows(parseRecurringRows(csv), undefined, new Date('2027-04-25'))
    expect(rows.map((row) => row.status)).toEqual(['duplicate', 'duplicate'])
  })

  it('requires a signed-in owner before querying rules', async () => {
    auth.mockResolvedValue(null)
    await expect(exportRecurringCsv()).rejects.toThrow('Unauthorised')
    expect(findRules).not.toHaveBeenCalled()
  })
})
