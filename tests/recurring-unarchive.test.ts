import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const revalidatePathMock = vi.fn()
const ruleFindUnique = vi.fn()
const ruleUpdate = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    recurringRule: { findUnique: ruleFindUnique, update: ruleUpdate },
  },
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
      nextDue: new Date(Date.UTC(2026, 1, 10)), // 2026-02-10, well in the past
      installmentTotal: null,
      installmentPaid: null,
    })

    const { unarchiveRecurringRule } = await import('@/server-actions/recurring')
    const result = await unarchiveRecurringRule('rule-1')

    expect(result).toEqual({ ok: true })
    expect(ruleUpdate).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { archived: false, nextDue: new Date(Date.UTC(2026, 5, 10)) }, // resumes 2026-06-10
    })
  })

  it('keeps a still-future due date as-is when restoring', async () => {
    ruleFindUnique.mockResolvedValue({
      cycle: 'MONTHLY',
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
