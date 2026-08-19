import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { readJobState } from '@/lib/operations/job-state'
import { JOB_IDS } from '@/lib/operations/schedule'
import { runDueJobsOnce, type JobHandlers } from '@/lib/operations/job-runner'

function successfulHandlers(calls: string[]): JobHandlers {
  return Object.fromEntries(JOB_IDS.map((jobId) => [jobId, async () => {
    calls.push(jobId)
    return { status: 'success', summary: `${jobId} complete` } as const
  }])) as JobHandlers
}

describe('scheduled job runner', () => {
  it('catches up each latest occurrence serially in schedule order', async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'pocketbook-job-runner-'))
    const calls: string[] = []

    const outcomes = await runDueJobsOnce({
      now: new Date('2026-08-19T12:00:00Z'),
      stateDirectory,
      handlers: successfulHandlers(calls),
      notifyFailure: vi.fn(),
    })

    expect(calls).toEqual([...JOB_IDS])
    expect(outcomes).toHaveLength(4)
    expect((await readJobState('monthly-insight', stateDirectory))?.lastSuccess?.occurrenceId).toBe('2026-08')
  })

  it('retries after fifteen minutes and notifies only the first failure per occurrence', async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'pocketbook-job-runner-'))
    const notifyFailure = vi.fn().mockResolvedValue(undefined)
    let fxAttempts = 0
    const calls: string[] = []
    const handlers = successfulHandlers(calls)
    handlers['fx-sync'] = async () => {
      fxAttempts += 1
      if (fxAttempts < 3) throw new Error('Frankfurter unavailable')
      return { status: 'success', summary: '3 rates synced' }
    }

    await runDueJobsOnce({ now: new Date('2026-08-19T12:00:00Z'), stateDirectory, handlers, notifyFailure })
    await runDueJobsOnce({ now: new Date('2026-08-19T12:05:00Z'), stateDirectory, handlers, notifyFailure })
    await runDueJobsOnce({ now: new Date('2026-08-19T12:15:00Z'), stateDirectory, handlers, notifyFailure })
    await runDueJobsOnce({ now: new Date('2026-08-19T12:30:00Z'), stateDirectory, handlers, notifyFailure })

    expect(fxAttempts).toBe(3)
    expect(notifyFailure).toHaveBeenCalledTimes(1)
    expect(notifyFailure).toHaveBeenCalledWith(expect.objectContaining({
      type: 'scheduledJobFailures',
      job: 'fx-sync',
      scheduledFor: '2026-08-19T03:00:00.000Z',
      error: 'Frankfurter unavailable',
    }))
    expect((await readJobState('fx-sync', stateDirectory))?.status).toBe('success')
  })

  it('retries deferred work without recording success or sending a failure alert', async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'pocketbook-job-runner-'))
    const notifyFailure = vi.fn()
    const calls: string[] = []
    const handlers = successfulHandlers(calls)
    let backupAttempts = 0
    handlers.backup = async () => {
      backupAttempts += 1
      return backupAttempts === 1
        ? { status: 'deferred', summary: 'backup already running' }
        : { status: 'success', summary: 'backup complete' }
    }

    await runDueJobsOnce({ now: new Date('2026-08-19T12:00:00Z'), stateDirectory, handlers, notifyFailure })
    const deferred = await readJobState('backup', stateDirectory)
    expect(deferred).toEqual(expect.objectContaining({ status: 'deferred' }))
    expect(deferred?.lastSuccess).toBeUndefined()
    await runDueJobsOnce({ now: new Date('2026-08-19T12:05:00Z'), stateDirectory, handlers, notifyFailure })
    await runDueJobsOnce({ now: new Date('2026-08-19T12:15:00Z'), stateDirectory, handlers, notifyFailure })

    expect(backupAttempts).toBe(2)
    expect((await readJobState('backup', stateDirectory))?.status).toBe('success')
    expect(notifyFailure).not.toHaveBeenCalled()
  })
})
