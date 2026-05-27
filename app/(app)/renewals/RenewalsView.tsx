'use client'

import { useState, useMemo } from 'react'
import { Segmented } from '@/components/ui/segmented'
import { Empty } from '@/components/ui/empty'
import { CalendarIcon } from 'lucide-react'
import { TimelineStrip } from '@/components/finance/TimelineStrip'
import { AmountDisplay } from '@/components/finance/AmountDisplay'
import { fmtAnchor } from '@/lib/format'
type Category = { id: string; name: string; color: string; kind: string }

type SerialisedRule = {
  id: string
  name: string
  amount: number
  currency: string
  cycle: string
  nextDue: string          // YYYY-MM-DD
  kind: string
  categoryId: string
  installmentPaid: number | null
  installmentTotal: number | null
  installmentEndsOn: string | null
  archived: boolean
  category: Category
}

interface RenewalItem {
  rule: SerialisedRule
  daysAway: number
  hufEquivalent: number | null
}

interface Props {
  renewals: RenewalItem[]
  anchorCurrency?: string
}

function groupKey(rule: SerialisedRule, grouping: 'week' | 'month') {
  const d = new Date(rule.nextDue)
  if (grouping === 'month') {
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }
  const start = new Date(d)
  const day = start.getDay()
  start.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
}

export function RenewalsView({ renewals, anchorCurrency = 'HUF' }: Props) {
  const [horizon, setHorizon] = useState<30 | 60 | 90>(60)
  const [grouping, setGrouping] = useState<'week' | 'month'>('week')

  const filtered = useMemo(
    () => renewals.filter((r) => r.daysAway <= horizon),
    [renewals, horizon],
  )

  const total = filtered.reduce((s, r) => s + (r.hufEquivalent ?? 0), 0)

  const groups = useMemo(() => {
    const map = new Map<string, RenewalItem[]>()
    for (const item of filtered) {
      const key = groupKey(item.rule, grouping)
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    return map
  }, [filtered, grouping])

  const timelineEvents = filtered.map((r) => ({
    id: r.rule.id,
    name: r.rule.name,
    daysAway: r.daysAway,
    categoryColor: r.rule.category.color,
    hufEquivalent: r.hufEquivalent ?? 0,
  }))

  return (
    <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5 max-w-[1240px] mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Upcoming renewals</h1>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            {filtered.length} renewals · {fmtAnchor(total, anchorCurrency)} due in next {horizon} days
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={[
              { label: '30d', value: 30 as const },
              { label: '60d', value: 60 as const },
              { label: '90d', value: 90 as const },
            ]}
            value={horizon}
            onChange={setHorizon}
          />
          <Segmented
            options={[
              { label: 'By week',  value: 'week' as const },
              { label: 'By month', value: 'month' as const },
            ]}
            value={grouping}
            onChange={setGrouping}
          />
        </div>
      </div>

      <TimelineStrip events={timelineEvents} horizon={horizon} anchorCurrency={anchorCurrency} />

      <div className="space-y-5">
        {[...groups.entries()].map(([key, list]) => {
          const subTotal = list.reduce((s, r) => s + (r.hufEquivalent ?? 0), 0)
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold tracking-tight">{key}</h3>
                  <span className="text-[11px] text-muted-foreground">· {list.length} renewals</span>
                </div>
                <div className="text-[12px] tabular text-foreground/85">{fmtAnchor(subTotal, anchorCurrency)}</div>
              </div>
              <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                {list.map(({ rule, daysAway, hufEquivalent }) => (
                  <div
                    key={rule.id}
                    className="grid grid-cols-[52px_1fr_auto] sm:grid-cols-[60px_1fr_140px_140px] items-center px-4 py-3 hover:bg-accent/40 transition-colors"
                  >
                    <div className="text-center">
                      <div className="text-[9px] uppercase mono text-muted-foreground leading-none">
                        {new Date(rule.nextDue).toLocaleDateString('en-GB', { month: 'short' })}
                      </div>
                      <div className="text-[15px] font-semibold tabular leading-tight mt-0.5">
                        {new Date(rule.nextDue).getDate()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: rule.category.color }}
                      />
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">{rule.name}</div>
                        <div className="text-[11px] text-muted-foreground capitalize">
                          {rule.cycle.toLowerCase()} · {rule.category.name}
                          {rule.installmentTotal
                            ? ` · ${rule.installmentPaid ?? 0}/${rule.installmentTotal}`
                            : ''}
                        </div>
                      </div>
                    </div>
                    {/* Amount — always; mobile folds daysAway below */}
                    <div className="text-right">
                      <AmountDisplay
                        value={Number(rule.amount)}
                        currency={rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP'}
                        tone="expense"
                        size="sm"
                      />
                      <div className={`sm:hidden text-[10px] mt-0.5 ${daysAway < 0 ? 'text-destructive font-medium' : 'text-muted-foreground/70'}`}>
                        {daysAway < 0 ? `${Math.abs(daysAway)}d overdue` : daysAway === 0 ? 'today' : `in ${daysAway}d`}
                      </div>
                    </div>
                    {/* HUF + daysAway — desktop only */}
                    <div className="hidden sm:block text-right">
                      {rule.currency !== anchorCurrency && hufEquivalent !== null && (
                        <div className="text-[11.5px] text-muted-foreground tabular">
                          ≈ {fmtAnchor(hufEquivalent, anchorCurrency)}
                        </div>
                      )}
                      <div className={`text-[10.5px] ${daysAway < 0 ? 'text-destructive font-medium' : 'text-muted-foreground/70'}`}>
                        {daysAway < 0 ? `${Math.abs(daysAway)}d overdue` : daysAway === 0 ? 'today' : `in ${daysAway}d`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <Empty
            icon={CalendarIcon}
            title="No upcoming renewals"
            body={`Nothing due in the next ${horizon} days.`}
          />
        )}
      </div>
    </div>
  )
}
