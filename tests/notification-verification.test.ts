import { describe, expect, it } from 'vitest'

import {
  issueNotificationVerificationReceipt,
  VERIFICATION_RECEIPT_TTL_MS,
  verifyNotificationVerificationReceipt,
} from '@/lib/notifications/verification'

const key = Buffer.alloc(32, 7)
const now = Date.parse('2026-08-19T12:00:00.000Z')
const identity = {
  webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
  username: 'Pocketbook',
  avatarUrl: 'https://i.ibb.co/logo.png',
}

describe('notification verification receipts', () => {
  it('issues a receipt that expires exactly after its TTL', () => {
    const result = issueNotificationVerificationReceipt(identity, { key, now })

    expect(result.expiresAt).toBe(new Date(now + VERIFICATION_RECEIPT_TTL_MS).toISOString())
  })

  it('verifies an exact identity through the last millisecond before expiry', () => {
    const { receipt } = issueNotificationVerificationReceipt(identity, { key, now })

    expect(verifyNotificationVerificationReceipt(receipt, identity, {
      key,
      now: now + VERIFICATION_RECEIPT_TTL_MS - 1,
    })).toEqual({
      identityHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      verifiedAt: new Date(now).toISOString(),
    })
  })

  it('rejects an expired receipt', () => {
    const { receipt } = issueNotificationVerificationReceipt(identity, { key, now })

    expect(verifyNotificationVerificationReceipt(receipt, identity, {
      key,
      now: now + VERIFICATION_RECEIPT_TTL_MS,
    })).toBeNull()
  })

  it('rejects a receipt when its identity changes', () => {
    const { receipt } = issueNotificationVerificationReceipt(identity, { key, now })

    expect(verifyNotificationVerificationReceipt(receipt, {
      ...identity,
      username: 'Pocketbook Home',
    }, { key, now })).toBeNull()
  })

  it('rejects a receipt with a tampered signature', () => {
    const { receipt } = issueNotificationVerificationReceipt(identity, { key, now })
    const [payload, signature] = receipt.split('.')
    const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`

    expect(verifyNotificationVerificationReceipt(`${payload}.${tamperedSignature}`, identity, {
      key,
      now,
    })).toBeNull()
  })

  it('rejects malformed receipts and payloads without throwing', () => {
    expect(() => verifyNotificationVerificationReceipt('not-a-receipt', identity, { key, now })).not.toThrow()
    expect(verifyNotificationVerificationReceipt('not-a-receipt', identity, { key, now })).toBeNull()
    expect(verifyNotificationVerificationReceipt('not-json.abc', identity, { key, now })).toBeNull()
  })
})
