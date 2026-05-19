import { getCategoriesWithStats } from '@/lib/aggregations'
import { CategoriesView } from './CategoriesView'

export default async function CategoriesPage() {
  const categories = await getCategoriesWithStats()

  return (
    <CategoriesView
      categories={categories.map((c) => ({
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
