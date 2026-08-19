import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  syncDueRecurringRules: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/recurring-sync', () => ({
  syncDueRecurringRules: mocks.syncDueRecurringRules,
}))
vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}))

describe('POST /api/recurring/sync', () => {
  beforeEach(() => {
    process.env.PB_INTERNAL_JOB_TOKEN = 'test-secret'
    vi.resetModules()
    mocks.syncDueRecurringRules.mockResolvedValue({ rulesProcessed: 2, transactionsCreated: 5 })
  })

  async function request(secret?: string) {
    const { POST } = await import('@/app/api/recurring/sync/route')
    return POST(new Request('http://local/api/recurring/sync', {
      method: 'POST',
      headers: secret ? { 'x-internal-job-token': secret } : {},
    }))
  }

  it('returns 401 for a wrong secret', async () => {
    const res = await request('wrong')
    expect(res.status).toBe(401)
    expect(mocks.syncDueRecurringRules).not.toHaveBeenCalled()
  })

  it('syncs due recurring rules with the correct secret', async () => {
    const res = await request('test-secret')
    expect(await res.json()).toEqual({ rulesProcessed: 2, transactionsCreated: 5 })
    expect(mocks.syncDueRecurringRules).toHaveBeenCalledOnce()
  })
})
