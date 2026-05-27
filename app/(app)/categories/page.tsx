export const dynamic = 'force-dynamic'

import { getCategoriesWithStats, getAnchorCurrency } from '@/lib/aggregations'
import { CategoriesView } from './CategoriesView'

export default async function CategoriesPage() {
  const [categories, anchorCurrency] = await Promise.all([
    getCategoriesWithStats(),
    getAnchorCurrency(),
  ])

  return (
    <CategoriesView
      anchorCurrency={anchorCurrency}
      categories={categories.map((c: (typeof categories)[number]) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        kind: c.kind as 'INCOME' | 'EXPENSE' | 'SAVINGS',
        txCount: c.txCount,
        txTotalHUF: c.txTotalHUF,
      }))}
    />
  )
}
