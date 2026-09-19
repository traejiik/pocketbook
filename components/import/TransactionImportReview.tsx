'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { commitTransactionImport, type ImportCategory } from '@/server-actions/import'
import { createCategoryFromImport } from '@/server-actions/categories'
import { Plus } from 'lucide-react'
import type { ImportResult, PreviewRow } from '@/lib/import-transactions'
import { fmtCur, fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ImportReviewSheet, ReviewGroupHeading, ReviewSummary } from './ImportReviewSheet'

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

/** Hints the category picker itself resolves, so they disappear once one is chosen. */
const CATEGORY_HINT = /pick one( or create it)?$/

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
  const allOn = selected.length === groups.new.filter((r) => choices[r.line]?.categoryId).length && selected.length > 0

  function setChoice(line: number, patch: Partial<Choice>) {
    setChoices((c) => ({ ...c, [line]: { ...c[line], ...patch } }))
  }

  /** Adopt the file's category name, then assign it to every row that used it. */
  function createCategory(name: string, kind: 'INCOME' | 'EXPENSE' | 'SAVINGS') {
    setCreating(`${kind}|${name.toLowerCase()}`)
    startTransition(async () => {
      const result = await createCategoryFromImport(name, kind)
      setCreating(null)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setCategories((list) => (list.some((c) => c.id === result.id) ? list : [...list, result].sort((a, b) => a.name.localeCompare(b.name))))
      setChoices((current) => {
        const next = { ...current }
        for (const row of rows) {
          if (row.type === kind && row.unmatchedCategory?.trim().toLowerCase() === name.trim().toLowerCase() && next[row.line]) {
            next[row.line] = { include: true, categoryId: result.id }
          }
        }
        return next
      })
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
      summary={<ReviewSummary counts={counts} noun="transaction" />}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={commit} disabled={isPending || selected.length === 0}>
            {isPending ? 'Importing' : `Import ${selected.length} transaction${selected.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      {groups.new.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <ReviewGroupHeading label="New" count={groups.new.length} />
            <button type="button" onClick={toggleAll} className="text-[12px] text-muted-foreground hover:text-foreground pt-2 pl-3 focus-visible:outline-none focus-visible:underline">
              {allOn ? 'Select none' : 'Select all'}
            </button>
          </div>
          <ul className="calm-card divide-y divide-border/40 overflow-hidden">
            {groups.new.map((r) => {
              const choice = choices[r.line]
              const kindCategories = categories.filter((c) => c.kind === r.type)
              const cat = kindCategories.find((c) => c.id === choice?.categoryId)
              return (
                <li key={r.line} className={cn('px-3 py-2.5 transition-opacity', !choice?.include && 'opacity-60')}>
                  <div className="grid grid-cols-[20px_1fr_auto] md:grid-cols-[20px_84px_1fr_170px_130px] items-center gap-x-3 gap-y-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Import ${r.description}`}
                      checked={!!choice?.include}
                      disabled={!choice?.categoryId}
                      onChange={(e) => setChoice(r.line, { include: e.target.checked })}
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
                    <div className="col-span-2 col-start-2 md:col-span-1 md:col-start-auto flex items-center gap-1.5">
                      <Select
                        value={choice?.categoryId ?? ''}
                        onValueChange={(v) => v && setChoice(r.line, { categoryId: v, include: true })}
                      >
                        <SelectTrigger aria-label={`Category for ${r.description}`} className={cn('h-8! flex-1 min-w-0 text-[12px]', !choice?.categoryId && 'border-warning/60')}>
                          <SelectValue>{cat ? cat.name : 'Pick a category'}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {kindCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!choice?.categoryId && r.unmatchedCategory && r.type && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-[12px]"
                          disabled={isPending}
                          title={`Create the ${r.type.toLowerCase()} category "${r.unmatchedCategory}"`}
                          onClick={() => createCategory(r.unmatchedCategory!, r.type!)}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          {creating === `${r.type}|${r.unmatchedCategory.toLowerCase()}` ? 'Creating' : 'Create'}
                        </Button>
                      )}
                    </div>
                  </div>
                  {(() => {
                    // Category hints end in "pick one" / "pick one or create it";
                    // once a category is chosen they are resolved.
                    const shown = choice?.categoryId ? r.messages.filter((m) => !CATEGORY_HINT.test(m)) : r.messages
                    return shown.length > 0 && (
                      <p className="mt-1.5 ml-8 text-[11.5px] text-warning">{shown.join(' · ')}</p>
                    )
                  })()}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {groups.duplicate.length > 0 && (
        <details className="group">
          <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
            <ReviewGroupHeading label="Duplicates — skipped" count={groups.duplicate.length} />
          </summary>
          <ul className="calm-card divide-y divide-border/40 overflow-hidden">
            {groups.duplicate.map((r) => (
              <li key={r.line} className="px-3 py-2 grid grid-cols-[1fr_auto] gap-x-3 text-[12.5px] text-muted-foreground">
                <span className="truncate">{fmtDate(r.date, { short: true })} · {r.description}</span>
                <span className="tabular">{fmtCur(r.amount, r.currency as Currency)}</span>
                <span className="col-span-2 text-[11px]">{r.messages[0]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {groups.error.length > 0 && (
        <>
          <ReviewGroupHeading label="Errors — can't import" count={groups.error.length} />
          <ul className="calm-card divide-y divide-border/40 overflow-hidden">
            {groups.error.map((r) => (
              <li key={r.line} className="px-3 py-2 text-[12.5px]">
                <span className="mono text-[11px] text-muted-foreground mr-2">Line {r.line}</span>
                <span className="text-destructive">{r.messages.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {rows.length > 0 && groups.new.length === 0 && (
        <p className="pt-6 text-center text-[13px] text-muted-foreground">Nothing new to import in this file.</p>
      )}
    </ImportReviewSheet>
  )
}
