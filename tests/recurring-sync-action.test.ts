import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  syncDueRecurringRules: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/recurring-sync', () => ({
  syncDueRecurringRules: mocks.syncDueRecurringRules,
}))
vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}))

describe('syncDueRecurringRulesAction', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.syncDueRecurringRules.mockResolvedValue({ rulesProcessed: 1, transactionsCreated: 2 })
  })

  it('rejects unauthenticated callers before syncing', async () => {
    mocks.auth.mockResolvedValue(null)
    const { syncDueRecurringRulesAction } = await import('@/server-actions/recurring-sync')

    await expect(syncDueRecurringRulesAction()).rejects.toThrow('Unauthorised')
    expect(mocks.syncDueRecurringRules).not.toHaveBeenCalled()
  })

  it('syncs due rules and revalidates transaction surfaces when transactions are created', async () => {
    const { syncDueRecurringRulesAction } = await import('@/server-actions/recurring-sync')

    await expect(syncDueRecurringRulesAction()).resolves.toEqual({ rulesProcessed: 1, transactionsCreated: 2 })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/transactions')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/renewals')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/recurring')
  })
})
