export type TransientNotificationVerification = {
  identityKey: string
  receipt: string
  expiresAt: string
}

export function parseFreshNotificationExpiry(expiresAt: string, now: number): number | null {
  const parsedExpiry = Date.parse(expiresAt)
  return Number.isFinite(parsedExpiry) && parsedExpiry > now ? parsedExpiry : null
}

export function evaluateClientNotificationVerification(
  persistedIdentityKey: string | null,
  transientVerification: TransientNotificationVerification | null,
  currentIdentityKey: string,
  now: number,
): { canSave: boolean; matchingReceipt: string | null } {
  const persistedMatches = persistedIdentityKey === currentIdentityKey
  const transientMatches = transientVerification?.identityKey === currentIdentityKey
    && parseFreshNotificationExpiry(transientVerification.expiresAt, now) !== null

  return {
    canSave: persistedMatches || transientMatches,
    matchingReceipt: transientMatches ? transientVerification.receipt : null,
  }
}
