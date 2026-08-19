import { readJobState, writeJobState } from '@/lib/operations/job-state'
import {
  JOB_IDS,
  latestDueOccurrence,
  shouldRunOccurrence,
  type JobId,
  type JobState,
} from '@/lib/operations/schedule'
import type { NotificationEvent } from '@/lib/notifications/types'

export type JobHandlerResult = { status: 'success' | 'skipped' | 'deferred'; summary: string }
export type JobHandlers = Record<JobId, () => Promise<JobHandlerResult>>

export async function runDueJobsOnce(options: {
  now: Date
  stateDirectory?: string
  handlers: JobHandlers
  notifyFailure: (event: NotificationEvent) => Promise<unknown>
}) {
  const outcomes: Array<{ jobId: JobId; status: JobState['status']; occurrenceId: string }> = []

  for (const jobId of JOB_IDS) {
    const occurrence = latestDueOccurrence(jobId, options.now)
    const previous = await readJobState(jobId, options.stateDirectory)
    if (!shouldRunOccurrence(previous, occurrence, options.now)) continue

    const attemptedAt = options.now.toISOString()
    await writeJobState({
      version: 1,
      jobId,
      status: 'running',
      lastAttempt: { occurrenceId: occurrence.id, at: attemptedAt },
      ...(previous?.lastSuccess ? { lastSuccess: previous.lastSuccess } : {}),
      ...(previous?.failureNotifiedFor ? { failureNotifiedFor: previous.failureNotifiedFor } : {}),
    }, options.stateDirectory)

    try {
      const result = await options.handlers[jobId]()
      if (result.status === 'deferred') {
        await writeJobState({
          version: 1,
          jobId,
          status: 'deferred',
          lastAttempt: { occurrenceId: occurrence.id, at: attemptedAt },
          ...(previous?.lastSuccess ? { lastSuccess: previous.lastSuccess } : {}),
          ...(previous?.failureNotifiedFor ? { failureNotifiedFor: previous.failureNotifiedFor } : {}),
          summary: result.summary.slice(0, 1500),
        }, options.stateDirectory)
        outcomes.push({ jobId, status: 'deferred', occurrenceId: occurrence.id })
        continue
      }
      await writeJobState({
        version: 1,
        jobId,
        status: result.status,
        lastAttempt: { occurrenceId: occurrence.id, at: attemptedAt },
        lastSuccess: { occurrenceId: occurrence.id, at: new Date().toISOString() },
        ...(previous?.failureNotifiedFor ? { failureNotifiedFor: previous.failureNotifiedFor } : {}),
        summary: result.summary.slice(0, 1500),
      }, options.stateDirectory)
      outcomes.push({ jobId, status: result.status, occurrenceId: occurrence.id })
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1500)
      const firstFailure = previous?.failureNotifiedFor !== occurrence.id
      if (firstFailure) {
        try {
          await options.notifyFailure({
            type: 'scheduledJobFailures',
            job: jobId,
            error: message,
            scheduledFor: occurrence.scheduledFor,
          })
        } catch {
          // Notifications are best-effort and never change the job outcome.
        }
      }
      await writeJobState({
        version: 1,
        jobId,
        status: 'failed',
        lastAttempt: { occurrenceId: occurrence.id, at: attemptedAt },
        ...(previous?.lastSuccess ? { lastSuccess: previous.lastSuccess } : {}),
        failureNotifiedFor: firstFailure ? occurrence.id : previous?.failureNotifiedFor,
        error: message,
      }, options.stateDirectory)
      outcomes.push({ jobId, status: 'failed', occurrenceId: occurrence.id })
    }
  }

  return outcomes
}
