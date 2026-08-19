import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  acquireBackupLock,
  readBackupStatus,
  releaseBackupLock,
  runBackup,
  type BackupCommandRunner,
} from '@/lib/operations/backup'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'pocketbook-backup-'))
  const backupDirectory = join(root, 'backups')
  const dataDirectory = join(root, 'data')
  const lockDirectory = join(root, 'backup.lock')
  await mkdir(backupDirectory)
  await mkdir(dataDirectory)
  return { backupDirectory, dataDirectory, lockDirectory }
}

describe('database backups', () => {
  it('dumps, verifies, atomically promotes, records, and rotates a backup', async () => {
    const paths = await fixture()
    for (let day = 1; day <= 15; day += 1) {
      await writeFile(join(paths.backupDirectory, `pocketbook-202607${String(day).padStart(2, '0')}-023000.dump`), 'old')
    }
    await writeFile(join(paths.backupDirectory, 'abandoned.dump.partial'), 'failed')
    const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv; timeoutMs: number }> = []
    let elapsedMs = 0
    const commandRunner: BackupCommandRunner = async (command, args, options) => {
      calls.push({ command, args, env: options.env, timeoutMs: options.timeoutMs })
      if (command === 'pg_dump') {
        const output = args[args.indexOf('--file') + 1]
        await writeFile(output, 'verified custom archive')
        elapsedMs = 29 * 60 * 1000
      }
      return { code: 0, stderr: '' }
    }
    const notify = vi.fn().mockResolvedValue({ delivered: true })

    const result = await runBackup({
      source: 'scheduled',
      now: new Date('2026-08-19T02:30:00Z'),
      commandRunner,
      clock: () => elapsedMs,
      notify,
      database: { host: 'pocketbook-db', user: 'pocketbook', name: 'pocketbook', password: 'secret' },
      ...paths,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'success',
      filename: 'pocketbook-20260819-023000.dump',
      kept: 14,
      source: 'scheduled',
    }))
    expect(calls.map((call) => call.command)).toEqual(['pg_dump', 'pg_restore'])
    expect(calls[0].args).toContain('--format=custom')
    expect(calls.map((call) => call.timeoutMs)).toEqual([30 * 60 * 1000, 60 * 1000])
    expect(calls[0].env.PGPASSWORD).toBe('secret')
    expect(calls[0].args.join(' ')).not.toContain('secret')
    expect((await readdir(paths.backupDirectory)).filter((name) => name.endsWith('.dump'))).toHaveLength(14)
    expect((await stat(join(paths.backupDirectory, 'pocketbook-20260819-023000.dump'))).mode & 0o777).toBe(0o600)
    expect((await readdir(paths.backupDirectory)).some((name) => name.endsWith('.partial'))).toBe(false)
    expect(await readBackupStatus(paths.dataDirectory)).toEqual(expect.objectContaining({
      status: 'success',
      filename: 'pocketbook-20260819-023000.dump',
      kept: 14,
    }))
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'backupCompleted' }))
  })

  it('prevents scheduled and manual backups from overlapping', async () => {
    const paths = await fixture()
    let releaseDump!: () => void
    const dumpBlocked = new Promise<void>((resolve) => { releaseDump = resolve })
    const commandRunner: BackupCommandRunner = async (command, args) => {
      if (command === 'pg_dump') {
        await dumpBlocked
        await writeFile(args[args.indexOf('--file') + 1], 'archive')
      }
      return { code: 0, stderr: '' }
    }
    const first = runBackup({
      source: 'scheduled', commandRunner, now: new Date('2026-08-19T02:30:00Z'), ...paths,
      database: { host: 'db', user: 'user', name: 'name', password: 'secret' },
    })

    await vi.waitFor(async () => expect(await readdir(paths.lockDirectory)).toContain('owner.json'))
    await expect(runBackup({
      source: 'manual', commandRunner, now: new Date('2026-08-19T02:30:01Z'), ...paths,
      database: { host: 'db', user: 'user', name: 'name', password: 'secret' },
    })).resolves.toEqual({ status: 'already-running' })

    releaseDump()
    await expect(first).resolves.toEqual(expect.objectContaining({ status: 'success' }))
  })

  it('recovers a lock left behind by a process that exceeded the backup timeout', async () => {
    const paths = await fixture()
    await mkdir(paths.lockDirectory)
    await writeFile(join(paths.lockDirectory, 'owner.json'), JSON.stringify({
      pid: 999_999,
      startedAt: '2026-08-19T01:00:00.000Z',
    }))
    const commandRunner: BackupCommandRunner = async (command, args) => {
      if (command === 'pg_dump') await writeFile(args[args.indexOf('--file') + 1], 'archive')
      return { code: 0, stderr: '' }
    }

    await expect(runBackup({
      source: 'scheduled',
      commandRunner,
      now: new Date('2026-08-19T02:30:00Z'),
      ...paths,
      database: { host: 'db', user: 'user', name: 'name', password: 'secret' },
    })).resolves.toEqual(expect.objectContaining({ status: 'success' }))
  })

  it('does not let an expired owner release a replacement lock', async () => {
    const paths = await fixture()
    const expiredToken = await acquireBackupLock(
      paths.lockDirectory,
      new Date('2026-08-19T01:00:00Z'),
    )
    const replacementToken = await acquireBackupLock(
      paths.lockDirectory,
      new Date('2026-08-19T01:32:00Z'),
    )

    expect(expiredToken).toBeTruthy()
    expect(replacementToken).toBeTruthy()
    await releaseBackupLock(paths.lockDirectory, expiredToken!)
    expect(await readdir(paths.lockDirectory)).toContain('owner.json')

    await releaseBackupLock(paths.lockDirectory, replacementToken!)
    await expect(stat(paths.lockDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes a failed partial archive and records a safe failure', async () => {
    const paths = await fixture()
    await writeFile(join(paths.dataDirectory, 'last-backup.json'), JSON.stringify({
      version: 1,
      status: 'success',
      source: 'scheduled',
      attemptedAt: '2026-08-18T02:30:00.000Z',
      successfulAt: '2026-08-18T02:30:10.000Z',
      filename: 'pocketbook-20260818-023000.dump',
      sizeBytes: 4096,
      kept: 14,
    }))
    const notify = vi.fn().mockResolvedValue({ delivered: true })
    const commandRunner: BackupCommandRunner = async (command, args) => {
      if (command === 'pg_dump') {
        await writeFile(args[args.indexOf('--file') + 1], 'partial')
        return { code: 1, stderr: 'connection refused' }
      }
      return { code: 0, stderr: '' }
    }

    const result = await runBackup({
      source: 'manual', commandRunner, notify, now: new Date('2026-08-19T02:30:00Z'), ...paths,
      database: { host: 'db', user: 'user', name: 'name', password: 'secret' },
    })

    expect(result).toEqual({ status: 'failed', source: 'manual', error: 'connection refused' })
    expect((await readdir(paths.backupDirectory)).some((name) => name.endsWith('.partial'))).toBe(false)
    expect(await readBackupStatus(paths.dataDirectory)).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'connection refused',
      source: 'manual',
      successfulAt: '2026-08-18T02:30:10.000Z',
      filename: 'pocketbook-20260818-023000.dump',
    }))
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'backupFailed' }))
  })

  it('reads the legacy timestamp until structured status exists', async () => {
    const paths = await fixture()
    await writeFile(join(paths.dataDirectory, 'last-backup'), '2026-08-18T02:30:00Z\n')

    expect(await readBackupStatus(paths.dataDirectory)).toEqual(expect.objectContaining({
      version: 1,
      status: 'success',
      successfulAt: '2026-08-18T02:30:00.000Z',
      legacy: true,
    }))
  })

  it('does not hide corrupt structured health behind a legacy success timestamp', async () => {
    const paths = await fixture()
    await writeFile(join(paths.dataDirectory, 'last-backup.json'), '{corrupt')
    await writeFile(join(paths.dataDirectory, 'last-backup'), '2026-08-18T02:30:00Z\n')

    expect(await readBackupStatus(paths.dataDirectory)).toEqual(expect.objectContaining({
      status: 'invalid',
      error: 'Backup status file is corrupt or unreadable.',
    }))
  })

  it('never changes the backup outcome when notification delivery throws', async () => {
    const successPaths = await fixture()
    const successfulRunner: BackupCommandRunner = async (command, args) => {
      if (command === 'pg_dump') await writeFile(args[args.indexOf('--file') + 1], 'archive')
      return { code: 0, stderr: '' }
    }
    await expect(runBackup({
      source: 'manual',
      commandRunner: successfulRunner,
      notify: vi.fn().mockRejectedValue(new Error('Discord unavailable')),
      now: new Date('2026-08-19T04:00:00Z'),
      ...successPaths,
      database: { host: 'db', user: 'user', name: 'name', password: 'secret' },
    })).resolves.toEqual(expect.objectContaining({ status: 'success' }))

    const failurePaths = await fixture()
    await expect(runBackup({
      source: 'manual',
      commandRunner: async () => ({ code: 1, stderr: 'database unavailable' }),
      notify: vi.fn().mockRejectedValue(new Error('Discord unavailable')),
      now: new Date('2026-08-19T04:01:00Z'),
      ...failurePaths,
      database: { host: 'db', user: 'user', name: 'name', password: 'secret' },
    })).resolves.toEqual({ status: 'failed', source: 'manual', error: 'database unavailable' })
  })

  it('returns a structured failure when backup storage cannot be prepared', async () => {
    const paths = await fixture()
    const blocked = join(paths.backupDirectory, 'not-a-directory')
    await writeFile(blocked, 'blocked')
    const notify = vi.fn().mockResolvedValue(undefined)

    await expect(runBackup({
      source: 'manual',
      backupDirectory: blocked,
      dataDirectory: paths.dataDirectory,
      lockDirectory: paths.lockDirectory,
      notify,
      database: { host: 'db', user: 'user', name: 'name', password: 'secret' },
    })).resolves.toEqual(expect.objectContaining({ status: 'failed', source: 'manual' }))
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'backupFailed' }))
  })
})
