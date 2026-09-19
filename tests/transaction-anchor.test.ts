import { describe, expect, it } from 'vitest'
import { balanceContribution, toHUF } from '@/lib/transaction-anchor'

const rates = { USD: 360, EUR: 390, GBP: 460 }

describe('toHUF signs the ledger value from the transaction type', () => {
  it('counts a positively stored expense as money out', () => {
    // The shape a CSV import used to leave behind: EXPENSE with a positive amount.
    expect(toHUF({ amount: 8900, amountAnchor: 8900, currency: 'HUF', type: 'EXPENSE' }, rates)).toBe(-8900)
  })

  it('treats savings as money out and income as money in', () => {
    expect(toHUF({ amount: -20000, amountAnchor: -20000, currency: 'HUF', type: 'SAVINGS' }, rates)).toBe(-20000)
    expect(toHUF({ amount: -1500, amountAnchor: -1500, currency: 'HUF', type: 'INCOME' }, rates)).toBe(1500)
  })

  it('prefers the frozen anchor value and falls back to the live rate for optimistic rows', () => {
    expect(toHUF({ amount: -10, amountAnchor: -3800, currency: 'EUR', type: 'EXPENSE' }, rates)).toBe(-3800)
    expect(toHUF({ amount: -10, currency: 'EUR', type: 'EXPENSE' }, rates)).toBe(-3900)
  })

  it('nets a month with a wrongly signed expense the same as a correctly signed one', () => {
    const month = [
      { amount: 500000, amountAnchor: 500000, currency: 'HUF', type: 'INCOME' as const },
      { amount: 120000, amountAnchor: 120000, currency: 'HUF', type: 'EXPENSE' as const },
    ]
    expect(month.reduce((sum, t) => sum + toHUF(t, rates), 0)).toBe(380000)
  })
})

describe('balanceContribution leaves out categories excluded from the balance', () => {
  const income = { amount: 500000, amountAnchor: 500000, currency: 'HUF', type: 'INCOME' as const }
  const transfer = { amount: -200000, amountAnchor: -200000, currency: 'HUF', type: 'EXPENSE' as const }

  it('counts an included category exactly like toHUF', () => {
    expect(balanceContribution({ ...transfer, category: { includeInBalance: true } }, rates)).toBe(-200000)
  })

  it('contributes nothing for an excluded category while net still counts it', () => {
    const month = [
      { ...income, category: { includeInBalance: true } },
      { ...transfer, category: { includeInBalance: false } },
    ]
    expect(month.reduce((sum, t) => sum + balanceContribution(t, rates), 0)).toBe(500000)
    expect(month.reduce((sum, t) => sum + toHUF(t, rates), 0)).toBe(300000)
  })
})
