'use client'

import { fmtAnchor } from '@/lib/format'
import type { SavingsMonth } from '@/lib/savings'

const W = 1000
const H = 200

function monthShort(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
}

/**
 * The total saved at the end of each month, as a line. Months with a withdrawal
 * get a dashed marker so a dip reads as money taken out, not a data glitch.
 * Drawn in a stretched viewBox with non-scaling strokes, like the other finance
 * charts, so it fills any width without a resize observer.
 */
export function SavingsChart({
  months,
  anchorCurrency,
  height = 200,
  showAxis = true,
  className,
}: {
  months: SavingsMonth[]
  anchorCurrency: string
  height?: number
  showAxis?: boolean
  className?: string
}) {
  if (months.length === 0) return null

  const values = months.map((m) => m.totalAfter)
  const min = Math.min(0, ...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i: number) => (months.length === 1 ? W / 2 : (i / (months.length - 1)) * W)
  const y = (v: number) => H - 8 - ((v - min) / span) * (H - 24)

  const points = months.map((m, i) => `${x(i).toFixed(1)} ${y(m.totalAfter).toFixed(1)}`)
  const line = `M${points.join(' L')}`
  const area = `${line} L${x(months.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`

  const withdrawals = months
    .map((m, i) => ({ m, left: (x(i) / W) * 100 }))
    .filter(({ m }) => m.out > 0)

  const first = months[0]
  const last = months[months.length - 1]
  const label = `Total saved from ${monthShort(first.month)} to ${monthShort(last.month)}: ${fmtAnchor(first.totalAfter, anchorCurrency)} to ${fmtAnchor(last.totalAfter, anchorCurrency)}${withdrawals.length ? `, with ${withdrawals.length} month${withdrawals.length === 1 ? '' : 's'} of withdrawals` : ''}`

  // Every month fits as a label up to a year; beyond that, the ends and the middle.
  const ticks = months.length <= 12
    ? months.map((m, i) => ({ key: m.month, i }))
    : [0, Math.floor((months.length - 1) / 2), months.length - 1].map((i) => ({ key: months[i].month, i }))

  return (
    <div className={className}>
      <div className="relative" style={{ height }}>
        <svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="block">
          {showAxis && (
            <path d={`M0 ${H * 0.25} H${W} M0 ${H * 0.5} H${W} M0 ${H * 0.75} H${W}`} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
          )}
          <path d={area} className="fill-savings/10" />
          <path d={line} className="stroke-savings" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {withdrawals.map(({ m, left }) => (
          <div
            key={m.month}
            aria-hidden="true"
            title={`${monthShort(m.month)}: −${fmtAnchor(m.out, anchorCurrency)} withdrawn`}
            className="absolute top-0 bottom-0 border-l border-dashed border-expense/60"
            style={{ left: `${left}%` }}
          />
        ))}
      </div>
      {showAxis && (
        <div className="relative h-4 mt-2 text-[10.5px] text-muted-foreground">
          {ticks.map(({ key, i }) => {
            const left = (x(i) / W) * 100
            const align = i === 0 ? 'translate-x-0' : i === months.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
            return (
              <span key={key} className={`absolute ${align}`} style={{ left: `${left}%` }}>
                {monthShort(key)}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
