import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fmtAnchor } from '@/lib/format'
import { toHUF, type FxRates } from '@/lib/transactions/anchor'
import type { SerializedTx } from '@/components/transactions/TransactionsView'

// The export button pulls in a Server Action (and Prisma); the ledger markup doesn't need it.
vi.mock('@/server-actions/export', () => ({ exportTransactionsCsv: vi.fn() }))

const { MobileTransactions, searchHint } = await import('@/components/transactions/MobileTransactions')

const SPACE = '[\\s\\u00a0\\u202f]'
// Only consulted for rows without a frozen value; every fixture below carries one.
const rates: FxRates = { USD: 360, EUR: 390, GBP: 460 }

function tx(overrides: Partial<SerializedTx>): SerializedTx {
  return {
    id: 'tx-1',
    date: '2026-10-12',
    description: 'Groceries',
    amount: -10000,
    currency: 'HUF',
    type: 'EXPENSE',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Food', color: '#3FA66B', kind: 'EXPENSE' },
    recurringRuleId: null,
    ...overrides,
  } as SerializedTx
}

function renderLedger(row: SerializedTx, anchorCurrency: string) {
  const noop = () => {}
  return renderToStaticMarkup(
    createElement(MobileTransactions, {
      baseGroups: [{ date: row.date, items: [row] }],
      baseCount: 1,
      mobileNet: 0,
      searchGroups: [],
      searchCount: 0,
      q: '',
      setSearch: noop,
      filter: 'all',
      setTypeFilter: noop,
      monthLabel: 'October 2026',
      onPrev: noop,
      onNext: noop,
      isCurrentMonth: true,
      anchorCurrency,
      toHuf: (t: SerializedTx) => toHUF(t, rates),
      onRowClick: noop,
      page: 1,
      totalPages: 1,
      onPageChange: noop,
    }),
  )
}

describe('converted amounts follow the anchor currency', () => {
  it('formats a EUR-anchored conversion in euros, with cents', () => {
    expect(fmtAnchor(25.5, 'EUR')).toBe('€25.50')
    expect(fmtAnchor(25.5, 'USD')).toBe('$25.50')
  })

  it('labels the mobile ledger’s converted figure with the EUR anchor, not forints', () => {
    // A forint expense on a EUR-anchored ledger, frozen at 25.50 EUR when logged.
    const html = renderLedger(tx({ amountAnchor: -25.5 }), 'EUR')
    expect(html).toContain('≈ €25.50')
    expect(html).not.toMatch(new RegExp(`≈ 26${SPACE}Ft`))
  })

  it('keeps the forint format when the anchor is HUF', () => {
    const html = renderLedger(
      tx({ amount: -100, amountAnchor: -39000, currency: 'EUR', description: 'Flight' }),
      'HUF',
    )
    expect(html).toMatch(new RegExp(`≈ 39${SPACE}000${SPACE}Ft`))
  })

  it('does not label a same-currency row with a conversion', () => {
    const html = renderLedger(tx({ amountAnchor: -10000 }), 'HUF')
    expect(html).not.toContain('≈')
  })

  it('names the desktop conversion column after the anchor', () => {
    const view = readFileSync(path.resolve(__dirname, '../components/transactions/TransactionsView.tsx'), 'utf8')
    expect(view).toContain('In {anchorCurrency}')
    expect(view).not.toContain('In HUF')
  })
})

describe('search copy matches what search actually covers', () => {
  it('names the loaded month and the fields that are matched', () => {
    expect(searchHint('October 2026')).toBe('Type to search October 2026 by description or category')
  })

  it('does not promise subscriptions or full history from the header', () => {
    const header = readFileSync(path.resolve(__dirname, '../components/shell/Header.tsx'), 'utf8')
    expect(header).toContain('placeholder="Search this month’s transactions…"')
    expect(header).not.toMatch(/subs|all transactions/i)
  })
})
