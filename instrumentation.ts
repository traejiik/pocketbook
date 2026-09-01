import type { Instrumentation } from 'next'

import pkg from '@/package.json'
import { logger, loggerConfig } from '@/lib/logger'

const log = logger('boot')
const errorLog = logger('error')

/**
 * Runs once per server process, before the first request is handled.
 *
 * The banner is the anchor line for everything else in `docker logs`: it says
 * which image is actually running (the version is baked at build time), how the
 * logger is configured, and which clock the scheduler and date defaults are
 * working against. The Node version is deliberately left to the supervisor's own
 * line: reading `process.version` here makes Turbopack warn about the Edge copy
 * of this file on every build, and the supervisor is plain Node with no such
 * constraint.
 *
 * Next.js loads this file in both the Node.js and the Edge runtimes, so the guard
 * keeps the banner to the one process that serves requests.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const config = loggerConfig()
  log.info('pocketbook starting', {
    version: pkg.version,
    env: process.env.NODE_ENV,
    logLevel: config.level,
    logFormat: config.format,
    requestLog: config.requests,
    tz: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    instance: process.env.PB_INSTANCE_NAME || undefined,
    ollama: process.env.OLLAMA_BASE_URL || process.env.PB_OLLAMA_BASE_URL || undefined,
    scheduler: process.env.PB_INTERNAL_JOB_TOKEN ? 'supervised' : 'not-supervised',
  })
}

/**
 * Every error Next.js catches on the server — a thrown Server Action, a failed
 * render, a route handler that blew up — arrives here with the route context
 * attached. Without it a failed mutation surfaced in the browser as a digest hash
 * and left nothing in the container log to match it against.
 *
 * This does not replace the local `try/catch` logging in the actions themselves:
 * that records what was being attempted, this records where it surfaced.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  errorLog.error(`unhandled ${context.routeType} error`, {
    method: request.method,
    path: request.path,
    route: context.routePath,
    router: context.routerKind,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    err: error,
  })
}
