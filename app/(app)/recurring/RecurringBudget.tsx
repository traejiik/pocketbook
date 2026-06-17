'use client'

import { useMemo } from 'react'
import { AlertTriangle, Coins } from 'lucide-react'
import { CalmCard, CalmCardHead } from '@/components/finance/CalmCard'
import type { RecurringBudgetSummary } from '@/lib/aggregations'

/** Minimal rule shape the budget visualisations need (structurally compatible
 * with RecurringView's SerialisedRule). */
export interface BudgetRule {
  id: string
  name: string
  amount: number
  currency: string
  cycle: string
  nextDue: string
  kind: string
  anchorEquivalent: number | null
}

type Tone = 'income' | 'expense' | 'savings'

function huf(n: number): string {
  const s = Math.round(Math.abs(n)).toLocaleString('hu-HU').replace(/,/g, ' ')
  return (n < 0 ? '−' : '') + s
}

function RecKpi({
  label,
  value,
  tone,
  hint,
  hintShort,
}: {
  label: string
  value: number
  tone: Tone
  hint: string
  hintShort?: string
}) {
  return (
    <div
      className="calm-card px-3.5 py-4 min-[1025px]:p-5 flex flex-col min-h-[112px] min-[1025px]:min-h-[150px] min-w-0"
      style={{ background: `linear-gradient(135deg, hsl(var(--${tone}) / 0.08) 0%, transparent 55%), hsl(var(--card))` }}
    >
      <div className="text-[12.5px] min-[1025px]:text-[13.5px] font-medium">{label}</div>
      <div className="mt-auto">
        <div
          className="tabular font-semibold tracking-tight leading-none whitespace-nowrap"
          style={{ color: `hsl(var(--${tone}))` }}
        >
          <span className="text-[24px] min-[1025px]:text-[33px]">{huf(value)}</span>
          <span className="text-[11px] min-[1025px]:text-[15px] text-muted-foreground font-medium ml-1">Ft</span>
        </div>
        <div className="text-[10.5px] min-[1025px]:text-[11px] text-muted-foreground mt-2 min-[1025px]:mt-2.5">
          {hintShort ? (
            <>
              <span className="md:hidden">{hintShort}</span>
              <span className="hidden md:inline">{hint}</span>
            </>
          ) : (
            hint
          )}
        </div>
      </div>
    </div>
  )
}

function CommittedCard({
  budget,
  fx,
}: {
  budget: RecurringBudgetSummary
  fx: { count: number; curs: string; huf: number }
}) {
  const committed = budget.monthlyExpenses + budget.monthlySavings
  const pct = budget.monthlyIncome ? Math.round((committed / budget.monthlyIncome) * 100) : 0
  const free = budget.monthlyIncome - committed

  const expTotal = budget.monthlyExpenses || 1
  const top = budget.expensesByCategory.slice(0, 4)
  const otherV = budget.expensesByCategory.slice(4).reduce((s, b) => s + b.amount, 0)
  const segs = [
    ...top.map((b) => ({ key: b.categoryId, color: b.color, name: b.name, v: b.amount })),
    ...(otherV > 0 ? [{ key: 'other', color: 'hsl(var(--muted-foreground))', name: 'Other', v: otherV }] : []),
  ]

  return (
    <CalmCard className="p-6 flex flex-col">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold tracking-tight">Income committed</div>
          <div className="text-[11.5px] text-muted-foreground mt-1">
            {huf(committed)} Ft / mo of {huf(budget.monthlyIncome)} Ft
          </div>
        </div>
        {/* mobile — % inline, top-right */}
        <span className="md:hidden tabular text-[34px] font-semibold tracking-tight leading-none shrink-0">
          {pct}
          <span className="text-[18px]">%</span>
        </span>
      </div>

      {/* tablet/desktop — % below with label */}
      <div className="hidden md:flex items-end gap-2 mt-4">
        <span className="tabular text-[40px] font-semibold tracking-tight leading-none">
          {pct}
          <span className="text-[20px]">%</span>
        </span>
        <span className="text-[11.5px] text-muted-foreground mb-1.5">
          of income
          <br />
          committed
        </span>
      </div>

      {/* committed / free bar */}
      <div className="mt-4 h-2.5 rounded-full overflow-hidden flex bg-secondary">
        <div style={{ width: `${Math.min(100, pct)}%`, background: 'hsl(var(--income))' }} />
      </div>
      <div className="flex items-center justify-between mt-2 text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-income" /> Committed
        </span>
        <span className="tabular">{huf(free)} Ft free</span>
      </div>

      {/* category composition */}
      {segs.length > 0 && (
        <div className="mt-5 pt-4 pb-3 border-t border-border/50">
          <div className="text-[10px] mono uppercase tracking-[0.12em] text-muted-foreground mb-2.5">Where it goes</div>
          <div className="h-2.5 rounded-full overflow-hidden flex gap-px bg-secondary">
            {segs.map((s) => (
              <div key={s.key} title={`${s.name} · ${huf(s.v)} Ft`} style={{ width: `${(s.v / expTotal) * 100}%`, background: s.color }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5">
            {segs.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                {s.name} <span className="tabular text-foreground/55">{Math.round((s.v / expTotal) * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* FX exposure */}
      {fx.count > 0 && (
        <div className="mt-auto pt-4 flex items-center gap-2 text-[11px] text-muted-foreground border-t border-border/50">
          <Coins className="w-3.5 h-3.5 shrink-0" />
          <span>
            <span className="text-foreground/80 font-medium">{fx.count} rule{fx.count === 1 ? '' : 's'}</span> in {fx.curs} · ≈ {huf(fx.huf)} Ft/mo
          </span>
        </div>
      )}
    </CalmCard>
  )
}

interface RecurringBudgetProps {
  budget: RecurringBudgetSummary
  rules: BudgetRule[]
  counts: { income: number; expense: number; savings: number }
  anchorCurrency: string
}

export function RecurringBudget({ budget, rules, counts, anchorCurrency }: RecurringBudgetProps) {
  const fx = useMemo(() => {
    const fxRules = rules.filter(
      (r) => r.kind !== 'INCOME' && r.currency !== anchorCurrency && r.anchorEquivalent != null,
    )
    const total = fxRules.reduce(
      (s, r) => s + (r.cycle === 'ANNUAL' ? (r.anchorEquivalent as number) / 12 : (r.anchorEquivalent as number)),
      0,
    )
    const curs = [...new Set(fxRules.map((r) => r.currency))].join(', ')
    return { count: fxRules.length, curs, huf: total }
  }, [rules, anchorCurrency])

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] gap-3 min-[1025px]:gap-4 items-stretch">
      <CommittedCard budget={budget} fx={fx} />
      <div className="grid grid-cols-2 gap-3 min-[1025px]:gap-4 min-w-0">
        <RecKpi label="Income" value={budget.monthlyIncome} tone="income" hint={`${counts.income} recurring source${counts.income === 1 ? '' : 's'}`} hintShort={`${counts.income} source${counts.income === 1 ? '' : 's'}`} />
        <RecKpi label="Expenses" value={budget.monthlyExpenses} tone="expense" hint={`${counts.expense} active rule${counts.expense === 1 ? '' : 's'}`} />
        <RecKpi label="Net" value={budget.netUsable} tone={budget.netUsable >= 0 ? 'income' : 'expense'} hint="Income − expenses − savings" hintShort="After save + spend" />
        <RecKpi label="Savings" value={budget.monthlySavings} tone="savings" hint={`${counts.savings} auto-save rule${counts.savings === 1 ? '' : 's'}`} hintShort={`${counts.savings} auto-save${counts.savings === 1 ? '' : 's'}`} />
      </div>
    </div>
  )
}

// --- 30-day commitments cash-flow lane --------------------------------------

const recFmtShort = (iso: string) =>
  new Date(iso + 'T00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

export function CommitmentsLane({ rules, anchorCurrency }: { rules: BudgetRule[]; anchorCurrency: string }) {
  const HORIZON = 30
  const H = 54

  const { days, byDay, dayOut, maxOut, total30, soonCount, soonTotal } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const ruleHuf = (r: BudgetRule) => (r.currency === anchorCurrency ? r.amount : r.anchorEquivalent ?? 0)

    const items = rules
      .map((r) => ({
        ...r,
        d: Math.round((new Date(r.nextDue + 'T00:00').getTime() - today.getTime()) / 86_400_000),
        h: ruleHuf(r),
      }))
      .filter((r) => r.d >= 0 && r.d <= HORIZON)

    const byDay = new Map<number, typeof items>()
    for (const it of items) {
      const arr = byDay.get(it.d) ?? []
      arr.push(it)
      byDay.set(it.d, arr)
    }
    const dayOut = (d: number) =>
      (byDay.get(d) ?? []).filter((r) => r.kind !== 'INCOME').reduce((s, r) => s + r.h, 0)
    const days = [...byDay.keys()].sort((a, b) => a - b)
    const maxOut = Math.max(1, ...days.map(dayOut))

    const outItems = items.filter((r) => r.kind !== 'INCOME')
    const total30 = outItems.reduce((s, r) => s + r.h, 0)
    const soon = outItems.filter((r) => r.d <= 7)
    const soonTotal = soon.reduce((s, r) => s + r.h, 0)

    return { days, byDay, dayOut, maxOut, total30, soonCount: soon.length, soonTotal }
  }, [rules, anchorCurrency])

  return (
    <CalmCard className="p-6">
      <CalmCardHead
        title="Commitments"
        sub={`Next 30 days · ${huf(total30)} Ft out`}
        right={
          <div className="hidden md:flex items-center gap-3 text-[10.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-expense" /> Expense</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-savings" /> Savings</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-income" /> Payday</span>
          </div>
        }
      />

      {soonCount > 0 && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 bg-warning/10 border border-warning/25">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
          <span className="text-[12px] text-foreground/90">
            <span className="font-semibold tabular">{soonCount} rule{soonCount === 1 ? '' : 's'}</span> · {huf(soonTotal)} Ft due in 7 days
          </span>
        </div>
      )}

      <div className="mt-5 relative overflow-x-clip" style={{ height: H + 38 }}>
        {/* 7-day window shade */}
        <div className="absolute top-0 left-0 rounded-l-[6px] bg-warning/6" style={{ width: `${(7 / HORIZON) * 100}%`, height: H + 8 }} />
        {/* baseline */}
        <div className="absolute left-0 right-0 bg-border" style={{ top: H + 8, height: 1 }} />

        {days.map((d) => {
          const list = byDay.get(d) ?? []
          const out = dayOut(d)
          const exp = list.filter((r) => r.kind === 'EXPENSE').reduce((s, r) => s + r.h, 0)
          const sav = list.filter((r) => r.kind === 'SAVINGS').reduce((s, r) => s + r.h, 0)
          const hasIncome = list.some((r) => r.kind === 'INCOME')
          const barH = out > 0 ? Math.max(7, Math.sqrt(out / maxOut) * H) : 0
          const left = Math.min(98, (d / HORIZON) * 100)
          const names = list.map((r) => r.name).join(', ')

          return (
            <div key={d} className="absolute -translate-x-1/2 group" style={{ left: `${left}%`, top: 0, height: H + 8 }}>
              {out > 0 && (
                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col-reverse w-[9px] rounded-[3px] overflow-hidden" style={{ bottom: 0, height: barH }}>
                  <div style={{ height: `${(exp / out) * 100}%`, background: 'hsl(var(--expense))' }} />
                  <div style={{ height: `${(sav / out) * 100}%`, background: 'hsl(var(--savings))' }} />
                </div>
              )}
              {hasIncome && (
                <div className="absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-income" style={{ bottom: -5, boxShadow: '0 0 0 3px hsl(var(--card))' }} />
              )}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute left-1/2 -translate-x-1/2 -top-1 bg-card border border-border rounded-[8px] px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-pb-2 z-20">
                <span className="font-medium">{recFmtShort(list[0].nextDue)}</span> · <span className="tabular text-muted-foreground">{huf(out || list[0].h)} Ft</span>
                <div className="text-[10px] text-muted-foreground/80 max-w-[180px] truncate">{names}</div>
              </div>
            </div>
          )
        })}

        <div className="absolute left-0 text-[10px] text-muted-foreground mono" style={{ top: H + 16 }}>Today</div>
        <div className="absolute right-0 text-[10px] text-muted-foreground mono" style={{ top: H + 16 }}>+30d</div>
      </div>

      {/* Legend below the lane on mobile (header legend hides < md) */}
      <div className="md:hidden flex items-center gap-3 text-[10.5px] text-muted-foreground mt-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-expense" /> Expense</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-savings" /> Savings</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-income" /> Payday</span>
      </div>
    </CalmCard>
  )
}
