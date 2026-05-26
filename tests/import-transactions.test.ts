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

  it('preserves the sign of the amount as declared', () => {
    const csv = [
      'date,description,amount,currency,type,category_id',
      '2026-02-01,Salary,500000,HUF,INCOME,salary',
    ].join('\n')
    const [row] = parseTransactionCsv(csv)
    expect(row.amount).toBe(500000)
    expect(row.type).toBe('INCOME')
  })
})
