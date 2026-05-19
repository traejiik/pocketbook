import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { AmountDisplay } from './AmountDisplay'
import { cn } from '@/lib/utils'
import type { Currency } from '@/lib/fx'

type KpiTone = 'income' | 'expense' | 'savings' | 'neutral'

interface KpiCardProps {
  label: string
  value: number
  currency?: Currency
  tone?: KpiTone
  delta?: number
  deltaLabel?: string
  accentDots?: number[]
  footnote?: string
  className?: string
}

export function KpiCard({
  label,
  value,
  currency = 'HUF',
  tone = 'neutral',
  delta,
  deltaLabel,
  accentDots,
  footnote,
  className,
}: KpiCardProps) {
  const deltaPositive = delta != null && delta > 0
  const deltaNegative = delta != null && delta < 0

  const deltaColor =
    deltaPositive
      ? tone === 'expense' ? 'text-expense' : 'text-income'
      : deltaNegative
      ? tone === 'expense' ? 'text-income' : 'text-expense'
      : 'text-muted-foreground'

  const accentVar =
    tone === 'expense' ? '--expense'
    : tone === 'income' ? '--income'
    : tone === 'savings' ? '--savings'
    : '--muted-foreground'

  return (
    <Card className={cn('p-4 flex flex-col gap-3 relative overflow-hidden', className)}>
      <div className="flex items-center justify-between">
        <div className="text-[11.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">
          {label}
        </div>
        {delta != null && (
          <span className={cn('mono text-[11px] inline-flex items-center gap-0.5', deltaColor)}>
            {deltaPositive ? <ArrowUp className="w-3 h-3" /> : deltaNegative ? <ArrowDown className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>

      <AmountDisplay value={value} currency={currency} tone={tone} size="xl" />

      <div className="flex items-center justify-between">
        <div className="text-[11.5px] text-muted-foreground">
          {footnote ?? (deltaLabel ? `vs ${deltaLabel}` : ' ')}
        </div>
        {accentDots && (
          <div className="flex gap-0.5 items-end">
            {accentDots.map((d, i) => (
              <span
                key={i}
                className="w-0.5 rounded-full"
                style={{
                  height: `${6 + d * 14}px`,
                  background: `hsl(var(${accentVar}))`,
                  opacity: 0.35 + 0.55 * d,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
