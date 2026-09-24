'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  DEFAULT_BACKFILL_MONTHS,
  MAX_BACKFILL_MONTHS,
  planRecurringCatchUp,
} from '@/lib/recurring-backfill'
import { commitRecurringImport, type ImportCategory } from '@/server-actions/import'
import { createCategoryFromImport } from '@/server-actions/categories'
import { CategoryResolver, type CategoryGap, type Kind } from './CategoryResolver'
import type { RecurringPreviewRow } from '@/lib/import-recurring'
import { fmtCur, fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ImportOutcome } from './CsvImportRow'
import { ImportReviewSheet, ReviewDisclosure, ReviewGroupHeading, ReviewSummary } from './ImportReviewSheet'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  filename: string
  rows: RecurringPreviewRow[]
  categories: ImportCategory[]
  onImported: (result: ImportOutcome) => void
}

type Choice = { include: boolean; categoryId: string | null }

const TONE = { INCOME: 'text-income', EXPENSE: 'text-expense', SAVINGS: 'text-savings' } as const

/** Compact catch-up summary for a rule row's meta line. */
function backfillNote(b: NonNullable<RecurringPreviewRow['backfill']>): string {
  if (b.count === 0) return `next due ${fmtDate(b.nextDue, { short: true })}`
  const span = b.count === 1 ? fmtDate(b.from!, { short: true }) : `${fmtDate(b.from!, { short: true })}–${fmtDate(b.to!, { short: true })}`
  return `logs ${b.count} past charge${b.count === 1 ? '' : 's'} (${span}) · next due ${fmtDate(b.nextDue, { short: true })}`
}

export function RecurringImportReview({ open, onOpenChange, filename, rows, categories: initialCategories, onImported }: Props) {
  const [categories, setCategories] = useState(initialCategories)
  const [creating, setCreating] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<number, Choice>>(() =>
    Object.fromEntries(rows.filter((r) => r.status === 'new').map((r) => [r.line, { include: r.rule?.categoryId != null, categoryId: r.rule?.categoryId ?? null }])),
  )
  const [backfill, setBackfill] = useState(true)
  const [backfillMonths, setBackfillMonths] = useState(String(DEFAULT_BACKFILL_MONTHS))
  const [isPending, startTransition] = useTransition()

  // The planner is pure, so the sheet re-plans every row as the controls change
  // and shows exactly what committing would log.
  const months = Math.min(Math.max(Number(backfillMonths) || 0, 1), MAX_BACKFILL_MONTHS)
  const planFor = (r: RecurringPreviewRow) => {
    if (!r.rule) return r.backfill
    const plan = planRecurringCatchUp({
      ...r.rule,
      categoryId: r.rule.categoryId ?? 'preview',
      installmentPaid: r.rule.hasInstallment ? r.rule.installmentPaid ?? 0 : null,
      installmentTotal: r.rule.hasInstallment ? r.rule.installmentTotal ?? null : null,
      backfill,
      backfillMonths: months,
    })
    return {
      count: plan.transactions.length,
      from: plan.transactions[0]?.date ?? null,
      to: plan.transactions.at(-1)?.date ?? null,
      nextDue: plan.nextDue,
    }
  }

  const groups = useMemo(() => ({
    new: rows.filter((r) => r.status === 'new'),
    duplicate: rows.filter((r) => r.status === 'duplicate'),
    error: rows.filter((r) => r.status === 'error'),
  }), [rows])
  const counts = { new: groups.new.length, duplicate: groups.duplicate.length, error: groups.error.length }
  const selected = groups.new.filter((r) => choices[r.line]?.include && choices[r.line]?.categoryId)
  const ready = groups.new.filter((r) => choices[r.line]?.categoryId)
  const backfillTotal = selected.reduce((n, r) => n + (planFor(r)?.count ?? 0), 0)

  // One entry per unresolved category, resolved for every rule that needs it.
  const gaps = useMemo<CategoryGap[]>(() => {
    const byKey = new Map<string, CategoryGap>()
    for (const row of groups.new) {
      if (choices[row.line]?.categoryId || !row.rule) continue
      const key = `${row.rule.kind}|${row.unmatchedCategory?.trim().toLowerCase() ?? ''}`
      const existing = byKey.get(key)
      if (existing) existing.lines.push(row.line)
      else byKey.set(key, { key, name: row.unmatchedCategory, kind: row.rule.kind as Kind, lines: [row.line] })
    }
    return [...byKey.values()]
  }, [groups.new, choices])

  function setChoice(line: number, patch: Partial<Choice>) {
    setChoices((c) => ({ ...c, [line]: { ...c[line], ...patch } }))
  }

  function assign(lines: number[], categoryId: string) {
    setChoices((current) => {
      const next = { ...current }
      for (const line of lines) next[line] = { include: true, categoryId }
      return next
    })
  }

  /** Adopt the file's category name, then assign it to every rule that used it. */
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

  function commit() {
    const payload = selected.map((r) => ({
      ...r.rule!,
      categoryId: choices[r.line].categoryId,
      backfill,
      backfillMonths: months,
    }))
    startTransition(async () => {
      const result = await commitRecurringImport(payload)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      if (result.backfilled > 0) toast.success(`Logged ${result.backfilled} past charge${result.backfilled === 1 ? '' : 's'}.`)
      onImported(result)
    })
  }

  return (
    <ImportReviewSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Review recurring import"
      filename={filename}
      summary={
        <div className="space-y-1">
          <ReviewSummary counts={counts} ready={{ done: ready.length, total: groups.new.length }} />
          {groups.new.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
              <div className="flex items-center gap-2">
                <Switch id="import-backfill" size="sm" checked={backfill} onCheckedChange={setBackfill} />
                <Label htmlFor="import-backfill" className="text-[12px] font-normal text-muted-foreground">Log past charges</Label>
              </div>
              {backfill && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="import-backfill-months" className="text-[12px] font-normal text-muted-foreground">Months back</Label>
                  <Input
                    id="import-backfill-months"
                    type="number"
                    min={1}
                    max={MAX_BACKFILL_MONTHS}
                    value={backfillMonths}
                    onChange={(e) => setBackfillMonths(e.target.value)}
                    className="h-8! w-16 tabular"
                  />
                </div>
              )}
            </div>
          )}
          <p className="text-[11.5px] text-muted-foreground">
            {backfillTotal > 0
              ? <>Importing the selected rules also logs <span className="tabular text-foreground">{backfillTotal}</span> past charge{backfillTotal === 1 ? '' : 's'} to your ledger.</>
              : 'No past charges will be logged.'}
          </p>
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={commit} disabled={isPending || selected.length === 0}>
            {isPending ? 'Importing' : `Import ${selected.length} rule${selected.length === 1 ? '' : 's'}`}
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
        noun="rule"
      />

      {groups.new.length > 0 && (
        <>
          <ReviewGroupHeading label="New" count={groups.new.length} />
          <ul className="calm-card divide-y divide-border/40 overflow-hidden">
            {groups.new.map((r) => {
              const rule = r.rule!
              const choice = choices[r.line]
              const kindCategories = categories.filter((c) => c.kind === rule.kind)
              const cat = kindCategories.find((c) => c.id === choice?.categoryId)
              return (
                <li
                  key={r.line}
                  className={cn(
                    'grid grid-cols-[20px_minmax(0,1fr)_auto] md:grid-cols-[20px_minmax(0,1fr)_190px_112px] items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-opacity',
                    !choice?.include && 'opacity-55',
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Import ${rule.name}`}
                    checked={!!choice?.include}
                    disabled={!choice?.categoryId}
                    onChange={(e) => setChoice(r.line, { include: e.target.checked })}
                    className="size-4 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">{rule.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate tabular">
                      {rule.cycle === 'MONTHLY' ? 'Monthly' : 'Annual'}
                      {rule.hasInstallment && rule.installmentTotal != null && <> · {rule.installmentPaid ?? 0}/{rule.installmentTotal} paid</>}
                      {planFor(r) && <> · {backfillNote(planFor(r)!)}</>}
                    </div>
                  </div>
                  <span className={cn('md:order-last text-right text-[13px] tabular', TONE[rule.kind])}>
                    {fmtCur(rule.kind === 'INCOME' ? rule.amount : -rule.amount, rule.currency)}
                  </span>
                  <div className="col-span-2 col-start-2 md:col-span-1 md:col-start-auto min-w-0">
                    <Select value={choice?.categoryId ?? ''} onValueChange={(v) => v && setChoice(r.line, { categoryId: v, include: true })}>
                      <SelectTrigger
                        aria-label={`Category for ${rule.name}`}
                        className={cn('h-9! md:h-8! w-full text-[12px]', !choice?.categoryId && 'border-warning/60 text-warning')}
                      >
                        <SelectValue>{cat ? cat.name : 'Needs a category'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {kindCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
              <li key={r.line} className="px-3 py-2 text-[12.5px] text-muted-foreground">
                <span className="text-foreground/80">{r.rule?.name}</span> · {r.messages[0]}
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
