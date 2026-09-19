export type FxRates = { USD: number; EUR: number; GBP: number }

type AnchorInput = {
  amount: number
  /** Frozen anchor value of a persisted row; absent on optimistic rows. */
  amountAnchor?: number | null
  currency: string
  type: 'INCOME' | 'EXPENSE' | 'SAVINGS'
}

/**
 * A transaction's signed value in the anchor currency, for the Transactions
 * ledger's client-side sums (Net, Balance) and its "In HUF" column.
 *
 * Persisted rows carry a frozen anchor value; use it so the column never drifts.
 * Optimistic rows (no amountAnchor yet) fall back to the current live rate, which
 * is what they'll freeze to on save anyway. The sign comes from `type`, like the
 * server aggregations (`SUM(ABS(amount))` per type), so a row stored with the
 * wrong sign cannot turn an expense into income.
 */
export function toHUF(tx: AnchorInput, rates: FxRates): number {
  const rate =
    tx.currency === 'USD' ? rates.USD
    : tx.currency === 'EUR' ? rates.EUR
    : tx.currency === 'GBP' ? rates.GBP
    : 1
  const magnitude = Math.abs(tx.amountAnchor != null ? tx.amountAnchor : tx.amount * rate)
  return tx.type === 'INCOME' ? magnitude : -magnitude
}

/**
 * A transaction's contribution to the running balance: its `toHUF` value, or zero
 * when its category is excluded from the balance (`Category.includeInBalance`).
 * Mirrors the server's `cumulative-net` filter so the Transactions `Balance:`
 * segment agrees with the dashboard hero. Net never goes through this.
 */
export function balanceContribution(
  tx: AnchorInput & { category: { includeInBalance: boolean } },
  rates: FxRates,
): number {
  return tx.category.includeInBalance ? toHUF(tx, rates) : 0
}
