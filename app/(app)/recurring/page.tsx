export const dynamic = 'force-dynamic'

import { getRecurringRules, getCategories, getRecurringBudgetSummary, getAnchorCurrency } from '@/lib/aggregations'
import { RecurringView, type SerialisedRule } from './RecurringView'

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

export default async function RecurringPage() {
  const [rules, categories, budget, anchorCurrency] = await Promise.all([
    getRecurringRules(),
    getCategories(),
    getRecurringBudgetSummary(),
    getAnchorCurrency(),
  ])

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

  return (
    <RecurringView
      rules={serialisedRules}
      categories={categories}
      budget={budget}
      anchorCurrency={anchorCurrency}
    />
  )
}
