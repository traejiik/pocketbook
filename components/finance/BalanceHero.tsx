import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { fmtAnchor, fmtHUF } from '@/lib/format'
import type { BalancePoint } from '@/lib/aggregations'

interface BalanceHeroProps {
  /** Month-end running balance for the current month, in the anchor. */
  balance: number
  /** This month's net: how far the balance moved since the month opened. */
  monthNet: number
  /** Oldest → newest month-end balances; the last point is the current month. */
  trend: BalancePoint[]
  currency?: string
}

// Chart geometry, in viewBox units. The line keeps clear of the top edge for the
// endpoint glow, and the fill runs to BASE so it fades out below the lowest point.
const W = 520
const H = 130
const X0 = 10
const X1 = 510
const TOP = 14
const BOTTOM = 110
const BASE = 124

/** Catmull-Rom through the points, as cubic Béziers — a soft line with no overshoot at the ends. */
function smoothPath(pts: [number, number][]): string {
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1].toFixed(1)}`
  }
  return d
}

function BalanceChart({ trend, currency }: { trend: { month: string; balance: number }[]; currency: string }) {
  const values = trend.map(t => t.balance)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const y = (v: number) => TOP + ((max - v) / span) * (BOTTOM - TOP)
  const step = (X1 - X0) / (trend.length - 1)
  const pts = trend.map((t, i) => [X0 + i * step, y(t.balance)] as [number, number])
  const line = smoothPath(pts)
  const [endX, endY] = pts[pts.length - 1]
  const showZero = min < 0

  const first = trend[0]
  const last = trend[trend.length - 1]
  const label = `Balance at each month end, ${first.month} to ${last.month}: from ${fmtAnchor(first.balance, currency)} to ${fmtAnchor(last.balance, currency)}`

  return (
    <div className="hidden md:flex flex-col gap-1.5 min-w-0">
      {/* Fixed height, stretched width: the text column sets the card's height, so
          the chart never makes the card taller as the column widens. Strokes stay
          crisp via non-scaling-stroke; the endpoint is HTML so it stays round. */}
      <div className="relative h-[104px] lg:h-[112px]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full overflow-visible"
          role="img"
          aria-label={label}
        >
          <defs>
            <linearGradient id="balance-hero-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--bh-tone))" stopOpacity={0.36} />
              <stop offset="100%" stopColor="hsl(var(--bh-tone))" stopOpacity={0} />
            </linearGradient>
          </defs>
          {showZero && (
            <line x1={X0} x2={X1} y1={y(0)} y2={y(0)} stroke="hsl(var(--balance-ink) / 0.25)" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
          <path d={`${line} L${endX} ${BASE} L${X0} ${BASE} Z`} fill="url(#balance-hero-fill)" />
          <path d={line} fill="none" stroke="hsl(var(--bh-tone))" strokeWidth={2.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          aria-hidden="true"
          className="absolute w-[19px] h-[19px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--bh-tone)/0.22)] flex items-center justify-center"
          style={{ left: `${(endX / W) * 100}%`, top: `${(endY / H) * 100}%` }}
        >
          <span className="w-[9px] h-[9px] rounded-full bg-[hsl(var(--balance-ink))]" />
        </span>
      </div>
      <div className="flex justify-between px-0.5 mono text-[10.5px] text-[hsl(var(--balance-sub)/0.8)]" aria-hidden="true">
        {trend.map((t, i) => <span key={i}>{t.month}</span>)}
      </div>
    </div>
  )
}

/**
 * Dashboard hero for month-to-month carry-over: the running balance, how far it
 * moved this month, and (from `md`) a six-month balance line. A deliberate
 * addition to the v5 dashboard, which has no running balance; the KPI strip below
 * it is unchanged and its Net stays the month's own figure.
 */
export function BalanceHero({ balance, monthNet, trend, currency = 'HUF' }: BalanceHeroProps) {
  const isNeg = balance < 0
  const abs = Math.abs(balance)
  const isHUF = currency === 'HUF'
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : null

  // HUF has no minor unit, so only the `Ft` suffix is dimmed; other anchors dim
  // their decimals instead.
  const [whole, decimals] = isHUF
    ? [fmtHUF(abs).replace(/\sFt$/, ''), null]
    : abs.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.')

  const moved = fmtAnchor(monthNet, currency, { signed: true })
  const movedLabel = !isHUF && monthNet > 0 ? `+${moved}` : moved

  const chartPoints = trend.every(t => t.balance !== null) && trend.length > 1
    ? (trend as { month: string; balance: number }[])
    : null

  return (
    <section
      aria-label="Balance"
      data-negative={isNeg || undefined}
      className="balance-hero relative overflow-hidden px-5 py-[22px] md:px-6 lg:px-[30px] lg:py-[26px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-6 items-end"
    >
      <div className="flex flex-col gap-3 md:gap-3.5 min-w-0">
        <span className="text-[15px] text-[hsl(var(--balance-sub))]">Balance</span>
        <span className="tabular font-light tracking-[-0.035em] leading-[0.95] whitespace-nowrap text-[46px] md:text-[52px] lg:text-[64px]">
          {isNeg && <span className="text-[hsl(var(--bh-tone))]">−</span>}
          {symbol && <span className="text-[0.5em] font-normal tracking-normal mr-[0.15em] text-[hsl(var(--balance-ink)/0.5)]">{symbol}</span>}
          {whole}
          {decimals && <span className="text-[hsl(var(--balance-ink)/0.5)]">.{decimals}</span>}
          {isHUF && <span className="text-[0.4em] font-normal tracking-normal ml-[0.3em] text-[hsl(var(--balance-ink)/0.5)]">Ft</span>}
        </span>
        <span className="self-start inline-flex items-center gap-[7px] h-[30px] pl-2.5 pr-[13px] rounded-full text-[12.5px] tabular whitespace-nowrap bg-[hsl(var(--balance-ink)/0.07)] border border-[hsl(var(--balance-ink)/0.12)] text-[hsl(var(--balance-ink)/0.9)]">
          {monthNet < 0
            ? <ArrowDownRight aria-hidden="true" className="w-3.5 h-3.5 text-expense" />
            : <ArrowUpRight aria-hidden="true" className="w-3.5 h-3.5 text-income" />}
          {movedLabel}
          <span className="text-[hsl(var(--balance-sub))]">this month</span>
        </span>
      </div>
      {chartPoints && <BalanceChart trend={chartPoints} currency={currency} />}
    </section>
  )
}
