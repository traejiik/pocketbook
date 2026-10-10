import { describe, expect, it } from 'vitest'
import {
  TX_TYPES,
  kindForType,
  matchesTypeFilter,
  parseTypeFilter,
  signForType,
  signedForType,
  typeGlyph,
} from '@/lib/transaction-type'
import { buildSavingsSummary, nextMonthKey, type SavingsGroup } from '@/lib/savings'
import { balanceContribution, toHUF } from '@/lib/transaction-anchor'

describe('transaction types', () => {
  it('signs income and withdrawals positive, expenses and deposits negative', () => {
    expect(TX_TYPES.map((t) => signForType(t))).toEqual([1, -1, -1, 1])
    // Whatever sign the caller supplied.
    expect(signedForType(-320000, 'WITHDRAWAL')).toBe(320000)
    expect(signedForType(50000, 'SAVINGS')).toBe(-50000)
  })

  it('books a withdrawal against a savings category', () => {
    expect(kindForType('WITHDRAWAL')).toBe('SAVINGS')
    expect(kindForType('SAVINGS')).toBe('SAVINGS')
    expect(kindForType('EXPENSE')).toBe('EXPENSE')
  })

  it('shows deposits and withdrawals under the Savings filter', () => {
    expect(matchesTypeFilter('WITHDRAWAL', 'SAVINGS')).toBe(true)
    expect(matchesTypeFilter('SAVINGS', 'SAVINGS')).toBe(true)
    expect(matchesTypeFilter('WITHDRAWAL', 'EXPENSE')).toBe(false)
    expect(matchesTypeFilter('WITHDRAWAL', 'all')).toBe(true)
    expect(parseTypeFilter('WITHDRAWAL')).toBe('all')
    expect(typeGlyph('WITHDRAWAL')).toBe('↑')
    expect(typeGlyph('SAVINGS')).toBe('↓')
  })

  it('counts a withdrawal as money back into the ledger balance', () => {
    const rates = { USD: 360, EUR: 390, GBP: 460 }
    const tx = { amount: 320000, amountAnchor: 320000, currency: 'HUF', type: 'WITHDRAWAL' as const }
    expect(toHUF(tx, rates)).toBe(320000)
    expect(balanceContribution({ ...tx, category: { includeInBalance: true } }, rates)).toBe(320000)
    expect(balanceContribution({ ...tx, category: { includeInBalance: false } }, rates)).toBe(0)
  })
})

describe('buildSavingsSummary', () => {
  const pots = [
    { id: 'emergency', name: 'Emergency fund', color: '#5fb3a1' },
    { id: 'travel', name: 'Travel', color: '#e0a458' },
    { id: 'empty', name: 'House', color: '#6f8fe8' },
  ]
  const g = (month: string, categoryId: string, type: SavingsGroup['type'], amount: number | null, n = 1): SavingsGroup =>
    ({ month, categoryId, type, amount, n })

  it('nets deposits against withdrawals, all time and per pot', () => {
    const s = buildSavingsSummary([
      g('2026-03', 'emergency', 'SAVINGS', 100000),
      g('2026-03', 'travel', 'SAVINGS', 400000),
      g('2026-05', 'travel', 'WITHDRAWAL', 320000),
      g('2026-06', 'emergency', 'SAVINGS', 60000),
    ], pots, '2026-06')

    expect(s).toMatchObject({ total: 240000, deposited: 560000, withdrawn: 320000, thisMonth: 60000, since: '2026-03' })
    expect(s.pots.map((p) => [p.id, p.balance, p.share])).toEqual([
      ['emergency', 160000, 67],
      ['travel', 80000, 33],
      ['empty', 0, 0],
    ])
  })

  it('fills every month from the first deposit to today, with a running total', () => {
    const s = buildSavingsSummary([
      g('2025-11', 'travel', 'SAVINGS', 100000),
      g('2026-01', 'travel', 'SAVINGS', 50000),
      g('2026-01', 'travel', 'WITHDRAWAL', 120000),
    ], pots, '2026-02')

    expect(s.months).toEqual([
      { month: '2025-11', in: 100000, out: 0, net: 100000, totalAfter: 100000 },
      { month: '2025-12', in: 0, out: 0, net: 0, totalAfter: 100000 },
      { month: '2026-01', in: 50000, out: 120000, net: -70000, totalAfter: 30000 },
      { month: '2026-02', in: 0, out: 0, net: 0, totalAfter: 30000 },
    ])
    expect(s.thisMonth).toBe(0)
  })

  it('counts unconvertible rows instead of treating them as zero', () => {
    const s = buildSavingsSummary([
      g('2026-06', 'travel', 'SAVINGS', 1000),
      g('2026-06', 'travel', 'SAVINGS', null, 3),
    ], pots, '2026-06')
    expect(s.total).toBe(1000)
    expect(s.unconvertibleCount).toBe(3)
  })

  it('shows a pot that was overdrawn by imported history as negative, without a share', () => {
    const s = buildSavingsSummary([
      g('2026-06', 'travel', 'WITHDRAWAL', 5000),
      g('2026-06', 'emergency', 'SAVINGS', 20000),
    ], pots, '2026-06')
    const travel = s.pots.find((p) => p.id === 'travel')!
    expect(travel.balance).toBe(-5000)
    expect(travel.share).toBe(0)
  })

  it('is empty when nothing has been saved', () => {
    const s = buildSavingsSummary([], pots, '2026-06')
    expect(s).toMatchObject({ total: 0, since: null, months: [] })
  })

  it('steps month keys across a year boundary', () => {
    expect(nextMonthKey('2025-12')).toBe('2026-01')
    expect(nextMonthKey('2026-09')).toBe('2026-10')
  })
})
