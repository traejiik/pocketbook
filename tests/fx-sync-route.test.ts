import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncAllAutoRates = vi.fn()
const findUnique = vi.fn()
const revalidateTag = vi.fn()

vi.mock('@/lib/frankfurter', () => ({ syncAllAutoRates }))
vi.mock('@/lib/prisma', () => ({ prisma: { appSettings: { findUnique } } }))
vi.mock('next/cache', () => ({ revalidateTag, unstable_cache: vi.fn() }))

describe('POST /api/fx/sync', () => {
  beforeEach(() => {
    process.env.PB_INTERNAL_JOB_TOKEN = 'test-secret'
    vi.resetModules()
  })

  it('returns 401 for a wrong secret', async () => {
    const { POST } = await import('@/app/api/fx/sync/route')
    const res = await POST(new Request('http://local/api/fx/sync', {
      method: 'POST',
      headers: { 'x-internal-job-token': 'wrong' },
    }))
    expect(res.status).toBe(401)
    expect(syncAllAutoRates).not.toHaveBeenCalled()
  })

  it('returns 401 when no secret header is sent', async () => {
    const { POST } = await import('@/app/api/fx/sync/route')
    const res = await POST(new Request('http://local/api/fx/sync', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('skips sync and returns skipped:true when fxAutoSync is disabled', async () => {
    findUnique.mockResolvedValue({ fxAutoSync: false })
    const { POST } = await import('@/app/api/fx/sync/route')
    const res = await POST(new Request('http://local/api/fx/sync', {
      method: 'POST',
      headers: { 'x-internal-job-token': 'test-secret' },
    }))
    expect(await res.json()).toEqual({ synced: 0, skipped: true })
    expect(syncAllAutoRates).not.toHaveBeenCalled()
  })

  it('runs sync when fxAutoSync is enabled', async () => {
    findUnique.mockResolvedValue({ fxAutoSync: true })
    syncAllAutoRates.mockResolvedValue(3)
    const { POST } = await import('@/app/api/fx/sync/route')
    const res = await POST(new Request('http://local/api/fx/sync', {
      method: 'POST',
      headers: { 'x-internal-job-token': 'test-secret' },
    }))
    expect(await res.json()).toEqual({ synced: 3 })
    expect(syncAllAutoRates).toHaveBeenCalledOnce()
  })

  // Recurring rules convert at the live rate, so a cron rate change has to bust
  // the cached renewal / recurring-budget reads or they serve the old rate.
  it('busts the fx cache tag when rates actually changed', async () => {
    findUnique.mockResolvedValue({ fxAutoSync: true })
    syncAllAutoRates.mockResolvedValue(3)
    const { POST } = await import('@/app/api/fx/sync/route')
    await POST(new Request('http://local/api/fx/sync', {
      method: 'POST',
      headers: { 'x-internal-job-token': 'test-secret' },
    }))
    expect(revalidateTag).toHaveBeenCalledWith('pb-fx', { expire: 0 })
  })

  it('does not bust the fx cache tag when nothing synced', async () => {
    findUnique.mockResolvedValue({ fxAutoSync: true })
    syncAllAutoRates.mockResolvedValue(0)
    const { POST } = await import('@/app/api/fx/sync/route')
    await POST(new Request('http://local/api/fx/sync', {
      method: 'POST',
      headers: { 'x-internal-job-token': 'test-secret' },
    }))
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
