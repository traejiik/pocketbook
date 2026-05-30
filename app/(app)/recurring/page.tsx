export const dynamic = 'force-dynamic'

import { getRecurringRules, getArchivedRecurringRules, getCategories, getRecurringBudgetSummary, getAnchorCurrency } from '@/lib/aggregations'
import { RecurringView, type SerialisedRule } from './RecurringView'
import { buildRecurringRuleViewModels } from '@/lib/recurring-view-model'

export default async function RecurringPage() {
  const [rules, archived, categories, budget, anchorCurrency] = await Promise.all([
    getRecurringRules(),
    getArchivedRecurringRules(),
    getCategories(),
    getRecurringBudgetSummary(),
    getAnchorCurrency(),
  ])

  const [serialisedRules, archivedRules]: [SerialisedRule[], SerialisedRule[]] = await Promise.all([
    buildRecurringRuleViewModels(rules, anchorCurrency),
    buildRecurringRuleViewModels(archived, anchorCurrency),
  ])

  return (
    <RecurringView
      rules={serialisedRules}
      archivedRules={archivedRules}
      categories={categories}
      budget={budget}
      anchorCurrency={anchorCurrency}
    />
  )
}
