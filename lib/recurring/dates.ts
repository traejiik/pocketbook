// Shared UTC calendar maths for recurring rules. Both the cron-driven generator
// (recurring-sync) and the on-create catch-up (recurring-backfill) materialise
// `@db.Date` rows, which store the UTC calendar day — so every helper here works
// in UTC. Local-midnight Dates would shift the stored day in positive-offset
// timezones (e.g. Budapest), so keep all date construction on `Date.UTC`.

import type { RecurringCycle } from './cadence'

export type { RecurringCycle } from './cadence'
export type Cadence = {
  cycle: RecurringCycle
  cycleInterval: number
  anchorDay: number | null
}
export type RuleKind = 'INCOME' | 'EXPENSE' | 'SAVINGS'

export function monthlyOccurrence(year: number, month: number, day: number) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const y = firstOfMonth.getUTCFullYear()
  const m = firstOfMonth.getUTCMonth()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)))
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function monthsPerCycle({ cycle, cycleInterval }: Pick<Cadence, 'cycle' | 'cycleInterval'>) {
  return cycleInterval * (cycle === 'ANNUAL' ? 12 : 1)
}

export function addCycles(cadence: Cadence, seed: Date, count: number): Date {
  // The entered or stored occurrence is authoritative at index zero. A billing
  // day correction can change the dates on either side without changing it.
  if (count === 0) return seed
  if (cadence.cycle === 'WEEKLY') {
    return new Date(seed.getTime() + count * cadence.cycleInterval * WEEK_MS)
  }
  return monthlyOccurrence(
    seed.getUTCFullYear(),
    seed.getUTCMonth() + count * monthsPerCycle(cadence),
    cadence.anchorDay ?? seed.getUTCDate(),
  )
}

/** Index of the last occurrence at or before the cutoff, relative to the original seed. */
export function cycleIndexOnOrBefore(cadence: Cadence, seed: Date, day: Date): number {
  if (cadence.cycle === 'WEEKLY') {
    return Math.floor((day.getTime() - seed.getTime()) / (cadence.cycleInterval * WEEK_MS))
  }

  const monthGap = (day.getUTCFullYear() - seed.getUTCFullYear()) * 12 + day.getUTCMonth() - seed.getUTCMonth()
  const index = Math.floor(monthGap / monthsPerCycle(cadence))
  // The projected month may be correct even when its billing day is after the cutoff.
  return isAfter(addCycles(cadence, seed, index), day) ? index - 1 : index
}

export function occurrenceOnOrBefore(cadence: Cadence, seed: Date, day: Date): Date {
  return addCycles(cadence, seed, cycleIndexOnOrBefore(cadence, seed, day))
}

export function firstOccurrenceAfter(cadence: Cadence, seed: Date, day: Date): Date {
  return addCycles(cadence, seed, cycleIndexOnOrBefore(cadence, seed, day) + 1)
}

export function monthlyEquivalent(amount: number, cadence: Pick<Cadence, 'cycle' | 'cycleInterval'>): number {
  if (cadence.cycle === 'WEEKLY') return amount * 52 / (12 * cadence.cycleInterval)
  return amount / monthsPerCycle(cadence)
}
