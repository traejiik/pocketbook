import { getRecurringRules, getCategories } from '@/lib/aggregations'
import { RecurringView, type SerialisedRule } from './RecurringView'

const FX = { usd: 358.4, eur: 396.1 }

function hufAmt(amt: number, currency: string) {
  if (currency === 'USD') return amt * FX.usd
  if (currency === 'EUR') return amt * FX.eur
  return amt
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

export default async function RecurringPage() {
  const [rules, categories] = await Promise.all([getRecurringRules(), getCategories()])

  const serialisedRules: SerialisedRule[] = rules.map((r: (typeof rules)[number]) => ({
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    currency: r.currency,
    cycle: r.cycle,
    nextDue: toDateStr(r.nextDue),
    kind: r.kind,
    categoryId: r.categoryId,
    installmentPaid: r.installmentPaid,
    installmentTotal: r.installmentTotal,
    installmentEndsOn: r.installmentEndsOn ? toDateStr(r.installmentEndsOn) : null,
    archived: r.archived,
    category: r.category,
  }))

  const expenseRules = serialisedRules.filter((r) => r.kind === 'EXPENSE')
  const incomeRules  = serialisedRules.filter((r) => r.kind === 'INCOME')

  const monthlyTotal = expenseRules
    .filter((r) => r.cycle === 'MONTHLY')
    .reduce((s, r) => s + hufAmt(r.amount, r.currency), 0)

  const annualTotal = expenseRules
    .filter((r) => r.cycle === 'ANNUAL')
    .reduce((s, r) => s + hufAmt(r.amount, r.currency), 0)

  const incomeMonthly = incomeRules
    .filter((r) => r.cycle === 'MONTHLY')
    .reduce((s, r) => s + hufAmt(r.amount, r.currency), 0)

  return (
    <RecurringView
      rules={serialisedRules}
      categories={categories}
      monthlyTotal={monthlyTotal}
      annualTotal={annualTotal}
      incomeMonthly={incomeMonthly}
    />
  )
}
