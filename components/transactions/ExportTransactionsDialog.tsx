'use client'

import { useState, useTransition } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { DatePicker } from '@/components/ui/date-picker'
import { exportTransactionsCsv, type ExportRange } from '@/server-actions/export'
import { monthKeyOf, todayIso } from '@/lib/format'

type Scope = 'month' | 'range' | 'all'

/** First and last day of a `YYYY-MM` month as `YYYY-MM-DD`. */
function monthBounds(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(last).padStart(2, '0')}` }
}

/** The month the Transactions page is showing (`?month=`), else the viewer's current month. */
function viewedMonth(): string {
  const param = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('month')
  return param && /^\d{4}-\d{2}$/.test(param) ? param : monthKeyOf(new Date())
}

function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function ExportTransactionsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<Scope>('month')
  const [month, setMonth] = useState(() => monthKeyOf(new Date()))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [isPending, startTransition] = useTransition()

  function openDialog() {
    const m = viewedMonth()
    const bounds = monthBounds(m)
    setMonth(m)
    setFrom(bounds.from)
    setTo(bounds.to < todayIso() ? bounds.to : todayIso())
    setScope('month')
    setOpen(true)
  }

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const rangeInvalid = scope === 'range' && (!from || !to || from > to)

  function submit() {
    const range: ExportRange = scope === 'all' ? { all: true } : scope === 'month' ? monthBounds(month) : { from, to }
    startTransition(async () => {
      const result = await exportTransactionsCsv(range)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      if (result.count === 0) {
        toast.message('No transactions in that range.')
        return
      }
      download(result.filename, result.csv)
      toast.success(`Exported ${result.count} transaction${result.count === 1 ? '' : 's'}.`)
      setOpen(false)
    })
  }

  return (
    <>
      <button type="button" onClick={openDialog} className={className}>
        <Download className="w-3.5 h-3.5" />
        Export CSV
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export transactions</DialogTitle>
            <DialogDescription>
              A CSV in the import format, so it opens in a spreadsheet and re-imports as duplicates.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-2 space-y-4">
            <Segmented<Scope>
              fullWidth
              value={scope}
              onChange={setScope}
              options={[
                { label: 'This month', value: 'month' },
                { label: 'Date range', value: 'range' },
                { label: 'All time', value: 'all' },
              ]}
            />
            {scope === 'month' && (
              <p className="text-[12.5px] text-muted-foreground">Every transaction in <span className="text-foreground">{monthLabel}</span>.</p>
            )}
            {scope === 'range' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="export-from">From</Label>
                  <DatePicker id="export-from" value={from} onChange={setFrom} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="export-to">To</Label>
                  <DatePicker id="export-to" value={to} onChange={setTo} aria-invalid={rangeInvalid} />
                </div>
                {rangeInvalid && from && to && (
                  <p className="col-span-2 text-[12px] text-destructive">The start date must be on or before the end date.</p>
                )}
              </div>
            )}
            {scope === 'all' && (
              <p className="text-[12.5px] text-muted-foreground">Your whole ledger, oldest first.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={isPending || rangeInvalid}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              {isPending ? 'Preparing' : 'Download CSV'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
