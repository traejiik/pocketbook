import { Calendar, Repeat2, MoreHorizontal, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtHUF, fmtDate } from '@/lib/format'
import { AmountDisplay } from './AmountDisplay'

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
}

export function RecurringRuleCard({ rule, hufEquivalent, daysAway, onEdit }: RecurringRuleCardProps) {
  const inst = rule.installmentTotal != null ? {
    paid:   rule.installmentPaid ?? 0,
    total:  rule.installmentTotal,
    endsOn: rule.installmentEndsOn,  // string | null
  } : null

  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full text-left bg-card border border-border rounded-2xl p-4 group cursor-pointer hover:border-ring/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      onClick={() => onEdit?.(rule)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit?.(rule); } }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-md border border-border flex items-center justify-center shrink-0"
            style={{ background: `${rule.category.color}18`, color: rule.category.color }}
          >
            {rule.cycle === 'ANNUAL'
              ? <Calendar className="w-4 h-4" />
              : <Repeat2 className="w-4 h-4" />
            }
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium truncate">{rule.name}</div>
            <div className="text-[11px] text-muted-foreground capitalize">
              {rule.cycle.toLowerCase()} · {rule.category.name}
            </div>
          </div>
        </div>
        <button
          aria-label={`Edit ${rule.name}`}
          className="text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          onClick={(e) => { e.stopPropagation(); onEdit?.(rule); }}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <AmountDisplay
          value={rule.amount}
          currency={rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP'}
          tone={rule.kind === 'INCOME' ? 'income' : 'expense'}
          size="md"
        />
        {rule.currency !== 'HUF' && hufEquivalent !== null && (
          <div className="text-[10.5px] text-muted-foreground tabular">≈ {fmtHUF(hufEquivalent)}</div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          Next · {fmtDate(rule.nextDue, { short: true })}
        </span>
        <span className={cn('mono',
          daysAway < 0 ? 'text-destructive' :
          daysAway <= 7 ? 'text-warning' :
          'text-muted-foreground',
        )}>
          {daysAway < 0 ? `${Math.abs(daysAway)}d overdue` : daysAway === 0 ? 'today' : `in ${daysAway}d`}
        </span>
      </div>

      {inst && (
        <div className="mt-3 p-2.5 rounded-md bg-warning/8 border border-warning/20">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-warning font-medium inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Installment plan
            </span>
            <span className="mono text-warning">{inst.paid}/{inst.total}</span>
          </div>
          <div className="h-1.5 bg-warning/15 rounded-full overflow-hidden">
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
