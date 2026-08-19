import { describe, expect, it } from 'vitest'

import {
  latestDueOccurrence,
  nextOccurrence,
  shouldRunOccurrence,
  type JobState,
} from '@/lib/operations/schedule'

describe('UTC job occurrences', () => {
  it('uses yesterday before a daily schedule and today after it', () => {
    expect(latestDueOccurrence('backup', new Date('2026-08-19T02:29:59Z'))).toEqual({
      id: '2026-08-18',
      scheduledFor: '2026-08-18T02:30:00.000Z',
    })
    expect(latestDueOccurrence('backup', new Date('2026-08-19T02:30:00Z'))).toEqual({
      id: '2026-08-19',
      scheduledFor: '2026-08-19T02:30:00.000Z',
    })
  })

  it('targets only the latest due monthly occurrence', () => {
    expect(latestDueOccurrence('monthly-insight', new Date('2026-08-01T03:04:59Z'))).toEqual({
      id: '2026-07',
      scheduledFor: '2026-07-01T03:05:00.000Z',
    })
    expect(latestDueOccurrence('monthly-insight', new Date('2026-08-19T12:00:00Z'))).toEqual({
      id: '2026-08',
      scheduledFor: '2026-08-01T03:05:00.000Z',
    })
  })

  it('calculates the next fixed UTC occurrence for settings', () => {
    expect(nextOccurrence('backup', new Date('2026-08-19T02:29:59Z')).scheduledFor)
      .toBe('2026-08-19T02:30:00.000Z')
    expect(nextOccurrence('backup', new Date('2026-08-19T02:30:00Z')).scheduledFor)
      .toBe('2026-08-20T02:30:00.000Z')
    expect(nextOccurrence('monthly-insight', new Date('2026-08-19T12:00:00Z')).scheduledFor)
      .toBe('2026-09-01T03:05:00.000Z')
  })
})

describe('job retry gate', () => {
  const occurrence = { id: '2026-08-19', scheduledFor: '2026-08-19T03:00:00.000Z' }

  it('runs missing work and does not repeat a successful occurrence', () => {
    expect(shouldRunOccurrence(null, occurrence, new Date('2026-08-19T03:00:00Z'))).toBe(true)
    expect(shouldRunOccurrence({
      version: 1,
      jobId: 'fx-sync',
      status: 'success',
      lastSuccess: { occurrenceId: occurrence.id, at: '2026-08-19T03:00:10.000Z' },
    }, occurrence, new Date('2026-08-19T12:00:00Z'))).toBe(false)
  })

  it('waits fifteen minutes between retries for the same failed occurrence', () => {
    const state: JobState = {
      version: 1,
      jobId: 'fx-sync',
      status: 'failed',
      lastAttempt: { occurrenceId: occurrence.id, at: '2026-08-19T03:01:00.000Z' },
      error: 'network unavailable',
    }

    expect(shouldRunOccurrence(state, occurrence, new Date('2026-08-19T03:15:59Z'))).toBe(false)
    expect(shouldRunOccurrence(state, occurrence, new Date('2026-08-19T03:16:00Z'))).toBe(true)
  })
})
