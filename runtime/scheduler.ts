import { createConnection } from 'node:net'

import { sendNotification } from '@/lib/notifications/send'
import { logger } from '@/lib/logger'
import type { NotificationEvent } from '@/lib/notifications/types'
import { runBackup, type BackupResult } from '@/lib/operations/backup'
import { runDueJobsOnce, type JobHandlers } from '@/lib/operations/job-runner'

const log = logger('scheduler')

const LOOPBACK_BASE_URL = 'http://127.0.0.1:3000'

export function createScheduledBackupNotifier(
  deliver: (event: NotificationEvent) => Promise<unknown>,
) {
  return async (event: NotificationEvent) => {
    // Failures are promoted to the job runner so it can enforce one alert per
    // occurrence. Completions can be delivered immediately and independently.
    if (event.type === 'backupCompleted') await deliver(event)
  }
}

async function postInternalJob(
  path: string,
  token: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${LOOPBACK_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'x-internal-job-token': token },
      signal: controller.signal,
    })
    if (!response.ok) {
      const message = (await response.text()).slice(0, 1500)
      log.warn('internal job call failed', { path, status: response.status, body: message })
      throw new Error(`${path} returned ${response.status}: ${message}`)
    }
    return await response.json() as Record<string, unknown>
  } finally {
    clearTimeout(timer)
  }
}

export function createJobHandlers(options: {
  token: string
  fetchImpl?: typeof fetch
  runBackupImpl?: () => Promise<BackupResult>
}): JobHandlers {
  const fetchImpl = options.fetchImpl ?? fetch
  const runBackupImpl = options.runBackupImpl ?? (() => runBackup({
    source: 'scheduled',
    notify: createScheduledBackupNotifier((event) => sendNotification(event, {
      instanceName: process.env.PB_INSTANCE_NAME,
    })),
  }))

  return {
    backup: async () => {
      const result = await runBackupImpl()
      if (result.status === 'already-running') {
        return { status: 'deferred', summary: 'backup already running' }
      }
      if (result.status === 'failed') throw new Error(result.error)
      return {
        status: 'success',
        summary: `${result.filename} · ${result.size} · ${result.kept} kept`,
      }
    },
    'fx-sync': async () => {
      const result = await postInternalJob('/api/fx/sync', options.token, 2 * 60 * 1000, fetchImpl)
      if (result.skipped === true) return { status: 'skipped', summary: 'automatic FX sync disabled' }
      return { status: 'success', summary: `${Number(result.synced ?? 0)} rates synced` }
    },
    'monthly-insight': async () => {
      const result = await postInternalJob('/api/insights/monthly', options.token, 30 * 60 * 1000, fetchImpl)
      if (result.skipped === true) {
        return { status: 'skipped', summary: 'monthly insight disabled or already current' }
      }
      return { status: 'success', summary: `insight generated for ${String(result.monthCovered ?? 'latest month')}` }
    },
    'recurring-sync': async () => {
      const result = await postInternalJob('/api/recurring/sync', options.token, 5 * 60 * 1000, fetchImpl)
      return {
        status: 'success',
        summary: `${Number(result.rulesProcessed ?? 0)} rules processed, ${Number(result.transactionsCreated ?? 0)} transactions created`,
      }
    },
  }
}

function portIsOpen() {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection(3000, '127.0.0.1')
    socket.setTimeout(1000)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
    socket.once('error', () => resolve(false))
  })
}

async function waitForWeb() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (await portIsOpen()) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('Next.js did not open port 3000 within 120 seconds')
}

export async function runScheduler() {
  const token = process.env.PB_INTERNAL_JOB_TOKEN
  if (!token) throw new Error('PB_INTERNAL_JOB_TOKEN is required for the scheduler')

  log.info('scheduler starting', { pid: process.pid, tickSeconds: 60 })

  let stopping = false
  let active: Promise<unknown> | null = null
  const heartbeat = () => process.send?.({ type: 'heartbeat' })
  heartbeat()
  const heartbeatTimer = setInterval(heartbeat, 30_000)

  await waitForWeb()
  log.info('scheduler ready', { web: LOOPBACK_BASE_URL })
  const handlers = createJobHandlers({ token })
  const tick = () => {
    if (stopping || active) return
    active = runDueJobsOnce({
      now: new Date(),
      handlers,
      notifyFailure: async (event) => {
        if (event.type === 'scheduledJobFailures' && event.job === 'backup') {
          await sendNotification(
            { type: 'backupFailed', source: 'scheduled', error: event.error },
            { instanceName: process.env.PB_INSTANCE_NAME },
          )
          return
        }
        await sendNotification(event, { instanceName: process.env.PB_INSTANCE_NAME })
      },
    }).catch((error) => {
      log.error('tick failed', { err: error })
    }).finally(() => {
      active = null
    })
  }

  tick()
  const scheduleTimer = setInterval(tick, 60_000)
  const stop = () => {
    log.info('scheduler stopping', { draining: !!active })
    stopping = true
    clearInterval(scheduleTimer)
    clearInterval(heartbeatTimer)
    void active?.finally(() => process.exit(0))
    if (!active) process.exit(0)
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}

if (typeof require !== 'undefined' && require.main === module) {
  runScheduler().catch((error) => {
    log.error('scheduler exited', { err: error })
    process.exit(1)
  })
}
