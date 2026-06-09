import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findSettings: vi.fn(),
  findInsight: vi.fn(),
  generate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appSettings: { findUnique: mocks.findSettings },
    aiInsight: { findFirst: mocks.findInsight },
  },
}))
vi.mock('@/lib/insights-generation', () => ({
  generateAndSaveInsight: mocks.generate,
}))

describe('POST /api/insights/monthly', () => {
  beforeEach(() => {
    process.env.FX_SYNC_SECRET = 'test-secret'
    vi.useFakeTimers()
    // The cron fires at 03:05 UTC on the 1st — the insight must cover the
    // month that just ended, not the day-old current month.
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 1, 3, 5)))
    vi.resetModules()
    mocks.findInsight.mockResolvedValue(null)
    mocks.generate.mockResolvedValue({ id: 'new-insight-id' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function request(secret?: string) {
    const { POST } = await import('@/app/api/insights/monthly/route')
    return POST(new Request('http://local/api/insights/monthly', {
      method: 'POST',
      headers: secret ? { 'x-sync-secret': secret } : {},
    }))
  }

  it('returns 401 for a wrong secret', async () => {
    const res = await request('wrong')
    expect(res.status).toBe(401)
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('returns skipped when autoInsightsMonthly is disabled', async () => {
    mocks.findSettings.mockResolvedValue({ autoInsightsMonthly: false })
    const res = await request('test-secret')
    expect(await res.json()).toEqual({ generated: false, skipped: true })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('returns skipped when the previous month already has a saved insight', async () => {
    mocks.findSettings.mockResolvedValue({ autoInsightsMonthly: true, ollamaUrl: 'http://ollama:11434', ollamaModel: 'llama3.1:8b' })
    mocks.findInsight.mockResolvedValue({ id: 'existing-insight' })
    const res = await request('test-secret')
    expect(await res.json()).toEqual({ generated: false, skipped: true })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('generates exactly one insight covering the month that just ended', async () => {
    mocks.findSettings.mockResolvedValue({ autoInsightsMonthly: true, ollamaUrl: 'http://ollama:11434', ollamaModel: 'llama3.1:8b' })
    const res = await request('test-secret')
    expect(await res.json()).toEqual({ generated: true, id: 'new-insight-id', monthCovered: '2026-05' })
    expect(mocks.findInsight).toHaveBeenCalledWith({ where: { monthCovered: '2026-05' } })
    expect(mocks.generate).toHaveBeenCalledOnce()
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ monthCovered: '2026-05' }))
  })
})
