import { getRecurringRules, getCategories } from '@/lib/aggregations'
import { RecurringView } from './RecurringView'
import type { RecurringRule } from '@prisma/client'

function hufAmt(r: RecurringRule, rates = { usd: 358.4, eur: 396.1 }) {
  const amt = Number(r.amount)
  if (r.currency === 'USD') return amt * rates.usd
  if (r.currency === 'EUR') return amt * rates.eur
  return amt
}

export default async function RecurringPage() {
  const [rules, categories] = await Promise.all([getRecurringRules(), getCategories()])

  const expenseRules = rules.filter((r) => r.kind === 'EXPENSE')
  const incomeRules  = rules.filter((r) => r.kind === 'INCOME')

  const monthlyTotal = expenseRules
    .filter((r) => r.cycle === 'MONTHLY')
    .reduce((s, r) => s + hufAmt(r), 0)

  const annualTotal = expenseRules
    .filter((r) => r.cycle === 'ANNUAL')
    .reduce((s, r) => s + hufAmt(r), 0)

  const incomeMonthly = incomeRules
    .filter((r) => r.cycle === 'MONTHLY')
    .reduce((s, r) => s + hufAmt(r), 0)

  return (
    <RecurringView
      rules={rules}
      categories={categories}
      monthlyTotal={monthlyTotal}
      annualTotal={annualTotal}
      incomeMonthly={incomeMonthly}
    />
  )
}
