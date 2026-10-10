'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowDown, ChevronDown, ChevronRight, PiggyBank, Plus, TriangleAlert } from 'lucide-react'

import { CalmCard } from '@/components/finance/CalmCard'
import { Button, buttonVariants } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Segmented } from '@/components/ui/segmented'
import { useTransactionSheet } from '@/contexts/sheet-context'
import { fmtAnchor, fmtDate } from '@/lib/format'
import type { SavingsSummary } from '@/lib/savings'
import { cn } from '@/lib/utils'
import { SavingsChart } from './SavingsChart'

export type SavingsMovement = {
  id: string
  date: string // YYYY-MM-DD
  description: string
  /** Absolute amount in its own currency. */
  amount: number
  currency: string
  type: 'SAVINGS' | 'WITHDRAWAL'
  categoryId: string
  /** Absolute anchor value at the locked rate; null when it has no FX path. */
  anchorAmount: number | null
}

type Range = '6' | '12' | 'all'
const HISTORY_PAGE = 12

/** Anchor amount with an explicit sign (`+` / `−`, U+2212). */
function signed(n: number, anchor: string) {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${fmtAnchor(Math.abs(n), anchor)}`
}

function monthLong(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function monthSince(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function SavingsView({
  summary,
  movements,
  anchorCurrency,
}: {
  summary: SavingsSummary
  movements: SavingsMovement[]
  anchorCurrency: string
}) {
  const { openNewOfType, openEdit } = useTransactionSheet()
  const [range, setRange] = useState<Range>('12')
  const [pot, setPot] = useState<string>('all')
  const [shown, setShown] = useState(HISTORY_PAGE)
  const [open, setOpen] = useState<Set<string>>(() => new Set(movements[0] ? [movements[0].date.slice(0, 7)] : []))

  const pots = summary.pots
  const potById = useMemo(() => new Map(pots.map((p) => [p.id, p])), [pots])
  const canWithdraw = pots.some((p) => p.balance > 0)

  const chartMonths = range === 'all' ? summary.months : summary.months.slice(-Number(range))

  // History is built from the rows themselves so the pot filter can re-derive
  // each month's In / Out / Total after for one pot. Only months with movements
  // are listed; `totalAfter` still carries across the quiet months between them.
  const history = useMemo(() => {
    const rows = movements.filter((m) => pot === 'all' || m.categoryId === pot)
    const byMonth = new Map<string, SavingsMovement[]>()
    for (const r of rows) {
      const key = r.date.slice(0, 7)
      const list = byMonth.get(key) ?? []
      list.push(r)
      byMonth.set(key, list)
    }
    const ascending = [...byMonth.keys()].sort()
    let running = 0
    const months = ascending.map((month) => {
      const items = byMonth.get(month)!
      let inflow = 0, outflow = 0
      for (const it of items) {
        if (it.anchorAmount === null) continue
        if (it.type === 'SAVINGS') inflow += it.anchorAmount
        else outflow += it.anchorAmount
      }
      running += inflow - outflow
      return { month, in: Math.round(inflow), out: Math.round(outflow), net: Math.round(inflow - outflow), totalAfter: Math.round(running), items }
    })
    return months.reverse()
  }, [movements, pot])

  function toggle(month: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  function edit(m: SavingsMovement) {
    openEdit({
      id: m.id,
      date: m.date,
      description: m.description,
      amount: m.amount,
      currency: m.currency,
      type: m.type,
      categoryId: m.categoryId,
      recurringRuleId: null,
      coversDueDate: null,
      recurringRuleName: null,
    })
  }

  if (pots.length === 0) {
    return (
      <div className="px-4 lg:px-7 pb-9 pt-1 max-w-[1320px] mx-auto">
        <CalmCard>
          <Empty
            icon={PiggyBank}
            title="No savings pots yet"
            body="A pot is a savings category. Add one, then log deposits into it."
            action={<Link href="/categories" className={buttonVariants({ size: 'sm' })}>Add a savings category</Link>}
          />
        </CalmCard>
      </div>
    )
  }

  const actions = (
    <>
      <Button variant="outline" onClick={() => openNewOfType('WITHDRAWAL')} disabled={!canWithdraw} className="h-11 md:h-9">
        <ArrowDown className="w-4 h-4" aria-hidden="true" />
        Withdraw
      </Button>
      <Button onClick={() => openNewOfType('SAVINGS')} className="h-11 md:h-9">
        <Plus className="w-4 h-4" aria-hidden="true" />
        <span className="md:hidden">Add</span>
        <span className="hidden md:inline">Add to savings</span>
      </Button>
    </>
  )

  return (
    <div className="motion-stagger px-4 lg:px-7 pb-9 pt-1 space-y-4 max-w-[1320px] mx-auto">
      <div className="hidden md:flex items-center justify-end gap-2">{actions}</div>

      {summary.unconvertibleCount > 0 && (
        <div className="calm-card px-4 py-3 text-[12.5px] flex items-start gap-2.5">
          <TriangleAlert className="w-4 h-4 shrink-0 text-expense mt-0.5" aria-hidden="true" />
          <span className="text-muted-foreground">
            {summary.unconvertibleCount} savings {summary.unconvertibleCount === 1 ? 'entry has' : 'entries have'} no exchange rate to {anchorCurrency} and {summary.unconvertibleCount === 1 ? 'is' : 'are'} left out of these totals.
          </span>
        </div>
      )}

      {/* Total + chart */}
      <CalmCard className="p-5 md:p-6 flex flex-col lg:flex-row gap-6 lg:gap-8">
        <div className="lg:w-[300px] lg:shrink-0 flex flex-col">
          <div className="text-[12.5px] text-muted-foreground">Total saved · all time</div>
          <div className="tabular text-[34px] md:text-[44px] font-light tracking-[-0.025em] leading-[1.05] mt-1.5">
            {signed(summary.total, anchorCurrency).replace(/^\+/, '')}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="tabular text-[11.5px] font-medium text-savings bg-savings/12 rounded-full px-2.5 py-1">
              {signed(summary.thisMonth, anchorCurrency)} this month
            </span>
            {summary.since && <span className="text-[11px] text-muted-foreground">since {monthSince(summary.since)}</span>}
          </div>
          <div className="flex-1 min-h-6" />
          <dl className="grid grid-cols-2 gap-4 border-t border-border/60 pt-4 mt-4 lg:mt-0">
            <div>
              <dt className="text-[10.5px] text-muted-foreground uppercase tracking-[0.06em]">Deposited</dt>
              <dd className="tabular text-[15px] mt-1">{fmtAnchor(summary.deposited, anchorCurrency)}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] text-muted-foreground uppercase tracking-[0.06em]">Withdrawn</dt>
              <dd className="tabular text-[15px] mt-1">{summary.withdrawn > 0 ? `−${fmtAnchor(summary.withdrawn, anchorCurrency)}` : fmtAnchor(0, anchorCurrency)}</dd>
            </div>
          </dl>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[12.5px] font-medium">Total over time</h2>
            <Segmented
              options={[
                { label: '6M', value: '6' as const },
                { label: '12M', value: '12' as const },
                { label: 'All', value: 'all' as const },
              ]}
              value={range}
              onChange={setRange}
            />
          </div>
          {chartMonths.length > 0 ? (
            <SavingsChart months={chartMonths} anchorCurrency={anchorCurrency} className="mt-4" height={180} />
          ) : (
            <div className="mt-4 h-[180px] rounded-lg bg-secondary/40 flex items-center justify-center text-[12px] text-muted-foreground">
              Nothing saved yet
            </div>
          )}
        </div>
      </CalmCard>

      <div className="grid grid-cols-2 gap-2.5 md:hidden">{actions}</div>

      {/* Pots */}
      <section aria-labelledby="pots-heading" className="space-y-3">
        <h2 id="pots-heading" className="text-[14px] font-semibold tracking-tight">Pots</h2>
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          {pots.map((p) => (
            <CalmCard key={p.id} className="p-5">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} aria-hidden="true" />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto tabular text-[11px] font-normal text-muted-foreground">{p.share}%</span>
              </div>
              <div className={cn('tabular text-[24px] font-light tracking-[-0.02em] mt-2.5', p.balance < 0 && 'text-expense')}>
                {p.balance < 0 ? signed(p.balance, anchorCurrency) : fmtAnchor(p.balance, anchorCurrency)}
              </div>
              <div className="h-1 rounded-full bg-secondary mt-3.5 overflow-hidden">
                <div className="h-full" style={{ width: `${p.share}%`, background: p.color }} />
              </div>
              <div className="tabular text-[11.5px] text-muted-foreground mt-3">
                {p.thisMonth !== 0 ? `${signed(p.thisMonth, anchorCurrency)} this month` : 'No change this month'}
                {p.withdrawn > 0 && ` · −${fmtAnchor(p.withdrawn, anchorCurrency)} withdrawn`}
              </div>
            </CalmCard>
          ))}
        </div>
      </section>

      {/* History */}
      <CalmCard className="py-2">
        <div className="flex flex-wrap items-center gap-3 px-5 md:px-6 pt-3 pb-2">
          <h2 className="text-[14px] font-semibold tracking-tight flex-1">History</h2>
          {pots.length > 1 && (
            <div role="group" aria-label="Filter by pot" className="flex gap-1 overflow-x-auto [scrollbar-width:none] -mx-1 px-1 max-w-full">
              {[{ id: 'all', name: 'All pots' }, ...pots].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={pot === p.id}
                  onClick={() => { setPot(p.id); setShown(HISTORY_PAGE) }}
                  className={cn(
                    'shrink-0 rounded-full px-3 h-9 md:h-7 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    pot === p.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {history.length === 0 ? (
          <div className="px-6 py-10 text-center text-[12.5px] text-muted-foreground">No deposits or withdrawals yet.</div>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[28px_minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-3 px-6 py-2 text-[10.5px] text-muted-foreground uppercase tracking-[0.06em] border-b border-border/60">
              <span /><span>Month</span>
              <span className="text-right">In</span><span className="text-right">Out</span>
              <span className="text-right">Net</span><span className="text-right">Total after</span>
            </div>
            <ul>
              {history.slice(0, shown).map((h) => {
                const isOpen = open.has(h.month)
                return (
                  <li key={h.month} className="border-b border-border/40 last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggle(h.month)}
                      className="w-full text-left grid grid-cols-[20px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] items-center gap-3 px-5 md:px-6 py-3 min-h-[52px] hover:bg-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                    >
                      {isOpen
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />}
                      <span className="min-w-0">
                        <span className={cn('block text-[13px]', isOpen && 'font-medium')}>{monthLong(h.month)}</span>
                        <span className="md:hidden block tabular text-[11px] text-muted-foreground mt-0.5">
                          {h.out > 0 && `−${fmtAnchor(h.out, anchorCurrency)} withdrawn · `}total after {fmtAnchor(h.totalAfter, anchorCurrency)}
                        </span>
                      </span>
                      <span className="hidden md:block tabular text-[13px] text-right">{h.in > 0 ? `+${fmtAnchor(h.in, anchorCurrency)}` : '—'}</span>
                      <span className={cn('hidden md:block tabular text-[13px] text-right', h.out > 0 ? 'text-expense' : 'text-muted-foreground/70')}>
                        {h.out > 0 ? `−${fmtAnchor(h.out, anchorCurrency)}` : '—'}
                      </span>
                      <span className={cn('tabular text-[13px] text-right', h.net < 0 ? 'text-expense' : 'text-savings')}>{signed(h.net, anchorCurrency)}</span>
                      <span className="hidden md:block tabular text-[13px] text-right text-foreground/85">{fmtAnchor(h.totalAfter, anchorCurrency)}</span>
                    </button>
                    {isOpen && (
                      <ul className="bg-secondary/25 border-t border-border/40 py-1">
                        {h.items.map((m) => {
                          const p = potById.get(m.categoryId)
                          return (
                            <li key={m.id}>
                              <button
                                type="button"
                                onClick={() => edit(m)}
                                aria-label={`Edit ${m.type === 'WITHDRAWAL' ? 'withdrawal' : 'deposit'}: ${fmtDate(m.date)}, ${m.description}, ${p?.name ?? ''}`}
                                className="w-full text-left grid grid-cols-[20px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] items-center gap-3 px-5 md:px-6 py-2.5 min-h-11 text-[12.5px] hover:bg-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                              >
                                <span />
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className="tabular text-muted-foreground w-12 shrink-0">{fmtDate(m.date, { short: true })}</span>
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p?.color }} aria-hidden="true" />
                                  <span className="truncate">{m.description}<span className="text-muted-foreground"> · {p?.name}</span></span>
                                </span>
                                <span className={cn('tabular text-right md:col-start-auto', m.type === 'WITHDRAWAL' && 'md:col-start-4 text-expense')}>
                                  {m.type === 'WITHDRAWAL' ? '−' : '+'}{fmtAnchor(m.amount, m.currency)}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
            {history.length > shown && (
              <div className="flex justify-center border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShown((n) => n + HISTORY_PAGE)}
                  className="min-h-11 px-4 text-[12.5px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded"
                >
                  Show earlier months ({history.length - shown})
                </button>
              </div>
            )}
          </>
        )}
      </CalmCard>
    </div>
  )
}
