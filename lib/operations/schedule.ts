import { z } from 'zod'

export const JOB_IDS = ['backup', 'fx-sync', 'monthly-insight', 'recurring-sync'] as const
export type JobId = (typeof JOB_IDS)[number]

export type JobOccurrence = {
  id: string
  scheduledFor: string
}

export type JobState = {
  version: 1
  jobId: JobId
  status: 'running' | 'success' | 'skipped' | 'deferred' | 'failed'
  lastAttempt?: { occurrenceId: string; at: string }
  lastSuccess?: { occurrenceId: string; at: string }
  failureNotifiedFor?: string
  summary?: string
  error?: string
}

export const jobStateSchema: z.ZodType<JobState> = z.object({
  version: z.literal(1),
  jobId: z.enum(JOB_IDS),
  status: z.enum(['running', 'success', 'skipped', 'deferred', 'failed']),
  lastAttempt: z.object({ occurrenceId: z.string(), at: z.string().datetime() }).optional(),
  lastSuccess: z.object({ occurrenceId: z.string(), at: z.string().datetime() }).optional(),
  failureNotifiedFor: z.string().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
})

const DAILY_SCHEDULES: Record<Exclude<JobId, 'monthly-insight'>, { hour: number; minute: number }> = {
  backup: { hour: 2, minute: 30 },
  'fx-sync': { hour: 3, minute: 0 },
  'recurring-sync': { hour: 3, minute: 10 },
}

function dateId(date: Date) {
  return date.toISOString().slice(0, 10)
}

function monthId(date: Date) {
  return date.toISOString().slice(0, 7)
}

export function latestDueOccurrence(jobId: JobId, now: Date): JobOccurrence {
  if (jobId === 'monthly-insight') {
    let scheduled = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 3, 5))
    if (scheduled > now) {
      scheduled = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 3, 5))
    }
    return { id: monthId(scheduled), scheduledFor: scheduled.toISOString() }
  }

  const schedule = DAILY_SCHEDULES[jobId]
  let scheduled = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    schedule.hour,
    schedule.minute,
  ))
  if (scheduled > now) scheduled = new Date(scheduled.getTime() - 24 * 60 * 60 * 1000)
  return { id: dateId(scheduled), scheduledFor: scheduled.toISOString() }
}

export function nextOccurrence(jobId: JobId, now: Date): JobOccurrence {
  if (jobId === 'monthly-insight') {
    let scheduled = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 3, 5))
    if (scheduled <= now) {
      scheduled = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 3, 5))
    }
    return { id: monthId(scheduled), scheduledFor: scheduled.toISOString() }
  }

  const schedule = DAILY_SCHEDULES[jobId]
  let scheduled = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    schedule.hour,
    schedule.minute,
  ))
  if (scheduled <= now) scheduled = new Date(scheduled.getTime() + 24 * 60 * 60 * 1000)
  return { id: dateId(scheduled), scheduledFor: scheduled.toISOString() }
}

export function shouldRunOccurrence(
  state: JobState | null,
  occurrence: JobOccurrence,
  now: Date,
  retryIntervalMs = 15 * 60 * 1000,
): boolean {
  if (state?.lastSuccess?.occurrenceId === occurrence.id) return false
  if (state?.lastAttempt?.occurrenceId !== occurrence.id) return true
  return now.getTime() - new Date(state.lastAttempt.at).getTime() >= retryIntervalMs
}
