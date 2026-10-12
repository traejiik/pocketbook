// Savings totals: what has been put into each SAVINGS-kind category ("pot"), minus
// what was withdrawn from it, over all time and month by month.
//
// Pure on purpose: `getSavingsSummary` in `lib/aggregations.ts` does the grouped
// read and the FX conversion, then hands the converted groups here. Everything
// below is arithmetic on anchor-currency numbers, so it is tested without a DB.

export type SavingsGroup = {
  /** `YYYY-MM` of the transactions in this group. */
  month: string
  categoryId: string
  type: 'SAVINGS' | 'WITHDRAWAL'
  /** SUM(ABS(amount)) in the anchor currency, or null when the group has no FX path. */
  amount: number | null
  /** Rows in the group, so unconvertible rows can be counted rather than dropped. */
  n: number
}

export type SavingsPotInput = { id: string; name: string; color: string }

export type SavingsPot = SavingsPotInput & {
  /** Deposits − withdrawals, all time. Negative only if more was withdrawn than recorded going in. */
  balance: number
  /** Share of the total in whole percent; 0 when the pot or the total is not positive. */
  share: number
  /** This month's net movement. */
  thisMonth: number
  deposited: number
  withdrawn: number
}

export type SavingsMonth = {
  month: string
  in: number
  out: number
  net: number
  /** Total saved at the end of this month. */
  totalAfter: number
}

export type SavingsSummary = {
  total: number
  deposited: number
  withdrawn: number
  /** Net movement in `todayMonth`. */
  thisMonth: number
  /** First month with any savings activity, or null when there is none. */
  since: string | null
  pots: SavingsPot[]
  /** Every month from `since` to `todayMonth` (or the latest dated row), oldest first, gaps filled. */
  months: SavingsMonth[]
  /** Savings rows with no FX path. Excluded from every figure above, never counted as zero. */
  unconvertibleCount: number
}

/** `YYYY-MM` → the next month's key. */
export function nextMonthKey(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function buildSavingsSummary(
  groups: SavingsGroup[],
  pots: SavingsPotInput[],
  todayMonth: string,
): SavingsSummary {
  const potTotals = new Map<string, { deposited: number; withdrawn: number; thisMonth: number }>()
  const monthTotals = new Map<string, { in: number; out: number }>()
  let unconvertibleCount = 0

  for (const g of groups) {
    if (g.amount === null) { unconvertibleCount += g.n; continue }
    const pot = potTotals.get(g.categoryId) ?? { deposited: 0, withdrawn: 0, thisMonth: 0 }
    const month = monthTotals.get(g.month) ?? { in: 0, out: 0 }
    if (g.type === 'SAVINGS') {
      pot.deposited += g.amount
      month.in += g.amount
      if (g.month === todayMonth) pot.thisMonth += g.amount
    } else {
      pot.withdrawn += g.amount
      month.out += g.amount
      if (g.month === todayMonth) pot.thisMonth -= g.amount
    }
    potTotals.set(g.categoryId, pot)
    monthTotals.set(g.month, month)
  }

  const deposited = round([...potTotals.values()].reduce((s, p) => s + p.deposited, 0))
  const withdrawn = round([...potTotals.values()].reduce((s, p) => s + p.withdrawn, 0))
  const total = deposited - withdrawn

  const keys = [...monthTotals.keys()].sort()
  const since = keys[0] ?? null
  const months: SavingsMonth[] = []
  if (since) {
    const last = keys[keys.length - 1] > todayMonth ? keys[keys.length - 1] : todayMonth
    let running = 0
    for (let m = since; m <= last; m = nextMonthKey(m)) {
      const t = monthTotals.get(m) ?? { in: 0, out: 0 }
      const inflow = round(t.in)
      const outflow = round(t.out)
      running += inflow - outflow
      months.push({ month: m, in: inflow, out: outflow, net: inflow - outflow, totalAfter: running })
    }
  }

  const thisMonth = months.find((m) => m.month === todayMonth)?.net ?? 0

  const potRows: SavingsPot[] = pots.map((p) => {
    const t = potTotals.get(p.id) ?? { deposited: 0, withdrawn: 0, thisMonth: 0 }
    const balance = round(t.deposited) - round(t.withdrawn)
    return {
      ...p,
      balance,
      share: total > 0 && balance > 0 ? Math.round((balance / total) * 100) : 0,
      thisMonth: round(t.thisMonth),
      deposited: round(t.deposited),
      withdrawn: round(t.withdrawn),
    }
  })
  potRows.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))

  return { total, deposited, withdrawn, thisMonth, since, pots: potRows, months, unconvertibleCount }
}

function round(n: number): number {
  return Math.round(n)
}
