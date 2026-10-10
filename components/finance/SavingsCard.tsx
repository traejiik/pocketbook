import Link from 'next/link'
import { ChevronRight, PiggyBank } from 'lucide-react'

import { CalmCard } from '@/components/finance/CalmCard'
import { SavingsChart } from '@/components/savings/SavingsChart'
import { fmtAnchor } from '@/lib/format'
import type { SavingsSummary } from '@/lib/savings'
import { cn } from '@/lib/utils'

function signed(n: number, anchor: string) {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${fmtAnchor(Math.abs(n), anchor)}`
}

function since(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function PotBar({ pots, className }: { pots: SavingsSummary['pots']; className?: string }) {
  const parts = pots.filter((p) => p.share > 0)
  if (parts.length === 0) return <div className={cn('h-1.5 rounded-full bg-secondary', className)} />
  return (
    <div
      role="img"
      aria-label={parts.map((p) => `${p.name} ${p.share}%`).join(', ')}
      className={cn('flex h-1.5 gap-0.5 rounded-full overflow-hidden', className)}
    >
      {parts.map((p) => (
        <div key={p.id} style={{ width: `${p.share}%`, background: p.color }} />
      ))}
    </div>
  )
}

function Icon({ small }: { small?: boolean }) {
  return (
    <div className={cn('rounded-[10px] bg-savings/14 flex items-center justify-center shrink-0', small ? 'w-8 h-8' : 'w-9 h-9')}>
      <PiggyBank className={cn('text-savings', small ? 'w-4 h-4' : 'w-[18px] h-[18px]')} aria-hidden="true" />
    </div>
  )
}

/**
 * The dashboard's all-time savings figure. Three width tiers (rule 18), toggled by
 * visibility only:
 *   < md      — a card: figure, the year's line, the pot split and one row per pot.
 *   md–1439   — a thin strip: figure, this month, the pot split, a chevron link.
 *   ≥ 1440    — a thin strip: figure, this month, Deposited / Withdrawn, the line.
 * The desktop content area narrows at 1025 (the 224px sidebar replaces the 76px
 * rail), so the wide strip only opens where it has room. Details live on /savings.
 */
export function SavingsCard({ summary, anchor, className }: { summary: SavingsSummary; anchor: string; className?: string }) {
  const trend = summary.months.slice(-12)
  const total = fmtAnchor(summary.total, anchor)
  const month = summary.thisMonth === 0 ? 'No change this month' : `${signed(summary.thisMonth, anchor)} this month`
  const sinceLabel = summary.since ? since(summary.since) : null

  return (
    <section aria-label="Total savings" className={className}>
      {/* Mobile card */}
      <CalmCard className="md:hidden p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Icon small />
            <h2 className="text-[13px] font-medium">Total saved</h2>
          </div>
          <Link href="/savings" className="inline-flex items-center gap-1 min-h-11 pl-3 text-[12px] text-muted-foreground hover:text-foreground">
            All <ChevronRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
        <div className="tabular text-[32px] font-light tracking-[-0.02em] mt-1">{total}</div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="tabular text-[11.5px] font-medium text-savings bg-savings/12 rounded-full px-2.5 py-1">{month}</span>
          {sinceLabel && <span className="text-[11px] text-muted-foreground">since {sinceLabel}</span>}
        </div>
        {trend.length > 1 && <SavingsChart months={trend} anchorCurrency={anchor} height={56} showAxis={false} className="mt-4" />}
        <PotBar pots={summary.pots} className="mt-4" />
        <ul className="mt-1.5 text-[12.5px]">
          {summary.pots.map((p, i) => (
            <li key={p.id} className={cn('flex items-center gap-2.5 py-2', i > 0 && 'border-t border-border/40')}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} aria-hidden="true" />
              <span className="flex-1 min-w-0 truncate">{p.name}</span>
              <span className="tabular text-[11px] text-muted-foreground">{p.share}%</span>
              <span className={cn('tabular w-[104px] text-right', p.balance < 0 && 'text-expense')}>{fmtAnchor(p.balance, anchor)}</span>
            </li>
          ))}
        </ul>
      </CalmCard>

      {/* Tablet → 1439: compact strip */}
      <CalmCard className="hidden md:max-[1439px]:flex items-center gap-4 h-[76px] pl-4 pr-1.5">
        <Icon />
        <div className="shrink-0">
          <div className="text-[11.5px] text-muted-foreground">Total saved · all time</div>
          <div className="tabular text-[22px] font-light tracking-[-0.02em] leading-tight">{total}</div>
        </div>
        <span className="shrink-0 tabular text-[11px] font-medium text-savings bg-savings/12 rounded-full px-2.5 py-1">
          {signed(summary.thisMonth, anchor)}
        </span>
        <PotBar pots={summary.pots} className="flex-1 min-w-0" />
        <Link
          href="/savings"
          aria-label="View savings"
          className="shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/60"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </CalmCard>

      {/* ≥ 1440: full strip */}
      <CalmCard className="hidden min-[1440px]:flex items-center gap-6 h-[76px] pl-[18px] pr-3">
        <div className="flex items-center gap-3 shrink-0">
          <Icon />
          <div>
            <h2 className="text-[12.5px] font-medium">Total saved</h2>
            <div className="text-[11px] text-muted-foreground mt-0.5">All time{sinceLabel ? ` · since ${sinceLabel}` : ''}</div>
          </div>
        </div>
        <div className="tabular text-[26px] font-light tracking-[-0.02em] shrink-0">{total}</div>
        <span className="shrink-0 tabular text-[11.5px] font-medium text-savings bg-savings/12 rounded-full px-2.5 py-1">{month}</span>
        <div className="flex-1" />
        <dl className="flex gap-7 shrink-0">
          <div>
            <dt className="text-[10.5px] text-muted-foreground uppercase tracking-[0.06em]">Deposited</dt>
            <dd className="tabular text-[13px] mt-0.5">{fmtAnchor(summary.deposited, anchor)}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] text-muted-foreground uppercase tracking-[0.06em]">Withdrawn</dt>
            <dd className="tabular text-[13px] mt-0.5">{summary.withdrawn > 0 ? `−${fmtAnchor(summary.withdrawn, anchor)}` : fmtAnchor(0, anchor)}</dd>
          </div>
        </dl>
        {trend.length > 1 && <SavingsChart months={trend} anchorCurrency={anchor} height={32} showAxis={false} className="w-[140px] shrink-0" />}
        <Link href="/savings" className="shrink-0 inline-flex items-center gap-1 min-h-11 px-2 text-[12px] text-muted-foreground hover:text-foreground">
          View savings <ChevronRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </CalmCard>
    </section>
  )
}
