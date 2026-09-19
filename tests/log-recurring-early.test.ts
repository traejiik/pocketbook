import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const txFindUnique = vi.fn()
const txFindFirst = vi.fn()
const txCreate = vi.fn()
const txUpdate = vi.fn()
const txDelete = vi.fn()
const txCount = vi.fn()
const ruleFindUnique = vi.fn()
const ruleUpdate = vi.fn()

const client = {
  transaction: { findUnique: txFindUnique, findFirst: txFindFirst, create: txCreate, update: txUpdate, delete: txDelete, count: txCount },
  recurringRule: { findUnique: ruleFindUnique, update: ruleUpdate },
}

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/fx', () => ({ lockRate: vi.fn(async () => ({ fxRate: 1, fxAnchor: 'HUF' })) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { ...client, $transaction: vi.fn(async (cb: (tx: typeof client) => unknown) => cb(client)) },
}))

const day = (iso: string) => new Date(iso + 'T00:00:00Z')
const RENT = { cycle: 'MONTHLY', nextDue: day('2026-10-01'), kind: 'EXPENSE', archived: false, name: 'Rent', installmentTotal: null }
const input = {
  date: '2026-09-28', description: 'Rent', amount: 210000, currency: 'HUF' as const,
  type: 'EXPENSE' as const, categoryId: 'housing', recurringRuleId: 'rule-rent', logEarly: true,
}

beforeEach(() => {
  vi.resetModules()
  authMock.mockResolvedValue({ user: { id: 'user-1' } })
  ruleFindUnique.mockResolvedValue(RENT)
  txFindFirst.mockResolvedValue(null)
  txCreate.mockResolvedValue({ id: 'tx-new' })
})

describe('Log recurring early', () => {
  it('settles the next occurrence: stamps coversDueDate and advances the rule one cycle', async () => {
    const { upsertTransaction } = await import('@/server-actions/transactions')
    expect(await upsertTransaction(input)).toEqual({ ok: true })

    expect(ruleUpdate).toHaveBeenCalledWith({ where: { id: 'rule-rent' }, data: { nextDue: day('2026-11-01') } })
    expect(txCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ recurringRuleId: 'rule-rent', coversDueDate: day('2026-10-01'), date: day('2026-09-28') }),
    })
  })

  it('refuses to settle an occurrence that is already logged', async () => {
    txFindFirst.mockResolvedValue({ id: 'tx-generated' })
    const { upsertTransaction } = await import('@/server-actions/transactions')
    expect(await upsertTransaction(input)).toEqual({ error: 'The 2026-10-01 "Rent" payment is already logged.' })
    expect(txCreate).not.toHaveBeenCalled()
    expect(ruleUpdate).not.toHaveBeenCalled()
  })

  it('refuses an archived rule or one of another kind', async () => {
    const { upsertTransaction } = await import('@/server-actions/transactions')
    ruleFindUnique.mockResolvedValueOnce({ ...RENT, archived: true })
    expect(await upsertTransaction(input)).toEqual({ error: 'That recurring rule is no longer active.' })
    ruleFindUnique.mockResolvedValueOnce({ ...RENT, kind: 'INCOME' })
    expect(await upsertTransaction(input)).toEqual({ error: '"Rent" is a income rule.' })
    expect(txCreate).not.toHaveBeenCalled()
  })

  it('does not link a new transaction when the switch is off', async () => {
    const { upsertTransaction } = await import('@/server-actions/transactions')
    await upsertTransaction({ ...input, logEarly: false, recurringRuleId: null })
    expect(ruleUpdate).not.toHaveBeenCalled()
    expect(txCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ recurringRuleId: null, coversDueDate: null }) })
  })

  it('hands the occurrence back on delete when the rule has not moved on', async () => {
    txFindUnique.mockResolvedValue({ recurringRuleId: 'rule-rent', coversDueDate: day('2026-10-01') })
    ruleFindUnique.mockResolvedValue({ ...RENT, nextDue: day('2026-11-01') })
    const { deleteTransaction } = await import('@/server-actions/transactions')
    await deleteTransaction('tx-early')
    expect(ruleUpdate).toHaveBeenCalledWith({ where: { id: 'rule-rent' }, data: { nextDue: day('2026-10-01') } })
  })

  it('leaves the rule alone on delete when it has moved on since', async () => {
    txFindUnique.mockResolvedValue({ recurringRuleId: 'rule-rent', coversDueDate: day('2026-10-01') })
    ruleFindUnique.mockResolvedValue({ ...RENT, nextDue: day('2026-12-01') })
    const { deleteTransaction } = await import('@/server-actions/transactions')
    await deleteTransaction('tx-early')
    expect(ruleUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ data: { nextDue: expect.any(Date) } }))
  })

  it('un-settles on edit when the switch is turned off, and says so if the rule moved on', async () => {
    txFindUnique.mockResolvedValue({ recurringRuleId: 'rule-rent', coversDueDate: day('2026-10-01'), currency: 'HUF', fxRate: 1, fxAnchor: 'HUF' })
    ruleFindUnique.mockResolvedValue({ ...RENT, nextDue: day('2026-12-01') })
    const { upsertTransaction } = await import('@/server-actions/transactions')
    const result = await upsertTransaction({ ...input, id: 'tx-early', logEarly: false })
    expect(result).toEqual({ ok: true, notice: 'The rule has moved on since, so its next due date was left as is.' })
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 'tx-early' },
      data: expect.objectContaining({ recurringRuleId: null, coversDueDate: null }),
    })
  })

  it('keeps the settlement when an early payment is edited with the switch still on', async () => {
    txFindUnique.mockResolvedValue({ recurringRuleId: 'rule-rent', coversDueDate: day('2026-10-01'), currency: 'HUF', fxRate: 1, fxAnchor: 'HUF' })
    const { upsertTransaction } = await import('@/server-actions/transactions')
    await upsertTransaction({ ...input, id: 'tx-early', recurringRuleId: 'rule-other', amount: 220000 })
    expect(txFindFirst).not.toHaveBeenCalled()
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 'tx-early' },
      data: expect.objectContaining({ recurringRuleId: 'rule-rent', coversDueDate: day('2026-10-01'), amount: -220000 }),
    })
  })
})
