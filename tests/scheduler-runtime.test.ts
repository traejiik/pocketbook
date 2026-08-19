import { describe, expect, it, vi } from 'vitest'

import { createJobHandlers, createScheduledBackupNotifier } from '@/runtime/scheduler'

describe('scheduler runtime handlers', () => {
  it('delivers scheduled backup completion without duplicating failure alerts', async () => {
    const deliver = vi.fn().mockResolvedValue(undefined)
    const notify = createScheduledBackupNotifier(deliver)

    await notify({
      type: 'backupCompleted',
      filename: 'pocketbook.dump',
      size: '2 MB',
      kept: 14,
      source: 'scheduled',
    })
    await notify({ type: 'backupFailed', error: 'offline', source: 'scheduled' })

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ type: 'backupCompleted' }))
  })

  it('calls Next job routes with the ephemeral internal token', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ synced: 3 }))
      .mockResolvedValueOnce(Response.json({ generated: false, skipped: true }))
      .mockResolvedValueOnce(Response.json({ rulesProcessed: 2, transactionsCreated: 5 }))
    const handlers = createJobHandlers({
      token: 'boot-token',
      fetchImpl,
      runBackupImpl: vi.fn().mockResolvedValue({ status: 'already-running' }),
    })

    await expect(handlers.backup()).resolves.toEqual({ status: 'deferred', summary: 'backup already running' })

    await expect(handlers['fx-sync']()).resolves.toEqual({ status: 'success', summary: '3 rates synced' })
    await expect(handlers['monthly-insight']()).resolves.toEqual({ status: 'skipped', summary: 'monthly insight disabled or already current' })
    await expect(handlers['recurring-sync']()).resolves.toEqual({ status: 'success', summary: '2 rules processed, 5 transactions created' })

    for (const [, init] of fetchImpl.mock.calls as Array<[string, RequestInit]>) {
      expect(init.method).toBe('POST')
      expect(init.headers).toEqual({ 'x-internal-job-token': 'boot-token' })
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('maps backup outcomes and promotes failures to retryable job errors', async () => {
    const runBackupImpl = vi.fn()
      .mockResolvedValueOnce({
        status: 'success', filename: 'pocketbook.dump', kept: 14, size: '2 MB',
      })
      .mockResolvedValueOnce({ status: 'failed', source: 'scheduled', error: 'connection refused' })
    const handlers = createJobHandlers({
      token: 'boot-token',
      fetchImpl: vi.fn(),
      runBackupImpl,
    })

    await expect(handlers.backup()).resolves.toEqual({
      status: 'success', summary: 'pocketbook.dump · 2 MB · 14 kept',
    })
    await expect(handlers.backup()).rejects.toThrow('connection refused')
  })
})
