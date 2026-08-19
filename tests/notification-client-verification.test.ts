import { describe, expect, it } from 'vitest'

import {
  evaluateClientNotificationVerification,
  parseFreshNotificationExpiry,
  type TransientNotificationVerification,
} from '@/lib/notifications/client-verification'

const now = Date.parse('2026-08-19T12:00:00.000Z')
const futureExpiry = '2026-08-19T12:05:00.000Z'

function transient(
  overrides: Partial<TransientNotificationVerification> = {},
): TransientNotificationVerification {
  return {
    identityKey: 'current-identity',
    receipt: 'signed-receipt',
    expiresAt: futureExpiry,
    ...overrides,
  }
}

describe('client notification verification expiry', () => {
  it('parses a future expiry', () => {
    expect(parseFreshNotificationExpiry(futureExpiry, now)).toBe(Date.parse(futureExpiry))
  })

  it('rejects an expiry exactly equal to now', () => {
    expect(parseFreshNotificationExpiry('2026-08-19T12:00:00.000Z', now)).toBeNull()
  })

  it('rejects an expired timestamp', () => {
    expect(parseFreshNotificationExpiry('2026-08-19T11:59:59.999Z', now)).toBeNull()
  })

  it('rejects an invalid timestamp', () => {
    expect(parseFreshNotificationExpiry('not-an-expiry', now)).toBeNull()
  })
})

describe('client notification verification state', () => {
  it('rejects a fresh receipt for a different identity', () => {
    expect(evaluateClientNotificationVerification(
      null,
      transient({ identityKey: 'different-identity' }),
      'current-identity',
      now,
    )).toEqual({ canSave: false, matchingReceipt: null })
  })

  it('allows an identity covered by persisted proof without forwarding a receipt', () => {
    expect(evaluateClientNotificationVerification(
      'current-identity',
      null,
      'current-identity',
      now,
    )).toEqual({ canSave: true, matchingReceipt: null })
  })

  it('allows and forwards only a fresh receipt for the current identity', () => {
    expect(evaluateClientNotificationVerification(
      null,
      transient(),
      'current-identity',
      now,
    )).toEqual({ canSave: true, matchingReceipt: 'signed-receipt' })
  })

  it.each([
    ['exact expiry', '2026-08-19T12:00:00.000Z'],
    ['expired proof', '2026-08-19T11:59:59.999Z'],
    ['invalid expiry', 'not-an-expiry'],
  ])('does not forward a matching receipt with %s', (_name, expiresAt) => {
    expect(evaluateClientNotificationVerification(
      null,
      transient({ expiresAt }),
      'current-identity',
      now,
    )).toEqual({ canSave: false, matchingReceipt: null })
  })
})
