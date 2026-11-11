import { cycleIndexOnOrBefore, parseDateOnly, type Cadence } from './dates'

type RenewalItem = {
  rule: Cadence & {
    nextDue: string
    installmentPaid: number | null
    installmentTotal: number | null
  }
  daysAway: number
  hufEquivalent: number | null
}

export function summariseRenewalHorizon<T extends RenewalItem>(renewals: T[], horizon: number) {
  const items: (T & { occurrences: number })[] = []
  let total = 0
  let unconvertibleOccurrences = 0

  for (const item of renewals) {
    if (item.daysAway > horizon) continue
    const { rule, hufEquivalent } = item
    const firstDue = parseDateOnly(rule.nextDue)
    const cutoff = new Date(firstDue)
    cutoff.setUTCDate(cutoff.getUTCDate() + horizon - item.daysAway)
    const remaining = rule.installmentTotal === null
      ? Infinity
      : Math.max(0, rule.installmentTotal - (rule.installmentPaid ?? 0))

    const occurrences = Math.min(remaining, cycleIndexOnOrBefore(rule, firstDue, cutoff) + 1)
    if (occurrences === 0) continue

    items.push({ ...item, occurrences })
    if (hufEquivalent === null) unconvertibleOccurrences += occurrences
    else total += hufEquivalent * occurrences
  }

  return { items, total, unconvertibleOccurrences }
}
