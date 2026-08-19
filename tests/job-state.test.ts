import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { readJobState, writeJobState } from '@/lib/operations/job-state'

describe('job state persistence', () => {
  it('returns null for a job that has never run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pocketbook-job-state-'))
    await expect(readJobState('backup', dir)).resolves.toBeNull()
  })

  it('atomically persists a protected typed state file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pocketbook-job-state-'))
    const state = {
      version: 1 as const,
      jobId: 'backup' as const,
      status: 'failed' as const,
      lastAttempt: { occurrenceId: '2026-08-19', at: '2026-08-19T02:30:02.000Z' },
      failureNotifiedFor: '2026-08-19',
      error: 'connection refused',
    }

    await writeJobState(state, dir)

    await expect(readJobState('backup', dir)).resolves.toEqual(state)
    expect((await stat(join(dir, 'backup.json'))).mode & 0o777).toBe(0o600)
  })
})
