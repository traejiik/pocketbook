import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const revalidatePathMock = vi.fn()
const revalidateTagMock = vi.fn()
const categoryFindMany = vi.fn()
const ruleFindMany = vi.fn()
const txFindMany = vi.fn()
const txCreateMany = vi.fn()

const client = {
  category: { findMany: categoryFindMany },
  recurringRule: { findMany: ruleFindMany, findUnique: vi.fn(async () => ({ installmentTotal: null })), update: vi.fn() },
  transaction: { findMany: txFindMany, createMany: txCreateMany, count: vi.fn() },
}

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock, revalidateTag: revalidateTagMock }))
vi.mock('@/lib/fx', () => ({ lockRate: vi.fn(async () => ({ fxRate: 1, fxAnchor: 'HUF' })) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { ...client, $transaction: vi.fn(async (cb: (tx: typeof client) => unknown) => cb(client)) },
}))

const CATS = [{ id: 'food', name: 'Groceries', color: '#F97316', kind: 'EXPENSE' }]

function csvForm(text: string) {
  const form = new FormData()
  form.append('file', new File([text], 'bank.csv', { type: 'text/csv' }))
  return form
}

beforeEach(() => {
  vi.resetModules()
  authMock.mockResolvedValue({ user: { id: 'user-1' } })
  categoryFindMany.mockResolvedValue(CATS)
  ruleFindMany.mockResolvedValue([])
  txFindMany.mockResolvedValue([])
  txCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
})

describe('previewTransactionImport', () => {
  it('classifies rows and writes nothing', async () => {
    const { previewTransactionImport } = await import('@/server-actions/import')
    const result = await previewTransactionImport(csvForm(
      'date,description,amount,currency,type,category\n2026-03-01,Shop,10,HUF,EXPENSE,Groceries\n2026-03-02,Bad,x,HUF,EXPENSE,Groceries',
    ))
    expect(result).toMatchObject({ ok: true, filename: 'bank.csv' })
    if (!('ok' in result)) throw new Error('expected preview')
    expect(result.rows.map((r) => r.status)).toEqual(['new', 'error'])
    expect(result.categories).toEqual(CATS)
    expect(txCreateMany).not.toHaveBeenCalled()
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it('rejects oversized files before reading them', async () => {
    const { previewTransactionImport } = await import('@/server-actions/import')
    const result = await previewTransactionImport(csvForm('x'.repeat(2 * 1024 * 1024 + 1)))
    expect(result).toEqual({ error: 'That file is larger than 2 MB. Split it and import the parts.' })
  })
})

describe('commitTransactionImport', () => {
  it('writes the reviewed rows and invalidates the ledger reads', async () => {
    const { commitTransactionImport } = await import('@/server-actions/import')
    const { CACHE_TAGS } = await import('@/lib/cache')
    const result = await commitTransactionImport([
      { date: '2026-03-01', description: 'Shop', amount: -10, currency: 'HUF', type: 'EXPENSE', categoryId: 'food', recurringRuleId: null },
    ])
    expect(result).toMatchObject({ imported: 1, skipped: 0 })
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.transactions, { expire: 0 })
    expect(revalidatePathMock).toHaveBeenCalledWith('/transactions')
  })

  it('refuses an empty selection', async () => {
    const { commitTransactionImport } = await import('@/server-actions/import')
    expect(await commitTransactionImport([])).toEqual({ error: 'Nothing selected to import.' })
  })
})

describe('exportTransactionsCsv', () => {
  const ledger = [
    {
      date: new Date('2026-03-01T00:00:00Z'), description: 'Rent, flat 2', amount: { toString: () => '-120000' },
      currency: 'HUF', type: 'EXPENSE', fxRate: { toString: () => '1' }, fxAnchor: 'HUF',
      category: { id: 'food', name: 'Groceries' }, recurringRule: null,
    },
  ]

  it('names a whole month by its key and bounds the query to the range', async () => {
    txFindMany.mockResolvedValue(ledger)
    const { exportTransactionsCsv } = await import('@/server-actions/export')
    const result = await exportTransactionsCsv({ from: '2026-03-01', to: '2026-03-31' })
    if ('error' in result) throw new Error(result.error)
    expect(result.filename).toBe('pocketbook-transactions-2026-03.csv')
    expect(txFindMany.mock.calls[0][0].where).toEqual({
      date: { gte: new Date('2026-03-01T00:00:00Z'), lte: new Date('2026-03-31T00:00:00Z') },
    })
  })

  it('round-trips: an exported file re-imports entirely as duplicates', async () => {
    txFindMany.mockResolvedValue(ledger)
    const { exportTransactionsCsv } = await import('@/server-actions/export')
    const result = await exportTransactionsCsv({ all: true })
    if ('error' in result) throw new Error(result.error)
    expect(result.filename).toBe('pocketbook-transactions-all.csv')

    // What the importer's duplicate check reads back from the ledger.
    txFindMany.mockResolvedValue(ledger.map((t) => ({ ...t, amount: -120000, recurringRuleId: null })))
    const { parseTransactionRows, classifyImportRows } = await import('@/lib/import-transactions')
    const rows = await classifyImportRows(parseTransactionRows(result.csv))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'duplicate', description: 'Rent, flat 2', categoryId: 'food' })
  })

  it('rejects an inverted range', async () => {
    const { exportTransactionsCsv } = await import('@/server-actions/export')
    expect(await exportTransactionsCsv({ from: '2026-04-01', to: '2026-03-01' })).toEqual({ error: 'Start must be on or before end' })
  })
})
