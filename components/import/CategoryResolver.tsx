'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ImportCategory } from '@/server-actions/import'
import { cn } from '@/lib/utils'

export type Kind = 'INCOME' | 'EXPENSE' | 'SAVINGS'

/** One decision: every row in the file that carried this category name (or none). */
export type CategoryGap = {
  key: string
  /** The name the file used, or null when the rows carried no category at all. */
  name: string | null
  kind: Kind
  /** Lines of the rows waiting on this decision. */
  lines: number[]
}

const KIND_LABEL: Record<Kind, string> = { INCOME: 'income', EXPENSE: 'expense', SAVINGS: 'savings' }

/**
 * Unresolved categories, gathered above the list as one decision each.
 *
 * A file repeats the same unknown category on every row that uses it, so
 * resolving per row meant reading the same sentence and pressing the same button
 * many times, and made every row a different height. Resolving by name instead
 * keeps the list itself uniform and scannable.
 */
export function CategoryResolver({
  gaps,
  categories,
  creating,
  disabled,
  onPick,
  onCreate,
  noun,
}: {
  gaps: CategoryGap[]
  categories: ImportCategory[]
  /** The gap key currently being created, for the button's pending label. */
  creating: string | null
  disabled: boolean
  onPick: (gap: CategoryGap, categoryId: string) => void
  onCreate: (gap: CategoryGap) => void
  noun: string
}) {
  if (gaps.length === 0) return null

  return (
    <section aria-labelledby="import-resolve-heading" className="pt-4">
      <div className="flex items-baseline gap-2 pb-2">
        <h3 id="import-resolve-heading" className="text-[11px] mono uppercase tracking-[0.12em] text-warning font-medium">
          Needs a category
        </h3>
        <span className="mono text-[11px] text-muted-foreground">{gaps.length}</span>
        <div className="flex-1 h-px bg-border ml-1" />
      </div>
      <p className="text-[11.5px] text-muted-foreground pb-2.5">
        Each choice applies to every {noun} in the file that used that name.
      </p>

      <ul className="calm-card divide-y divide-border/40 overflow-hidden">
        {gaps.map((gap) => {
          const kindCategories = categories.filter((c) => c.kind === gap.kind)
          return (
            <li key={gap.key} className="px-3 py-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate">
                  {gap.name ?? <span className="text-muted-foreground">No category in the file</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {KIND_LABEL[gap.kind]} · <span className="tabular">{gap.lines.length}</span> {noun}{gap.lines.length === 1 ? '' : 's'}
                </div>
              </div>
              {/* A fixed grid, not a flex row: every picker lines up whether or not
                  its gap can be created (a name from the file can, a missing one can't). */}
              <div className="grid grid-cols-[minmax(0,1fr)_92px] sm:grid-cols-[190px_92px] items-center gap-2">
                <Select value="" onValueChange={(v) => v && onPick(gap, v)}>
                  <SelectTrigger
                    aria-label={gap.name ? `Category for ${gap.name}` : `Category for ${KIND_LABEL[gap.kind]} rows with none`}
                    className="h-11! md:h-10! min-[1025px]:h-9! w-full text-[12.5px] border-warning/60 text-warning"
                  >
                    <SelectValue>Pick a category</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {kindCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {gap.name ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 md:h-10 min-[1025px]:h-9 w-full px-2 text-[12.5px]"
                    disabled={disabled}
                    onClick={() => onCreate(gap)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    {creating === gap.key ? 'Creating' : 'Create'}
                  </Button>
                ) : (
                  <span aria-hidden />
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Warnings that are not decisions (an unknown rule name), summarised once. */
export function ImportNotices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null
  return (
    <ul className={cn('pt-3 space-y-1 text-[11.5px] text-muted-foreground')}>
      {notices.map((n) => <li key={n}>{n}</li>)}
    </ul>
  )
}
