// Transaction types and the two facts every read and write derives from them:
// which category kind a type books against, and which way it moves the balance.
//
// The sign rule (AGENTS.md rule 16) lives here and nowhere else: income and
// savings withdrawals are stored positive, expenses and savings deposits
// negative, whatever sign a caller or a CSV file supplied.

export const TX_TYPES = ['INCOME', 'EXPENSE', 'SAVINGS', 'WITHDRAWAL'] as const
export type TxType = (typeof TX_TYPES)[number]

export type CategoryKindName = 'INCOME' | 'EXPENSE' | 'SAVINGS'

export function isTxType(value: string): value is TxType {
  return (TX_TYPES as readonly string[]).includes(value)
}

/** The category kind a transaction of this type must use. Withdrawals come out of savings pots. */
export function kindForType(type: TxType): CategoryKindName {
  return type === 'WITHDRAWAL' ? 'SAVINGS' : type
}

/** +1 when the type adds to the running balance, −1 when it takes from it. */
export function signForType(type: TxType): 1 | -1 {
  switch (type) {
    case 'INCOME':
    case 'WITHDRAWAL':
      return 1
    case 'EXPENSE':
    case 'SAVINGS':
      return -1
    default: {
      const unreachable: never = type
      throw new Error(`Unknown transaction type: ${String(unreachable)}`)
    }
  }
}

/** A magnitude stored with the sign its type demands. */
export function signedForType(amount: number, type: TxType): number {
  return signForType(type) * Math.abs(amount)
}

/** Deposits and withdrawals both belong to the savings view. */
export function isSavingsType(type: TxType): boolean {
  return type === 'SAVINGS' || type === 'WITHDRAWAL'
}

/** The ledger's type filter: `SAVINGS` shows deposits and withdrawals together. */
export type TxTypeFilter = 'all' | 'INCOME' | 'EXPENSE' | 'SAVINGS'

export function parseTypeFilter(value: string | null): TxTypeFilter {
  return value === 'INCOME' || value === 'EXPENSE' || value === 'SAVINGS' ? value : 'all'
}

export function matchesTypeFilter(type: TxType, filter: TxTypeFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'SAVINGS') return isSavingsType(type)
  return type === filter
}

/** Ledger glyph: `+` income, `−` expense, `↓` into savings, `↑` back out of savings. */
export function typeGlyph(type: TxType): string {
  switch (type) {
    case 'INCOME': return '+'
    case 'EXPENSE': return '−'
    case 'SAVINGS': return '↓'
    case 'WITHDRAWAL': return '↑'
  }
}

/** Human label for a type ("Withdrawal", "Savings", …). */
export function typeLabel(type: TxType): string {
  return type.charAt(0) + type.slice(1).toLowerCase()
}
