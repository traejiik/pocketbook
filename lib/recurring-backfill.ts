type RecurringCycle = 'MONTHLY' | 'ANNUAL'
type RuleKind = 'INCOME' | 'EXPENSE' | 'SAVINGS'
type Currency = 'HUF' | 'USD' | 'EUR' | 'GBP'

export type RecurringCatchUpInput = {
  name: string
  amount: number
  currency: Currency
  cycle: RecurringCycle
  nextDue: string
  kind: RuleKind
  categoryId: string
  installmentPaid?: number | null
  installmentTotal?: number | null
  today?: Date
}

export type PlannedBackfillTransaction = {
  date: string
  description: string
  amount: number
  currency: Currency
  type: RuleKind
  categoryId: string
}

export type RecurringCatchUpPlan = {
  nextDue: string
  archived: boolean
  installmentPaid: number | null
  transactions: PlannedBackfillTransaction[]
}

const MONTHLY_BACKFILL_LIMIT = 4

export function planRecurringCatchUp(input: RecurringCatchUpInput): RecurringCatchUpPlan {
  const today = startOfUtcDay(input.today ?? new Date())
  const enteredNextDue = parseDateOnly(input.nextDue)
  const installmentPaid = input.installmentPaid ?? null
  const installmentTotal = input.installmentTotal ?? null

  if (installmentPaid != null && installmentTotal != null && installmentPaid > installmentTotal) {
    throw new Error('Installment paid count cannot exceed total installments.')
  }

  const isInstallment = installmentTotal != null
  const count = isInstallment
    ? Math.min(installmentPaid ?? 0, installmentTotal)
    : backfillCount(input.cycle, enteredNextDue, today)

  const latestDue = occurrenceOnOrBefore(input.cycle, enteredNextDue, today)
  const dueDates = latestDue == null || count === 0
    ? []
    : previousOccurrences(input.cycle, latestDue, enteredNextDue, count)

  return {
    nextDue: isAfter(enteredNextDue, today)
      ? formatDateOnly(enteredNextDue)
      : formatDateOnly(firstOccurrenceAfter(input.cycle, enteredNextDue, today)),
    archived: isInstallment && (installmentPaid ?? 0) >= installmentTotal,
    installmentPaid,
    transactions: dueDates.map((date) => ({
      date: formatDateOnly(date),
      description: input.name,
      amount: signedAmount(input.amount, input.kind),
      currency: input.currency,
      type: input.kind,
      categoryId: input.categoryId,
    })),
  }
}

// Next due date when a rule resumes (e.g. on unarchive): keep a still-future
// date as-is, otherwise advance to the first occurrence after today so restoring
// never retroactively backfills a long gap of missed charges.
export function resumeNextDue(cycle: RecurringCycle, nextDue: string, today: Date = new Date()): string {
  const anchor = parseDateOnly(nextDue)
  const start = startOfUtcDay(today)
  return isAfter(anchor, start)
    ? formatDateOnly(anchor)
    : formatDateOnly(firstOccurrenceAfter(cycle, anchor, start))
}

function backfillCount(cycle: RecurringCycle, enteredNextDue: Date, today: Date) {
  if (cycle === 'MONTHLY') return MONTHLY_BACKFILL_LIMIT
  return isAfter(enteredNextDue, today) ? 0 : 1
}

function signedAmount(amount: number, kind: RuleKind) {
  return kind === 'INCOME' ? amount : -amount
}

function previousOccurrences(cycle: RecurringCycle, latest: Date, anchor: Date, count: number) {
  const dates: Date[] = []
  for (let i = count - 1; i >= 0; i--) {
    dates.push(addOccurrences(cycle, latest, anchor, -i))
  }
  return dates
}

// All date maths runs in UTC — `@db.Date` stores the UTC calendar day, so
// local-midnight Dates would shift the stored day in positive-offset timezones.
function occurrenceOnOrBefore(cycle: RecurringCycle, anchor: Date, today: Date) {
  if (cycle === 'MONTHLY') {
    const candidate = monthlyOccurrence(today.getUTCFullYear(), today.getUTCMonth(), anchor.getUTCDate())
    return isAfter(candidate, today)
      ? monthlyOccurrence(today.getUTCFullYear(), today.getUTCMonth() - 1, anchor.getUTCDate())
      : candidate
  }

  const candidate = annualOccurrence(today.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate())
  return isAfter(candidate, today)
    ? annualOccurrence(today.getUTCFullYear() - 1, anchor.getUTCMonth(), anchor.getUTCDate())
    : candidate
}

function firstOccurrenceAfter(cycle: RecurringCycle, anchor: Date, today: Date) {
  if (cycle === 'MONTHLY') {
    const candidate = monthlyOccurrence(today.getUTCFullYear(), today.getUTCMonth(), anchor.getUTCDate())
    return isAfter(candidate, today)
      ? candidate
      : monthlyOccurrence(today.getUTCFullYear(), today.getUTCMonth() + 1, anchor.getUTCDate())
  }

  const candidate = annualOccurrence(today.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate())
  return isAfter(candidate, today)
    ? candidate
    : annualOccurrence(today.getUTCFullYear() + 1, anchor.getUTCMonth(), anchor.getUTCDate())
}

function addOccurrences(cycle: RecurringCycle, date: Date, anchor: Date, amount: number) {
  if (cycle === 'MONTHLY') {
    return monthlyOccurrence(date.getUTCFullYear(), date.getUTCMonth() + amount, anchor.getUTCDate())
  }
  return annualOccurrence(date.getUTCFullYear() + amount, anchor.getUTCMonth(), anchor.getUTCDate())
}

function monthlyOccurrence(year: number, month: number, day: number) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const y = firstOfMonth.getUTCFullYear()
  const m = firstOfMonth.getUTCMonth()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)))
}

function annualOccurrence(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)))
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDateOnly(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function isAfter(left: Date, right: Date) {
  return left.getTime() > right.getTime()
}
