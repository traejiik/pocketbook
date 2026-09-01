import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

import { sendNotification } from '@/lib/notifications/send'
import { logger } from '@/lib/logger'
import type { NotificationEvent } from '@/lib/notifications/types'

const log = logger('backup')

const BACKUP_TIMEOUT_MS = 30 * 60 * 1000
const RETENTION_COUNT = 14
const LOCK_STALE_AFTER_MS = BACKUP_TIMEOUT_MS + 60 * 1000

export type BackupSource = 'scheduled' | 'manual'

export type BackupResult =
  | {
      status: 'success'
      source: BackupSource
      filename: string
      sizeBytes: number
      size: string
      kept: number
      successfulAt: string
    }
  | { status: 'already-running' }
  | { status: 'failed'; source: BackupSource; error: string }

export type BackupCommandRunner = (
  command: 'pg_dump' | 'pg_restore',
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeoutMs: number },
) => Promise<{ code: number; stderr: string }>

export type BackupStatus = {
  version: 1
  status: 'running' | 'success' | 'failed' | 'invalid'
  source?: BackupSource
  attemptedAt?: string
  successfulAt?: string
  filename?: string
  sizeBytes?: number
  kept?: number
  error?: string
  legacy?: boolean
}

const backupStatusSchema: z.ZodType<BackupStatus> = z.object({
  version: z.literal(1),
  status: z.enum(['running', 'success', 'failed']),
  source: z.enum(['scheduled', 'manual']),
  attemptedAt: z.string().datetime(),
  successfulAt: z.string().datetime().optional(),
  filename: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  kept: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  legacy: z.boolean().optional(),
})

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function backupFilename(now: Date) {
  const compact = now.toISOString().replace(/[-:]/g, '')
  return `pocketbook-${compact.slice(0, 8)}-${compact.slice(9, 15)}.dump`
}

async function writeJsonAtomic(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  await chmod(path, 0o600)
}

export async function readBackupStatus(dataDirectory = '/data'): Promise<BackupStatus | null> {
  const invalidStatus = (): BackupStatus => ({
    version: 1,
    status: 'invalid',
    error: 'Backup status file is corrupt or unreadable.',
  })

  try {
    const parsed = backupStatusSchema.safeParse(
      JSON.parse(await readFile(join(dataDirectory, 'last-backup.json'), 'utf8')),
    )
    if (parsed.success) return parsed.data
    return invalidStatus()
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      return invalidStatus()
    }
  }

  // Only a missing structured status falls back to the old sidecar timestamp.
  try {
    const recorded = new Date((await readFile(join(dataDirectory, 'last-backup'), 'utf8')).trim())
    if (Number.isNaN(recorded.getTime())) return invalidStatus()
    const at = recorded.toISOString()
    return {
      version: 1,
      status: 'success',
      source: 'scheduled',
      attemptedAt: at,
      successfulAt: at,
      legacy: true,
    }
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? null
      : invalidStatus()
  }
}

export const runBackupCommand: BackupCommandRunner = (command, args, options) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      env: options.env,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += String(chunk).slice(0, 4000 - stderr.length)
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      resolve({ code: 1, stderr: error.message })
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stderr: signal ? `${stderr}\nterminated by ${signal}`.trim() : stderr })
    })
  })

export async function acquireBackupLock(
  lockDirectory: string,
  now: Date,
  allowRecovery = true,
): Promise<string | null> {
  const token = randomUUID()
  try {
    await mkdir(lockDirectory, { mode: 0o700 })
    await writeFile(
      join(lockDirectory, 'owner.json'),
      JSON.stringify({ token, pid: process.pid, startedAt: now.toISOString() }),
      { mode: 0o600 },
    )
    return token
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
    if (!allowRecovery) return null

    let startedAt = (await stat(lockDirectory)).mtimeMs
    try {
      const owner = JSON.parse(await readFile(join(lockDirectory, 'owner.json'), 'utf8')) as {
        startedAt?: unknown
      }
      if (typeof owner.startedAt === 'string') {
        const recorded = new Date(owner.startedAt).getTime()
        if (Number.isFinite(recorded)) startedAt = recorded
      }
    } catch {
      // Directory mtime is the safe fallback for a torn owner record.
    }
    if (now.getTime() - startedAt <= LOCK_STALE_AFTER_MS) return null

    await rm(lockDirectory, { recursive: true, force: true })
    return acquireBackupLock(lockDirectory, now, false)
  }
}

export async function releaseBackupLock(lockDirectory: string, token: string): Promise<void> {
  try {
    const owner = JSON.parse(await readFile(join(lockDirectory, 'owner.json'), 'utf8')) as {
      token?: unknown
    }
    if (owner.token !== token) return
    await rm(lockDirectory, { recursive: true, force: true })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
}

async function removeFailedPartials(backupDirectory: string) {
  const names = await readdir(backupDirectory)
  await Promise.all(names
    .filter((name) => name.endsWith('.partial'))
    .map((name) => rm(join(backupDirectory, name), { force: true })))
}

async function rotateBackups(backupDirectory: string) {
  const dumps = (await readdir(backupDirectory))
    .filter((name) => /^pocketbook-\d{8}-\d{6}\.dump$/.test(name))
    .sort()
    .reverse()
  await Promise.all(dumps.slice(RETENTION_COUNT).map((name) => rm(join(backupDirectory, name), { force: true })))
  return Math.min(dumps.length, RETENTION_COUNT)
}

export async function runBackup(options: {
  source: BackupSource
  now?: Date
  backupDirectory?: string
  dataDirectory?: string
  lockDirectory?: string
  commandRunner?: BackupCommandRunner
  clock?: () => number
  notify?: (event: NotificationEvent) => Promise<unknown>
  database?: { host: string; user: string; name: string; password: string }
}): Promise<BackupResult> {
  const now = options.now ?? new Date()
  const backupDirectory = options.backupDirectory ?? '/backups'
  const dataDirectory = options.dataDirectory ?? '/data'
  const lockDirectory = options.lockDirectory ?? '/tmp/pocketbook-backup.lock'
  const commandRunner = options.commandRunner ?? runBackupCommand
  const clock = options.clock ?? Date.now
  const startedAt = clock()
  const deadline = startedAt + BACKUP_TIMEOUT_MS
  const remainingTimeout = () => Math.max(1, deadline - clock())
  const notify = options.notify ?? ((event) => sendNotification(event, { instanceName: process.env.PB_INSTANCE_NAME }))
  const notifyBestEffort = async (event: NotificationEvent) => {
    try {
      await notify(event)
    } catch {
      // Delivery is observability, not part of backup correctness.
    }
  }
  const database = options.database ?? {
    host: process.env.PB_POSTGRES_HOST ?? 'pocketbook-db',
    user: process.env.PB_POSTGRES_USER ?? 'pocketbook',
    name: process.env.PB_POSTGRES_DB ?? 'pocketbook',
    password: process.env.PB_POSTGRES_PASSWORD ?? '',
  }

  const filename = backupFilename(now)
  const finalPath = join(backupDirectory, filename)
  const partialPath = `${finalPath}.partial`
  const statusPath = join(dataDirectory, 'last-backup.json')
  const attemptedAt = now.toISOString()
  let lockToken: string | null = null
  let lastVerified: Partial<Pick<BackupStatus, 'successfulAt' | 'filename' | 'sizeBytes' | 'kept'>> = {}

  try {
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 })
    await mkdir(dataDirectory, { recursive: true, mode: 0o700 })
    await chmod(backupDirectory, 0o700)
    await chmod(dataDirectory, 0o700)
    lockToken = await acquireBackupLock(lockDirectory, now)
    if (!lockToken) {
      log.warn('backup deferred', { source: options.source, reason: 'another backup holds the lock' })
      return { status: 'already-running' }
    }
    log.info('backup started', { source: options.source, filename, directory: backupDirectory })

    const previous = await readBackupStatus(dataDirectory)
    lastVerified = previous?.successfulAt ? {
      successfulAt: previous.successfulAt,
      ...(previous.filename ? { filename: previous.filename } : {}),
      ...(previous.sizeBytes !== undefined ? { sizeBytes: previous.sizeBytes } : {}),
      ...(previous.kept !== undefined ? { kept: previous.kept } : {}),
    } : {}

    // Holding the only backup lock means every pre-existing partial is abandoned.
    await removeFailedPartials(backupDirectory)
    await writeJsonAtomic(statusPath, {
      version: 1,
      status: 'running',
      source: options.source,
      attemptedAt,
      ...lastVerified,
    } satisfies BackupStatus)

    const env = { ...process.env, PGPASSWORD: database.password }
    await writeFile(partialPath, '', { mode: 0o600 })
    const dump = await commandRunner('pg_dump', [
      `--host=${database.host}`,
      `--username=${database.user}`,
      `--dbname=${database.name}`,
      '--format=custom',
      '--file',
      partialPath,
    ], { env, timeoutMs: remainingTimeout() })
    if (dump.code !== 0) throw new Error(dump.stderr.trim() || `pg_dump exited ${dump.code}`)

    const verify = await commandRunner('pg_restore', ['--list', partialPath], {
      env,
      timeoutMs: remainingTimeout(),
    })
    if (verify.code !== 0) throw new Error(verify.stderr.trim() || `pg_restore exited ${verify.code}`)

    await chmod(partialPath, 0o600)
    await rename(partialPath, finalPath)
    await chmod(finalPath, 0o600)
    const sizeBytes = (await stat(finalPath)).size
    const kept = await rotateBackups(backupDirectory)
    const successfulAt = new Date().toISOString()
    const status: BackupStatus = {
      version: 1,
      status: 'success',
      source: options.source,
      attemptedAt,
      successfulAt,
      filename,
      sizeBytes,
      kept,
    }
    await writeJsonAtomic(statusPath, status)
    log.info('backup finished', {
      source: options.source,
      filename,
      size: formatBytes(sizeBytes),
      kept,
      ms: clock() - startedAt,
    })
    await notifyBestEffort({
      type: 'backupCompleted',
      filename,
      size: formatBytes(sizeBytes),
      kept,
      source: options.source,
    })
    return {
      status: 'success',
      source: options.source,
      filename,
      sizeBytes,
      size: formatBytes(sizeBytes),
      kept,
      successfulAt,
    }
  } catch (error) {
    try {
      await rm(partialPath, { force: true })
    } catch {
      // Storage preparation itself may have failed before a partial could exist.
    }
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1500)
    log.error('backup failed', { source: options.source, filename, err: error })
    try {
      await mkdir(dataDirectory, { recursive: true })
      await writeJsonAtomic(statusPath, {
        version: 1,
        status: 'failed',
        source: options.source,
        attemptedAt,
        ...lastVerified,
        error: message,
      } satisfies BackupStatus)
    } catch {
      // Return the failure even when its status directory is also unavailable.
    }
    await notifyBestEffort({ type: 'backupFailed', error: message, source: options.source })
    return { status: 'failed', source: options.source, error: message }
  } finally {
    if (lockToken) {
      try {
        await releaseBackupLock(lockDirectory, lockToken)
      } catch {
        // A stale lock is recoverable on the next attempt.
      }
    }
  }
}
