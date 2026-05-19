import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface CategoryBadgeProps {
  id: string
  className?: string
}

export async function CategoryBadge({ id, className }: CategoryBadgeProps) {
  const category = await prisma.category.findUnique({ where: { id } })
  if (!category) return null

  return (
    <Badge color={category.color} className={cn(className)}>
      {category.name}
    </Badge>
  )
}
