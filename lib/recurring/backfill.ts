import {
  type Cadence,
  type RecurringCycle,
  type RuleKind,
  monthlyOccurrence,
  addCycles,
  cycleIndexOnOrBefore,
  firstOccurrenceAfter,
  parseDateOnly,
  formatDateOnly,
  startOfUtcDay,
  isAfter,
  signedAmount,
} from '@/lib/recurring/dates'

type Currency = 'HUF' | 'USD' | 'EUR' | 'GBP'

export type RecurringCatchUpInput = {
  name: string
  amount: number
  currency: Currency
  cycle: RecurringCycle
  cycleInterval?: number
  anchorDay?: number | null
  nextDue: string
  kind: RuleKind
  categoryId: string
  installmentPaid?: number | null
  installmentTotal?: number | null
  /** Log the charges this rule already made? Default true. Installment plans ignore it. */
  backfill?: boolean
  /** How many months of history to log when backfilling. Default `DEFAULT_BACKFILL_MONTHS`. */
  backfillMonths?: number | null
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
  anchorDay: number | null
  archived: boolean
  installmentPaid: number | null
  transactions: PlannedBackfillTransaction[]
}

/** Months of history a new rule logs unless the form says otherwise. */
export const DEFAULT_BACKFILL_MONTHS = 4
/** Upper bound for the form's month input — two years of catch-up is plenty. */
export const MAX_BACKFILL_MONTHS = 24

export function planRecurringCatchUp(input: RecurringCatchUpInput): RecurringCatchUpPlan {
  const today = startOfUtcDay(input.today ?? new Date())
  const enteredNextDue = parseDateOnly(input.nextDue)
  const cadence: Cadence = {
    cycle: input.cycle,
    cycleInterval: input.cycleInterval ?? 1,
    anchorDay: input.cycle === 'WEEKLY' ? null : input.anchorDay ?? enteredNextDue.getUTCDate(),
  }
  const installmentPaid = input.installmentPaid ?? null
  const installmentTotal = input.installmentTotal ?? null

  if (installmentPaid != null && installmentTotal != null && installmentPaid > installmentTotal) {
    throw new Error('Installment paid count cannot exceed total installments.')
  }

  const isInstallment = installmentTotal != null
  const lastIndex = cycleIndexOnOrBefore(cadence, enteredNextDue, today)
  // Installment history is set by the number of payments already made.
  const count = isInstallment
    ? (installmentPaid ?? 0)
    : backfillCount(cadence, enteredNextDue, today, lastIndex, input)

  const dueDates = Array.from({ length: count }, (_, index) =>
    addCycles(cadence, enteredNextDue, lastIndex - count + 1 + index),
  )

  return {
    anchorDay: cadence.anchorDay,
    nextDue: formatDateOnly(addCycles(cadence, enteredNextDue, Math.max(0, lastIndex + 1))),
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
export function resumeNextDue(
  rule: Omit<Cadence, 'cycleInterval'> & { nextDue: Date; cycleInterval?: number },
  today: Date = new Date(),
): string {
  const { nextDue } = rule
  const start = startOfUtcDay(today)
  return isAfter(nextDue, start)
    ? formatDateOnly(nextDue)
    : formatDateOnly(firstOccurrenceAfter({ ...rule, cycleInterval: rule.cycleInterval ?? 1 }, nextDue, start))
}

function backfillCount(
  cadence: Cadence,
  seed: Date,
  today: Date,
  lastIndex: number,
  opts: { backfill?: boolean; backfillMonths?: number | null },
): number {
  if (opts.backfill === false) return 0

  const months = Math.max(0, Math.min(Math.trunc(opts.backfillMonths ?? DEFAULT_BACKFILL_MONTHS), MAX_BACKFILL_MONTHS))
  // Preserve the original history rules for single-month and single-year cadences.
  if (cadence.cycleInterval === 1) {
    if (cadence.cycle === 'MONTHLY') return months
    if (cadence.cycle === 'ANNUAL') return isAfter(seed, today) ? 0 : 1
  }
  if (months === 0) return 0

  const cutoff = monthlyOccurrence(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate())
  const cutoffIndex = cycleIndexOnOrBefore(cadence, seed, cutoff)
  const cutoffIsOccurrence = addCycles(cadence, seed, cutoffIndex).getTime() === cutoff.getTime()
  return lastIndex - cutoffIndex + Number(cutoffIsOccurrence)
}
