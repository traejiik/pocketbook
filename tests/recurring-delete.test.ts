import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const revalidatePathMock = vi.fn()
const revalidateTagMock = vi.fn()
const transactionCount = vi.fn()
const ruleDelete = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    transaction: { count: transactionCount },
    recurringRule: { delete: ruleDelete },
  },
}))

describe('deleteRecurringRule', () => {
  beforeEach(() => {
    vi.resetModules()
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ruleDelete.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('hard-deletes a rule that has never generated a transaction', async () => {
    transactionCount.mockResolvedValue(0)

    const { deleteRecurringRule } = await import('@/server-actions/recurring')
    const result = await deleteRecurringRule('rule-1')

    expect(result).toEqual({ ok: true })
    expect(transactionCount).toHaveBeenCalledWith({ where: { recurringRuleId: 'rule-1' } })
    expect(ruleDelete).toHaveBeenCalledWith({ where: { id: 'rule-1' } })
  })

  it('refuses to delete a rule with logged charges and never touches the row', async () => {
    transactionCount.mockResolvedValue(3)

    const { deleteRecurringRule } = await import('@/server-actions/recurring')
    const result = await deleteRecurringRule('rule-2')

    expect(result).toMatchObject({ error: expect.stringContaining('archived') })
    expect(ruleDelete).not.toHaveBeenCalled()
  })
})
