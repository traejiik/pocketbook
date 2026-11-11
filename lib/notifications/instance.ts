import { clearTimeout, setTimeout } from 'node:timers'
import { sendNotification } from './send'
import type { NotificationEvent } from './types'

let lookup: Promise<string | null | undefined> | undefined

async function readInstanceName() {
  const { prisma } = await import('@/lib/prisma')
  const settings = await prisma.appSettings.findUnique({
    where: { id: 'singleton' },
    select: { instanceName: true },
  })
  return settings?.instanceName
}

async function resolveInstanceName() {
  const fallback = process.env.PB_INSTANCE_NAME
  // Allow one pending lookup per process. Even when PostgreSQL stalls, a
  // notification must not hold the scheduler tick or supervisor exit open.
  lookup ??= readInstanceName().catch(() => undefined).finally(() => { lookup = undefined })
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<undefined>(resolve => {
      timeout = setTimeout(() => resolve(undefined), 1500)
    })
    return (await Promise.race([lookup, deadline])) ?? fallback
  } finally {
    clearTimeout(timeout)
  }
}

export function sendInstanceNotification(event: NotificationEvent) {
  return sendNotification(event, { resolveInstanceName })
}
