// Shared UTC calendar maths for recurring rules. Both the cron-driven generator
// (recurring-sync) and the on-create catch-up (recurring-backfill) materialise
// `@db.Date` rows, which store the UTC calendar day — so every helper here works
// in UTC. Local-midnight Dates would shift the stored day in positive-offset
// timezones (e.g. Budapest), so keep all date construction on `Date.UTC`.

export type RecurringCycle = 'MONTHLY' | 'ANNUAL'
export type RuleKind = 'INCOME' | 'EXPENSE' | 'SAVINGS'

export function monthlyOccurrence(year: number, month: number, day: number) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const y = firstOfMonth.getUTCFullYear()
  const m = firstOfMonth.getUTCMonth()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)))
}

export function annualOccurrence(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)))
}

export function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatDateOnly(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function isAfter(left: Date, right: Date) {
  return left.getTime() > right.getTime()
}

export function signedAmount(amount: number, kind: RuleKind) {
  return kind === 'INCOME' ? amount : -amount
}
