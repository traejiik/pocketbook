import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const revalidatePathMock = vi.fn()
const revalidateTagMock = vi.fn()
const ruleFindUnique = vi.fn()
const ruleUpdate = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}))
const tx = {
  recurringRule: { findUnique: ruleFindUnique, update: ruleUpdate },
  $queryRaw: vi.fn().mockResolvedValue([]),
}
vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) },
}))

describe('unarchiveRecurringRule', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 29, 9))) // 2026-05-29
    vi.resetModules()
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ruleUpdate.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores a paused rule and advances a stale due date to the next future occurrence', async () => {
    ruleFindUnique.mockResolvedValue({
      cycle: 'MONTHLY',
      cycleInterval: 1,
      nextDue: new Date(Date.UTC(2026, 1, 28)),
      anchorDay: 31,
      installmentTotal: null,
      installmentPaid: null,
    })

    const { unarchiveRecurringRule } = await import('@/server-actions/recurring')
    const result = await unarchiveRecurringRule('rule-1')

    expect(result).toEqual({ ok: true })
    expect(ruleUpdate).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { archived: false, nextDue: new Date(Date.UTC(2026, 4, 31)) },
    })
  })

  it('restores a quarterly rule on its original phase without catching up missed charges', async () => {
    ruleFindUnique.mockResolvedValue({
      cycle: 'MONTHLY', cycleInterval: 3, anchorDay: 31, nextDue: new Date('2026-01-31'),
      installmentTotal: null, installmentPaid: null,
    })
    const { unarchiveRecurringRule } = await import('@/server-actions/recurring')

    expect(await unarchiveRecurringRule('rule-quarterly')).toEqual({ ok: true })
    expect(ruleUpdate).toHaveBeenCalledWith({
      where: { id: 'rule-quarterly' },
      data: { archived: false, nextDue: new Date('2026-07-31') },
    })
  })

  it('keeps a still-future due date as-is when restoring', async () => {
    ruleFindUnique.mockResolvedValue({
      cycle: 'MONTHLY',
      cycleInterval: 1,
      nextDue: new Date(Date.UTC(2026, 7, 1)), // 2026-08-01, future
      installmentTotal: null,
      installmentPaid: null,
    })

    const { unarchiveRecurringRule } = await import('@/server-actions/recurring')
    await unarchiveRecurringRule('rule-2')

    expect(ruleUpdate).toHaveBeenCalledWith({
      where: { id: 'rule-2' },
      data: { archived: false, nextDue: new Date(Date.UTC(2026, 7, 1)) },
    })
  })

  it('refuses to restore a completed installment plan', async () => {
    ruleFindUnique.mockResolvedValue({
      cycle: 'MONTHLY',
      cycleInterval: 1,
      nextDue: new Date(Date.UTC(2026, 1, 10)),
      installmentTotal: 12,
      installmentPaid: 12,
    })

    const { unarchiveRecurringRule } = await import('@/server-actions/recurring')
    const result = await unarchiveRecurringRule('rule-3')

    expect(result).toMatchObject({ error: expect.stringContaining('Completed installment') })
    expect(ruleUpdate).not.toHaveBeenCalled()
  })

  it('returns an error when the rule does not exist', async () => {
    ruleFindUnique.mockResolvedValue(null)

    const { unarchiveRecurringRule } = await import('@/server-actions/recurring')
    const result = await unarchiveRecurringRule('missing')

    expect(result).toMatchObject({ error: expect.any(String) })
    expect(ruleUpdate).not.toHaveBeenCalled()
  })
})
