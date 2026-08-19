import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), runBackup: vi.fn() }))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/operations/backup', () => ({ runBackup: mocks.runBackup }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('manual backup action', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.runBackup.mockResolvedValue({ status: 'success', filename: 'pocketbook.dump' })
  })

  it('authenticates before starting a manual backup', async () => {
    const { runBackupNow } = await import('@/server-actions/backups')
    await expect(runBackupNow()).resolves.toEqual({ status: 'success', filename: 'pocketbook.dump' })
    expect(mocks.runBackup).toHaveBeenCalledWith({ source: 'manual' })
  })

  it('does not start a backup for an unauthenticated caller', async () => {
    mocks.auth.mockResolvedValue(null)
    const { runBackupNow } = await import('@/server-actions/backups')
    await expect(runBackupNow()).rejects.toThrow('Unauthorised')
    expect(mocks.runBackup).not.toHaveBeenCalled()
  })
})
