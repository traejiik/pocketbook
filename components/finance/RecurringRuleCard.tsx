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
  hufEquivalent: number
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
      className="bg-card border border-border rounded-2xl p-4 group cursor-pointer hover:border-ring/40 transition-colors"
      onClick={() => onEdit?.(rule)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-md border border-border flex items-center justify-center flex-shrink-0"
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
          className="text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100"
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
        {rule.currency !== 'HUF' && (
          <div className="text-[10.5px] text-muted-foreground tabular">≈ {fmtHUF(hufEquivalent)}</div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          Next · {fmtDate(rule.nextDue, { short: true })}
        </span>
        <span className={cn('mono', daysAway <= 7 ? 'text-amber-400' : 'text-muted-foreground')}>
          in {daysAway}d
        </span>
      </div>

      {inst && (
        <div className="mt-3 p-2.5 rounded-md bg-amber-500/8 border border-amber-500/20">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-amber-400 font-medium inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Installment plan
            </span>
            <span className="mono text-amber-400">{inst.paid}/{inst.total}</span>
          </div>
          <div className="h-1.5 bg-amber-500/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full"
              style={{ width: `${(inst.paid / inst.total) * 100}%` }}
            />
          </div>
          {inst.endsOn && (
            <div className="text-[10.5px] text-amber-400/80 mt-1.5">
              Ends {fmtDate(inst.endsOn)} · {inst.total - inst.paid} payments left
            </div>
          )}
        </div>
      )}
    </div>
  )
}
