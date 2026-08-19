import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { notificationIdentityKey } from '@/lib/notifications/identity'
import type { NotificationIdentity } from '@/lib/notifications/types'

export const VERIFICATION_RECEIPT_TTL_MS = 10 * 60 * 1000

const verificationGlobal = globalThis as typeof globalThis & {
  __pocketbookNotificationVerificationKey?: Buffer
}
const processSigningKey = verificationGlobal.__pocketbookNotificationVerificationKey
  ?? (verificationGlobal.__pocketbookNotificationVerificationKey = randomBytes(32))

type ReceiptOptions = { key?: Uint8Array; now?: number }
type ReceiptPayload = { identityHash: string; issuedAt: number; expiresAt: number }

export function hashNotificationIdentity(identity: NotificationIdentity): string {
  return createHash('sha256').update(notificationIdentityKey(identity)).digest('hex')
}

export function issueNotificationVerificationReceipt(
  identity: NotificationIdentity,
  options: ReceiptOptions = {},
): { receipt: string; expiresAt: string } {
  const issuedAt = options.now ?? Date.now()
  const expiresAt = issuedAt + VERIFICATION_RECEIPT_TTL_MS
  const payload: ReceiptPayload = {
    identityHash: hashNotificationIdentity(identity),
    issuedAt,
    expiresAt,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', options.key ?? processSigningKey)
    .update(encodedPayload)
    .digest()
    .toString('base64url')

  return {
    receipt: `${encodedPayload}.${signature}`,
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

export function verifyNotificationVerificationReceipt(
  receipt: string,
  identity: NotificationIdentity,
  options: ReceiptOptions = {},
): { identityHash: string; verifiedAt: string } | null {
  try {
    const segments = receipt.split('.')
    if (segments.length !== 2) return null

    const [encodedPayload, encodedSignature] = segments
    const suppliedSignature = Buffer.from(encodedSignature, 'base64url')
    if (suppliedSignature.toString('base64url') !== encodedSignature) return null
    const expectedSignature = createHmac('sha256', options.key ?? processSigningKey)
      .update(encodedPayload)
      .digest()
    if (
      suppliedSignature.length !== expectedSignature.length
      || !timingSafeEqual(suppliedSignature, expectedSignature)
    ) return null

    const payload: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (!isReceiptPayload(payload)) return null

    const now = options.now ?? Date.now()
    if (payload.expiresAt <= now || payload.issuedAt > payload.expiresAt) return null
    if (payload.identityHash !== hashNotificationIdentity(identity)) return null

    return {
      identityHash: payload.identityHash,
      verifiedAt: new Date(payload.issuedAt).toISOString(),
    }
  } catch {
    return null
  }
}

function isReceiptPayload(value: unknown): value is ReceiptPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<ReceiptPayload>
  return (
    typeof payload.identityHash === 'string'
    && /^[a-f0-9]{64}$/.test(payload.identityHash)
    && typeof payload.issuedAt === 'number'
    && Number.isFinite(payload.issuedAt)
    && typeof payload.expiresAt === 'number'
    && Number.isFinite(payload.expiresAt)
  )
}
