import { beforeEach, describe, expect, it, vi } from 'vitest'

const categoryFindMany = vi.fn()
const ruleFindMany = vi.fn()
const txFindMany = vi.fn()
const txCreateMany = vi.fn()
const ruleFindUnique = vi.fn()
const txCount = vi.fn()
const ruleUpdate = vi.fn()
const lockRateMock = vi.fn(async (currency: string) => ({ fxRate: currency === 'EUR' ? 390 : 1, fxAnchor: 'HUF' }))

const client = {
  category: { findMany: categoryFindMany },
  recurringRule: { findMany: ruleFindMany, findUnique: ruleFindUnique, update: ruleUpdate },
  transaction: { findMany: txFindMany, createMany: txCreateMany, count: txCount },
}

vi.mock('@/lib/prisma', () => ({
  prisma: { ...client, $transaction: vi.fn(async (cb: (tx: typeof client) => unknown) => cb(client)) },
}))
vi.mock('@/lib/fx', () => ({ lockRate: lockRateMock }))

const { parseTransactionRows, classifyImportRows, commitImportRows, importTransactions } = await import('@/lib/import-transactions')

const HEADER = 'date,description,amount,currency,type,category,category_id,recurring_rule_name'
const csv = (...lines: string[]) => [HEADER, ...lines].join('\n')

const CATS = [
  { id: 'food', name: 'Groceries', kind: 'EXPENSE' },
  { id: 'salary', name: 'Salary', kind: 'INCOME' },
]

beforeEach(() => {
  categoryFindMany.mockResolvedValue(CATS)
  ruleFindMany.mockResolvedValue([{ id: 'rule-rent', name: 'Rent', archived: false }])
  txFindMany.mockResolvedValue([])
  txCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
  ruleFindUnique.mockResolvedValue({ installmentTotal: null })
})

describe('parseTransactionRows', () => {
  it('reports bad rows without aborting the file', () => {
    const rows = parseTransactionRows(csv(
      '2026-01-20,Apple Music,-4.99,eur,expense,,food,',
      '2026-01-21,Mystery,2,CAD,EXPENSE,Groceries,,',
      '2026-02-30,Bad day,5,HUF,EXPENSE,Groceries,,',
    ))
    expect(rows[0]).toMatchObject({ line: 2, errors: [], value: { currency: 'EUR', type: 'EXPENSE', categoryId: 'food', amount: -4.99 } })
    expect(rows[1].value).toBeNull()
    expect(rows[1].errors).toEqual(['Unsupported currency "CAD"'])
    expect(rows[2].errors[0]).toMatch(/Invalid date "2026-02-30"/)
  })

  it('takes the sign from type, whatever the file says', () => {
    const rows = parseTransactionRows(csv(
      '2026-02-01,Salary,-500000,HUF,INCOME,Salary,,',
      '2026-02-02,Food,8900,HUF,EXPENSE,Groceries,,',
      '2026-02-03,Pot,20000,HUF,SAVINGS,Savings,,',
    ))
    expect(rows.map((r) => r.value?.amount)).toEqual([500000, -8900, -20000])
  })

  it('handles quoted descriptions with commas', () => {
    const [row] = parseTransactionRows(csv('2026-03-01,"Rent, flat 2",120000,HUF,EXPENSE,Groceries,,'))
    expect(row.value?.description).toBe('Rent, flat 2')
  })

  it('flags a file missing required columns once', () => {
    expect(parseTransactionRows('date,amount\n2026-01-01,5')).toEqual([
      { line: 1, value: null, errors: ['Missing columns: description, currency, type, category or category_id'] },
    ])
  })
})

describe('classifyImportRows', () => {
  it('resolves categories by id or by name within the row kind', async () => {
    const rows = await classifyImportRows(parseTransactionRows(csv(
      '2026-03-01,Shop,10,HUF,EXPENSE,groceries,,',
      '2026-03-02,Pay,10,HUF,INCOME,,salary,',
      '2026-03-03,Wrong kind,10,HUF,INCOME,Groceries,,',
    )))
    expect(rows.map((r) => r.categoryId)).toEqual(['food', 'salary', null])
    expect(rows[2].status).toBe('new')
    expect(rows[2].messages[0]).toMatch(/No income category named "Groceries"/)
  })

  it('marks rows already in the ledger and repeats within the file as duplicates', async () => {
    txFindMany.mockResolvedValue([
      { date: new Date('2026-03-01T00:00:00Z'), description: 'shop', amount: -10, currency: 'HUF', type: 'EXPENSE', recurringRuleId: null },
    ])
    const rows = await classifyImportRows(parseTransactionRows(csv(
      '2026-03-01,Shop,10,HUF,EXPENSE,Groceries,,',
      '2026-03-02,Cafe,4,HUF,EXPENSE,Groceries,,',
      '2026-03-02,Cafe,4,HUF,EXPENSE,Groceries,,',
    )))
    expect(rows.map((r) => r.status)).toEqual(['duplicate', 'new', 'duplicate'])
    expect(rows[0].messages[0]).toBe('Already in your ledger')
    expect(rows[2].messages[0]).toBe('Repeats an earlier row in this file')
  })

  it('links a known rule and warns about an unknown one instead of dropping it silently', async () => {
    const rows = await classifyImportRows(parseTransactionRows(csv(
      '2026-03-01,Rent,100,HUF,EXPENSE,Groceries,,rent',
      '2026-03-01,Gym,100,HUF,EXPENSE,Groceries,,Gym',
    )))
    expect(rows[0].recurringRuleId).toBe('rule-rent')
    expect(rows[1].recurringRuleId).toBeNull()
    expect(rows[1].messages).toContain('No recurring rule named "Gym" — imported without a link')
  })
})

describe('commitImportRows', () => {
  const row = { date: '2026-03-01', description: 'Shop', amount: 10, currency: 'EUR', type: 'EXPENSE', categoryId: 'food', recurringRuleId: null }

  it('writes signed, rate-locked rows in one batch', async () => {
    const result = await commitImportRows([row])
    expect(result).toMatchObject({ imported: 1, skipped: 0, errors: [] })
    expect(txCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ amount: -10, currency: 'EUR', fxRate: 390, fxAnchor: 'HUF' })],
      skipDuplicates: true,
    })
  })

  it('re-checks duplicates and categories because rows come back from the browser', async () => {
    txFindMany.mockResolvedValue([
      { date: new Date('2026-03-01T00:00:00Z'), description: 'Shop', amount: -10, currency: 'EUR', type: 'EXPENSE', recurringRuleId: null },
    ])
    const result = await commitImportRows([row, { ...row, description: 'Other', categoryId: 'salary' }, { nonsense: true }])
    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(3)
    expect(result.errors).toHaveLength(2)
    expect(txCreateMany).not.toHaveBeenCalled()
  })

  it('reconciles installment counters for linked rules', async () => {
    ruleFindUnique.mockResolvedValue({ installmentTotal: 3 })
    txCount.mockResolvedValue(3)
    ruleFindMany.mockResolvedValue([{ id: 'rule-phone' }])
    const result = await commitImportRows([{ ...row, recurringRuleId: 'rule-phone' }])
    expect(result.touchedRules).toBe(true)
    expect(ruleUpdate).toHaveBeenCalledWith({ where: { id: 'rule-phone' }, data: { installmentPaid: 3, archived: true } })
  })
})

describe('importTransactions', () => {
  it('imports new rows and reports unresolved ones for the seed and CLI', async () => {
    const result = await importTransactions(csv(
      '2026-03-01,Shop,10,HUF,EXPENSE,Groceries,,',
      '2026-03-02,Lost,10,HUF,EXPENSE,Nowhere,,',
    ))
    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.errors[0]).toMatch(/^Line 3: No expense category named "Nowhere"/)
  })
})
