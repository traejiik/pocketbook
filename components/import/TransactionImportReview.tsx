'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { commitTransactionImport, type ImportCategory } from '@/server-actions/import'
import { createCategoryFromImport } from '@/server-actions/categories'
import type { ImportResult, PreviewRow } from '@/lib/import-transactions'
import { fmtCur, fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CategoryResolver, ImportNotices, type CategoryGap, type Kind } from './CategoryResolver'
import { ImportReviewSheet, ReviewDisclosure, ReviewGroupHeading, ReviewSummary } from './ImportReviewSheet'

type Currency = 'HUF' | 'USD' | 'EUR' | 'GBP'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  filename: string
  rows: PreviewRow[]
  categories: ImportCategory[]
  onImported: (result: ImportResult) => void
}

type Choice = { include: boolean; categoryId: string | null }

const TONE = { INCOME: 'text-income', EXPENSE: 'text-expense', SAVINGS: 'text-savings' } as const

export function TransactionImportReview({ open, onOpenChange, filename, rows, categories: initialCategories, onImported }: Props) {
  // Categories created from this sheet join the list every row can pick from.
  const [categories, setCategories] = useState(initialCategories)
  const [creating, setCreating] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<number, Choice>>(() =>
    Object.fromEntries(rows.filter((r) => r.status === 'new').map((r) => [r.line, { include: r.categoryId !== null, categoryId: r.categoryId }])),
  )
  const [isPending, startTransition] = useTransition()

  const groups = useMemo(() => ({
    new: rows.filter((r) => r.status === 'new'),
    duplicate: rows.filter((r) => r.status === 'duplicate'),
    error: rows.filter((r) => r.status === 'error'),
  }), [rows])
  const counts = { new: groups.new.length, duplicate: groups.duplicate.length, error: groups.error.length }
  const selected = groups.new.filter((r) => choices[r.line]?.include && choices[r.line]?.categoryId)
  const ready = groups.new.filter((r) => choices[r.line]?.categoryId)
  const allOn = selected.length === ready.length && selected.length > 0

  // One entry per unresolved category, in the order the file first needs it: a
  // file repeats the same unknown name on every row that uses it.
  const gaps = useMemo<CategoryGap[]>(() => {
    const byKey = new Map<string, CategoryGap>()
    for (const row of groups.new) {
      if (choices[row.line]?.categoryId || !row.type) continue
      const key = `${row.type}|${row.unmatchedCategory?.trim().toLowerCase() ?? ''}`
      const existing = byKey.get(key)
      if (existing) existing.lines.push(row.line)
      else byKey.set(key, { key, name: row.unmatchedCategory, kind: row.type as Kind, lines: [row.line] })
    }
    return [...byKey.values()]
  }, [groups.new, choices])

  // Warnings that are not decisions: the import proceeds, just without the link.
  const notices = useMemo(() => {
    const names = new Set(groups.new.filter((r) => r.recurringRuleName && !r.recurringRuleId).map((r) => r.recurringRuleName!))
    if (names.size === 0) return []
    return [`No recurring rule named ${[...names].map((n) => `"${n}"`).join(', ')}. Those transactions import without a link.`]
  }, [groups.new])

  function assign(lines: number[], categoryId: string) {
    setChoices((current) => {
      const next = { ...current }
      for (const line of lines) next[line] = { include: true, categoryId }
      return next
    })
  }

  function createForGap(gap: CategoryGap) {
    if (!gap.name) return
    setCreating(gap.key)
    startTransition(async () => {
      const result = await createCategoryFromImport(gap.name!, gap.kind)
      setCreating(null)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setCategories((list) => (list.some((c) => c.id === result.id) ? list : [...list, result].sort((a, b) => a.name.localeCompare(b.name))))
      assign(gap.lines, result.id)
      toast.success(`Created ${result.name}.`)
    })
  }

  function toggleAll() {
    setChoices((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { ...v, include: !allOn && v.categoryId !== null }])))
  }

  function commit() {
    const payload = selected.map((r) => ({
      date: r.date, description: r.description, amount: r.amount, currency: r.currency,
      type: r.type, categoryId: choices[r.line].categoryId, recurringRuleId: r.recurringRuleId,
    }))
    startTransition(async () => {
      const result = await commitTransactionImport(payload)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      onImported(result)
    })
  }

  return (
    <ImportReviewSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Review transaction import"
      filename={filename}
      summary={<ReviewSummary counts={counts} ready={{ done: ready.length, total: groups.new.length }} />}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={commit} disabled={isPending || selected.length === 0}>
            {isPending ? 'Importing' : `Import ${selected.length} transaction${selected.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <CategoryResolver
        gaps={gaps}
        categories={categories}
        creating={creating}
        disabled={isPending}
        onPick={(gap, categoryId) => assign(gap.lines, categoryId)}
        onCreate={createForGap}
        noun="transaction"
      />
      <ImportNotices notices={notices} />

      {groups.new.length > 0 && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <ReviewGroupHeading label="New" count={groups.new.length} />
            <button
              type="button"
              onClick={toggleAll}
              disabled={ready.length === 0}
              className="shrink-0 pt-4 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:underline"
            >
              {allOn ? 'Select none' : 'Select all'}
            </button>
          </div>
          {/* Every row is the same shape at every width: one line from md, two on
              phones. Nothing per-row can grow it, which keeps the list scannable. */}
          <ul className="calm-card divide-y divide-border/40 overflow-hidden">
            {groups.new.map((r) => {
              const choice = choices[r.line]
              const kindCategories = categories.filter((c) => c.kind === r.type)
              const cat = kindCategories.find((c) => c.id === choice?.categoryId)
              return (
                <li
                  key={r.line}
                  className={cn(
                    'grid grid-cols-[20px_minmax(0,1fr)_auto] md:grid-cols-[20px_72px_minmax(0,1fr)_190px_112px] items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-opacity',
                    !choice?.include && 'opacity-55',
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Import ${r.description}`}
                    checked={!!choice?.include}
                    disabled={!choice?.categoryId}
                    onChange={(e) => setChoices((c) => ({ ...c, [r.line]: { ...c[r.line], include: e.target.checked } }))}
                    className="size-4 accent-primary"
                  />
                  <span className="hidden md:block text-[12px] text-muted-foreground tabular">{fmtDate(r.date, { short: true })}</span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">{r.description}</div>
                    <div className="md:hidden text-[11px] text-muted-foreground tabular">{fmtDate(r.date)}</div>
                  </div>
                  <span className={cn('md:order-last text-right text-[13px] tabular', r.type ? TONE[r.type] : '')}>
                    {fmtCur(r.amount, r.currency as Currency)}
                  </span>
                  <div className="col-span-2 col-start-2 md:col-span-1 md:col-start-auto min-w-0">
                    <Select
                      value={choice?.categoryId ?? ''}
                      onValueChange={(v) => v && setChoices((c) => ({ ...c, [r.line]: { include: true, categoryId: v } }))}
                    >
                      <SelectTrigger
                        aria-label={`Category for ${r.description}`}
                        className={cn('h-9! md:h-8! w-full text-[12px]', !choice?.categoryId && 'border-warning/60 text-warning')}
                      >
                        <SelectValue>{cat ? cat.name : 'Needs a category'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {kindCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {groups.duplicate.length > 0 && (
        <ReviewDisclosure label="Duplicates — skipped" count={groups.duplicate.length}>
          <ul className="calm-card divide-y divide-border/40 overflow-hidden">
            {groups.duplicate.map((r) => (
              <li key={r.line} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 text-[12.5px] text-muted-foreground">
                <span className="truncate">{fmtDate(r.date, { short: true })} · {r.description}</span>
                <span className="tabular">{fmtCur(r.amount, r.currency as Currency)}</span>
                <span className="col-span-2 text-[11px] truncate">{r.messages[0]}</span>
              </li>
            ))}
          </ul>
        </ReviewDisclosure>
      )}

      {groups.error.length > 0 && (
        <ReviewDisclosure label="Errors — can't import" count={groups.error.length} tone="destructive">
          <ul className="calm-card divide-y divide-border/40 overflow-hidden">
            {groups.error.map((r) => (
              <li key={r.line} className="px-3 py-2 text-[12.5px]">
                <span className="mono text-[11px] text-muted-foreground mr-2">Line {r.line}</span>
                <span className="text-destructive">{r.messages.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </ReviewDisclosure>
      )}

      {rows.length > 0 && groups.new.length === 0 && (
        <p className="pt-6 text-center text-[13px] text-muted-foreground">Nothing new to import in this file.</p>
      )}
    </ImportReviewSheet>
  )
}
