import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SerializedTx } from '@/components/transactions/TransactionsView'

// The mobile tier's export button pulls in a Server Action (and Prisma); not needed here.
vi.mock('@/server-actions/export', () => ({ exportTransactionsCsv: vi.fn() }))

const { TransactionSearchFrame } = await import('@/components/transactions/MobileTransactions')

const match = {
  id: 'tx-1',
  date: '2026-10-12',
  description: 'Spar weekly groceries',
  amount: -8900,
  amountAnchor: -8900,
  currency: 'HUF',
  type: 'EXPENSE',
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Food', color: '#3FA66B', kind: 'EXPENSE' },
  recurringRuleId: null,
} as SerializedTx

function renderFrame(opts: { q: string; urlQuery?: string }) {
  const noop = () => {}
  return renderToStaticMarkup(
    createElement(TransactionSearchFrame, {
      q: opts.q,
      setSearch: noop,
      searchGroups: opts.q ? [{ date: match.date, items: [match] }] : [],
      searchCount: opts.q ? 1 : 0,
      toHuf: (t: SerializedTx) => t.amountAnchor ?? t.amount,
      anchorCurrency: 'HUF',
      monthLabel: 'October 2026',
      urlQuery: opts.urlQuery,
      onRowClick: noop,
      closedControls: (button) => createElement('div', { 'data-part': 'closed' }, 'Type filters', button),
      ledger: createElement('div', { 'data-part': 'ledger' }, 'Unfiltered ledger'),
    }),
  )
}

/** The opening tag of the element wrapping `marker`'s parent part, e.g. the closed-controls row. */
function wrapperOf(html: string, marker: string): string {
  const at = html.indexOf(marker)
  expect(at).toBeGreaterThan(-1)
  const open = html.lastIndexOf('<div', html.lastIndexOf('<div', at) - 1)
  return html.slice(open, html.indexOf('>', open) + 1)
}

describe('arriving with a search from the URL (header search on tablet / mobile)', () => {
  it('shows the results on first paint instead of the unfiltered ledger', () => {
    const html = renderFrame({ q: 'spar', urlQuery: 'spar' })
    expect(html).toContain('Spar weekly groceries')
    expect(html).toContain('1 result')
    // The results layer is visible and interactive, not waiting for an entrance.
    expect(html).toMatch(/class="absolute inset-x-0 top-0 z-10" style="opacity:1/)
    expect(html).not.toMatch(/class="absolute inset-x-0 top-0 z-10"[^>]*inert/)
  })

  it('takes the controls and ledger behind the results out of the tab order', () => {
    const html = renderFrame({ q: 'spar', urlQuery: 'spar' })
    expect(wrapperOf(html, 'data-part="closed"')).toContain('inert')
    expect(wrapperOf(html, 'data-part="ledger"')).toContain('inert')
  })

  it('labels the search input with what it searches', () => {
    const html = renderFrame({ q: 'spar', urlQuery: 'spar' })
    expect(html).toContain('aria-label="Search October 2026 by description or category"')
  })
})

describe('without a URL search', () => {
  it('starts closed, with the controls and ledger reachable', () => {
    const html = renderFrame({ q: '' })
    expect(html).not.toContain('z-10')
    expect(wrapperOf(html, 'data-part="closed"')).not.toContain('inert')
    expect(wrapperOf(html, 'data-part="ledger"')).not.toContain('inert')
  })

  it('does not open for a query typed on a tier that filters its own ledger (desktop)', () => {
    // Desktop passes no urlQuery: its ledger already applies the search, so no overlay.
    const html = renderFrame({ q: 'spar' })
    expect(html).not.toContain('Spar weekly groceries')
  })
})
