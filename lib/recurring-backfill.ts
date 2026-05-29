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
  const today = startOfLocalDay(input.today ?? new Date())
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

function occurrenceOnOrBefore(cycle: RecurringCycle, anchor: Date, today: Date) {
  if (cycle === 'MONTHLY') {
    const candidate = monthlyOccurrence(today.getFullYear(), today.getMonth(), anchor.getDate())
    return isAfter(candidate, today)
      ? monthlyOccurrence(today.getFullYear(), today.getMonth() - 1, anchor.getDate())
      : candidate
  }

  const candidate = annualOccurrence(today.getFullYear(), anchor.getMonth(), anchor.getDate())
  return isAfter(candidate, today)
    ? annualOccurrence(today.getFullYear() - 1, anchor.getMonth(), anchor.getDate())
    : candidate
}

function firstOccurrenceAfter(cycle: RecurringCycle, anchor: Date, today: Date) {
  if (cycle === 'MONTHLY') {
    const candidate = monthlyOccurrence(today.getFullYear(), today.getMonth(), anchor.getDate())
    return isAfter(candidate, today)
      ? candidate
      : monthlyOccurrence(today.getFullYear(), today.getMonth() + 1, anchor.getDate())
  }

  const candidate = annualOccurrence(today.getFullYear(), anchor.getMonth(), anchor.getDate())
  return isAfter(candidate, today)
    ? candidate
    : annualOccurrence(today.getFullYear() + 1, anchor.getMonth(), anchor.getDate())
}

function addOccurrences(cycle: RecurringCycle, date: Date, anchor: Date, amount: number) {
  if (cycle === 'MONTHLY') {
    return monthlyOccurrence(date.getFullYear(), date.getMonth() + amount, anchor.getDate())
  }
  return annualOccurrence(date.getFullYear() + amount, anchor.getMonth(), anchor.getDate())
}

function monthlyOccurrence(year: number, month: number, day: number) {
  const firstOfMonth = new Date(year, month, 1)
  const lastDay = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate()
  return new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), Math.min(day, lastDay))
}

function annualOccurrence(year: number, month: number, day: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, lastDay))
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDateOnly(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isAfter(left: Date, right: Date) {
  return left.getTime() > right.getTime()
}
