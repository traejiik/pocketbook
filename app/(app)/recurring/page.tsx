export const dynamic = 'force-dynamic'

import { getRecurringRules, getCategories, getRecurringBudgetSummary, getAnchorCurrency } from '@/lib/aggregations'
import { RecurringView, type SerialisedRule } from './RecurringView'
import { buildRecurringRuleViewModels } from '@/lib/recurring-view-model'

export default async function RecurringPage() {
  const [rules, categories, budget, anchorCurrency] = await Promise.all([
    getRecurringRules(),
    getCategories(),
    getRecurringBudgetSummary(),
    getAnchorCurrency(),
  ])

  const serialisedRules: SerialisedRule[] = await buildRecurringRuleViewModels(rules, anchorCurrency)

  return (
    <RecurringView
      rules={serialisedRules}
      categories={categories}
      budget={budget}
      anchorCurrency={anchorCurrency}
    />
  )
}
