import { fork, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import type { EventEmitter } from 'node:events'

import { sendNotification } from '@/lib/notifications/send'
import type { NotificationEvent } from '@/lib/notifications/types'

export interface ManagedChild extends EventEmitter {
  kill(signal: NodeJS.Signals): boolean
}

export function createInternalJobToken(random: (size: number) => Buffer = randomBytes) {
  return random(32).toString('hex')
}

export function superviseChildren(options: {
  web: ManagedChild
  worker: ManagedChild
  notify: (event: NotificationEvent) => Promise<unknown>
  exit: (code: number) => void
  now?: () => number
  heartbeatTimeoutMs?: number
  forceKillAfterMs?: number
}) {
  const now = options.now ?? Date.now
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 180_000
  const forceKillAfterMs = options.forceKillAfterMs ?? 25_000
  let lastHeartbeat = now()
  let stopping = false
  let fatalStarted = false
  let webStopped = false
  let workerStopped = false
  let forceKillTimer: ReturnType<typeof setTimeout> | null = null

  const finishPlannedShutdown = () => {
    if (!stopping || !webStopped || !workerStopped) return
    if (forceKillTimer) clearTimeout(forceKillTimer)
    options.exit(0)
  }

  const terminateBoth = (signal: NodeJS.Signals) => {
    options.web.kill(signal)
    options.worker.kill(signal)
  }

  const fatal = async (title: string, description: string) => {
    if (fatalStarted) return
    fatalStarted = true
    try {
      await options.notify({ type: 'systemAlerts', title, description })
    } finally {
      terminateBoth('SIGTERM')
      options.exit(1)
    }
  }

  options.web.on('exit', (code, signal) => {
    webStopped = true
    if (stopping) return finishPlannedShutdown()
    if (!stopping) void fatal(
      'Pocketbook web server stopped',
      `Next.js exited unexpectedly (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`,
    )
  })
  options.worker.on('exit', (code, signal) => {
    workerStopped = true
    if (stopping) return finishPlannedShutdown()
    if (!stopping) void fatal(
      'Pocketbook scheduler stopped',
      `The scheduler exited unexpectedly (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`,
    )
  })

  return {
    heartbeat(at = now()) {
      lastHeartbeat = at
    },
    async checkHeartbeat(at = now()) {
      if (!stopping && at - lastHeartbeat > heartbeatTimeoutMs) {
        await fatal(
          'Pocketbook scheduler stopped heartbeating',
          `No scheduler heartbeat was received for more than ${Math.round(heartbeatTimeoutMs / 1000)} seconds.`,
        )
      }
    },
    shutdown(signal: NodeJS.Signals) {
      if (stopping) return
      stopping = true
      terminateBoth(signal)
      forceKillTimer = setTimeout(() => terminateBoth('SIGKILL'), forceKillAfterMs)
      forceKillTimer.unref()
    },
  }
}

export function runSupervisor() {
  const token = createInternalJobToken()
  const env = { ...process.env, PB_INTERNAL_JOB_TOKEN: token }
  const web = spawn(process.execPath, ['/app/server.js'], { env, stdio: 'inherit' })
  const worker = fork('/app/runtime/scheduler.js', [], {
    env,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  })
  const control = superviseChildren({
    web,
    worker,
    notify: (event) => sendNotification(event, { instanceName: process.env.PB_INSTANCE_NAME }),
    exit: (code) => process.exit(code),
  })

  worker.on('message', (message) => {
    if (message && typeof message === 'object' && 'type' in message && message.type === 'heartbeat') {
      control.heartbeat()
    }
  })

  const watchdog = setInterval(() => void control.checkHeartbeat(), 30_000)
  watchdog.unref()
  process.once('SIGTERM', () => control.shutdown('SIGTERM'))
  process.once('SIGINT', () => control.shutdown('SIGINT'))
}

if (typeof require !== 'undefined' && require.main === module) runSupervisor()
