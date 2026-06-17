import { Calendar, Repeat, MoreHorizontal, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtAnchor, fmtCur, fmtDate } from '@/lib/format'
import { hexToRgba } from '@/lib/colors'

export interface CardRule {
  id: string
  name: string
  amount: number
  currency: string
  cycle: string
  nextDue: string          // YYYY-MM-DD
  kind: string
  installmentPaid: number | null
  installmentTotal: number | null
  installmentEndsOn: string | null  // YYYY-MM-DD or null
  category: { name: string; color: string }
}

interface RecurringRuleCardProps {
  rule: CardRule
  hufEquivalent: number | null
  daysAway: number
  onEdit?: (rule: CardRule) => void
  anchorCurrency?: string
}

export function RecurringRuleCard({ rule, hufEquivalent, daysAway, onEdit, anchorCurrency = 'HUF' }: RecurringRuleCardProps) {
  const inst = rule.installmentTotal != null
    ? { paid: rule.installmentPaid ?? 0, total: rule.installmentTotal, endsOn: rule.installmentEndsOn }
    : null

  const amtColor =
    rule.kind === 'INCOME' ? 'hsl(var(--income))'
    : rule.kind === 'SAVINGS' ? 'hsl(var(--savings))'
    : 'hsl(var(--foreground))'

  let daysCls = 'text-muted-foreground'
  let daysTxt = `in ${daysAway}d`
  if (daysAway < 0) { daysCls = 'text-expense'; daysTxt = `${Math.abs(daysAway)}d overdue` }
  else if (daysAway === 0) { daysCls = 'text-warning'; daysTxt = 'today' }
  else if (daysAway <= 7) { daysCls = 'text-warning' }

  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full text-left calm-card group cursor-pointer hover:border-ring/40 transition-colors overflow-hidden flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      onClick={() => onEdit?.(rule)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit?.(rule) } }}
    >
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
              style={{ background: hexToRgba(rule.category.color, 0.14), color: rule.category.color }}
            >
              {rule.cycle === 'ANNUAL' ? <Calendar className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium truncate">{rule.name}</div>
              <div className="text-[11px] text-muted-foreground capitalize mt-0.5">
                {rule.cycle.toLowerCase()} · {rule.category.name}
              </div>
            </div>
          </div>
          <MoreHorizontal className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>

        <div className="mt-4 flex items-baseline justify-between gap-2">
          <div className="tabular text-[20px] font-semibold tracking-tight" style={{ color: amtColor }}>
            {fmtCur(rule.amount, rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP')}
          </div>
          {rule.currency !== anchorCurrency && hufEquivalent !== null && (
            <div className="text-[10.5px] text-muted-foreground tabular shrink-0">≈ {fmtAnchor(hufEquivalent, anchorCurrency)}</div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            Next · {fmtDate(rule.nextDue, { short: true })}
          </span>
          <span className={cn('mono tabular', daysCls)}>{daysTxt}</span>
        </div>
      </div>

      {inst && (
        <div className="px-5 py-3 bg-warning/8 border-t-2 border-warning/50">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-warning font-medium inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Installment plan
            </span>
            <span className="mono tabular text-warning">{inst.paid}/{inst.total}</span>
          </div>
          <div className="h-1.5 bg-warning/18 rounded-full overflow-hidden">
            <div
              className="h-full bg-warning rounded-full"
              style={{ width: inst.total > 0 ? `${(inst.paid / inst.total) * 100}%` : '0%' }}
            />
          </div>
          {inst.endsOn && (
            <div className="text-[10.5px] text-warning/80 mt-1.5">
              Ends {fmtDate(inst.endsOn)} · {inst.total - inst.paid} payments left
            </div>
          )}
        </div>
      )}
    </div>
  )
}
