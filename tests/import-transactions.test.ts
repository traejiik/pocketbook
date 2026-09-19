import { describe, expect, it } from 'vitest'
import { parseTransactionCsv } from '@/lib/import-transactions'

describe('parseTransactionCsv', () => {
  it('retains currency, type, and category for a foreign expense', () => {
    const csv = [
      'date,description,amount,currency,type,category_id,recurring_rule_name',
      '2026-01-20,Apple Music,-4.99,EUR,EXPENSE,subs,Apple Music',
    ].join('\n')
    const [row] = parseTransactionCsv(csv)
    expect(row.currency).toBe('EUR')
    expect(row.type).toBe('EXPENSE')
    expect(row.categoryId).toBe('subs')
    expect(row.amount).toBe(-4.99)
  })

  it('rejects unsupported currencies rather than rewriting them as anchor currency', () => {
    const csv = 'date,description,amount,currency,type,category_id\n2026-01-01,Test,2,CAD,EXPENSE,food'
    expect(() => parseTransactionCsv(csv)).toThrow('Unsupported currency')
  })

  it('rejects rows with missing required fields', () => {
    const csv = 'date,description,amount,currency,type,category_id\n2026-01-01,,100,HUF,INCOME,salary'
    expect(() => parseTransactionCsv(csv)).toThrow()
  })

  it('keeps income positive', () => {
    const csv = [
      'date,description,amount,currency,type,category_id',
      '2026-02-01,Salary,500000,HUF,INCOME,salary',
    ].join('\n')
    const [row] = parseTransactionCsv(csv)
    expect(row.amount).toBe(500000)
    expect(row.type).toBe('INCOME')
  })

  it('takes the sign from the type, whichever sign the file uses', () => {
    // Stored like every other write path: income positive, expense and savings
    // negative. A file that writes expenses as positive numbers used to land them
    // positive, and the Transactions strip then summed them as income.
    const csv = [
      'date,description,amount,currency,type,category_id',
      '2026-05-06,Spar,8900,HUF,EXPENSE,food',
      '2026-05-07,Spar,-8900,HUF,EXPENSE,food',
      '2026-05-08,Pot,20000,HUF,SAVINGS,savings',
      '2026-05-09,Refund,-1500,HUF,INCOME,salary',
    ].join('\n')
    expect(parseTransactionCsv(csv).map(r => r.amount)).toEqual([-8900, -8900, -20000, 1500])
  })
})
