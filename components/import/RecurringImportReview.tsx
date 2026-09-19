'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { commitRecurringImport, type ImportCategory } from '@/server-actions/import'
import type { RecurringPreviewRow } from '@/lib/import-recurring'
import { fmtCur, fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ImportOutcome } from './CsvImportRow'
import { ImportReviewSheet, ReviewGroupHeading, ReviewSummary } from './ImportReviewSheet'

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

function backfillNote(b: NonNullable<RecurringPreviewRow['backfill']>): string {
  const next = `next due ${fmtDate(b.nextDue)}`
  if (b.count === 0) return `No past charges · ${next}`
  const span = b.count === 1 ? fmtDate(b.from!, { short: true }) : `${fmtDate(b.from!, { short: true })} – ${fmtDate(b.to!, { short: true })}`
  return `Logs ${b.count} past charge${b.count === 1 ? '' : 's'} (${span}) · ${next}`
}

export function RecurringImportReview({ open, onOpenChange, filename, rows, categories, onImported }: Props) {
  const [choices, setChoices] = useState<Record<number, Choice>>(() =>
    Object.fromEntries(rows.filter((r) => r.status === 'new').map((r) => [r.line, { include: r.rule?.categoryId != null, categoryId: r.rule?.categoryId ?? null }])),
  )
  const [isPending, startTransition] = useTransition()

  const groups = useMemo(() => ({
    new: rows.filter((r) => r.status === 'new'),
    duplicate: rows.filter((r) => r.status === 'duplicate'),
    error: rows.filter((r) => r.status === 'error'),
  }), [rows])
  const counts = { new: groups.new.length, duplicate: groups.duplicate.length, error: groups.error.length }
  const selected = groups.new.filter((r) => choices[r.line]?.include && choices[r.line]?.categoryId)
  const backfillTotal = selected.reduce((n, r) => n + (r.backfill?.count ?? 0), 0)

  function setChoice(line: number, patch: Partial<Choice>) {
    setChoices((c) => ({ ...c, [line]: { ...c[line], ...patch } }))
  }

  function commit() {
    const payload = selected.map((r) => ({ ...r.rule!, categoryId: choices[r.line].categoryId }))
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
          <ReviewSummary counts={counts} noun="rule" />
          {backfillTotal > 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              Importing the selected rules also logs <span className="tabular text-foreground">{backfillTotal}</span> past charge{backfillTotal === 1 ? '' : 's'} to your ledger.
            </p>
          )}
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
      {groups.new.length > 0 && (
        <>
          <ReviewGroupHeading label="New" count={groups.new.length} />
          <ul className="calm-card divide-y divide-border/40 overflow-hidden">
            {groups.new.map((r) => {
              const rule = r.rule!
              const choice = choices[r.line]
              const kindCategories = categories.filter((c) => c.kind === rule.kind)
              const cat = kindCategories.find((c) => c.id === choice?.categoryId)
              const shown = choice?.categoryId ? r.messages.filter((m) => !m.endsWith('pick one')) : r.messages
              return (
                <li key={r.line} className={cn('px-3 py-2.5 transition-opacity', !choice?.include && 'opacity-60')}>
                  <div className="grid grid-cols-[20px_1fr_auto] md:grid-cols-[20px_1fr_170px_130px] items-center gap-x-3 gap-y-1.5">
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
                      <div className="text-[11px] text-muted-foreground">
                        {rule.cycle === 'MONTHLY' ? 'Monthly' : 'Annual'}
                        {rule.hasInstallment && rule.installmentTotal != null && <> · <span className="tabular">{rule.installmentPaid ?? 0}/{rule.installmentTotal}</span> paid</>}
                      </div>
                    </div>
                    <span className={cn('md:order-last text-right text-[13px] tabular', TONE[rule.kind])}>
                      {fmtCur(rule.kind === 'INCOME' ? rule.amount : -rule.amount, rule.currency)}
                    </span>
                    <div className="col-span-2 col-start-2 md:col-span-1 md:col-start-auto">
                      <Select value={choice?.categoryId ?? ''} onValueChange={(v) => v && setChoice(r.line, { categoryId: v, include: true })}>
                        <SelectTrigger aria-label={`Category for ${rule.name}`} className={cn('h-8! w-full text-[12px]', !choice?.categoryId && 'border-warning/60')}>
                          <SelectValue>{cat ? cat.name : 'Pick a category'}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {kindCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {r.backfill && <p className="mt-1.5 ml-8 text-[11.5px] text-muted-foreground tabular">{backfillNote(r.backfill)}</p>}
                  {shown.length > 0 && <p className="mt-1 ml-8 text-[11.5px] text-warning">{shown.join(' · ')}</p>}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {groups.duplicate.length > 0 && (
        <>
          <ReviewGroupHeading label="Duplicates — skipped" count={groups.duplicate.length} />
          <ul className="calm-card divide-y divide-border/40 overflow-hidden">
            {groups.duplicate.map((r) => (
              <li key={r.line} className="px-3 py-2 text-[12.5px] text-muted-foreground">
                <span className="text-foreground/80">{r.rule?.name}</span> · {r.messages[0]}
              </li>
            ))}
          </ul>
        </>
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
