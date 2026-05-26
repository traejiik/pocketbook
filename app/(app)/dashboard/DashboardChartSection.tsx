'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Segmented } from '@/components/ui/segmented'
import { PillBar } from '@/components/finance/PillBar'
import { fmtHUF } from '@/lib/format'

const SHORT_LABEL: Record<string, string> = {
  'Rent Income': 'Rent',
  'Food & Groceries': 'Food',
  'Eating Out': 'Eat out',
  'Subscriptions': 'Subs',
  'Emergency Fund': 'Save',
  'Phone Plan': 'Phone',
}

function sl(name: string) {
  return SHORT_LABEL[name] ?? name
}

interface CategoryBar {
  categoryId: string
  name: string
  color: string
  value: number
}

interface TrendBar {
  month: string
  net: number
}

interface Props {
  byCategory: CategoryBar[]
  trend6mo: TrendBar[]
  totalExpense: number
}

export function DashboardChartSection({ byCategory, trend6mo, totalExpense }: Props) {
  const [view, setView] = useState<'cat' | 'trend'>('cat')

  const maxCat = Math.max(...byCategory.map((b) => b.value), 1)
  const topCat = byCategory[0]
  const trendMax = Math.max(...trend6mo.map((t) => t.net), 1)

  return (
    <div className="col-span-12 sm:col-span-7 bg-card border border-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight">Expenses by category</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} · {fmtHUF(totalExpense)} total
          </div>
        </div>
        <Segmented
          options={[
            { label: 'Categories', value: 'cat' as const },
            { label: 'Net trend',  value: 'trend' as const },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === 'cat' ? (
        <div>
          <div className="grid grid-cols-7 gap-3 h-[210px] items-end px-1">
            {byCategory.slice(0, 7).map((b, i) => {
              const pct = b.value / maxCat
              const h = 30 + pct * 140
              const isMax = i === 0
              const variant =
                i === 1 || i === 4 ? 'soft'
                : i === 2 ? 'mid'
                : 'solid'
              return (
                <div key={b.categoryId} className="flex flex-col items-center gap-2.5 min-w-0">
                  <div className="relative w-full flex justify-center" style={{ height: h }}>
                    {isMax && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-card border border-border rounded-full px-2 py-0.5 shadow-pb-1 mono text-[10.5px] text-foreground whitespace-nowrap z-10">
                        {Math.round((b.value / totalExpense) * 100)}%
                      </div>
                    )}
                    <PillBar height={h} color={b.color} variant={isMax ? 'solid' : variant} />
                  </div>
                  <div className="text-[10.5px] text-muted-foreground uppercase mono tracking-wider truncate w-full text-center">
                    {sl(b.name)}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-border flex items-center gap-4 flex-wrap">
            {topCat && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: topCat.color }} />
                <span className="font-medium text-foreground">{topCat.name}</span>
                <span>leads · {fmtHUF(topCat.value)}</span>
              </div>
            )}
            <div className="ml-auto text-[11px] text-muted-foreground">
              7 of {byCategory.length} categories ·{' '}
              <Link href="/categories" className="text-foreground hover:underline">
                See all
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[210px] flex items-end justify-around gap-3">
          {trend6mo.map((t, i) => {
            const h = 30 + (t.net / trendMax) * 140
            const isLast = i === trend6mo.length - 1
            const variant =
              isLast ? 'solid'
              : i === trend6mo.length - 2 ? 'mid'
              : 'soft'
            return (
              <div key={t.month} className="flex flex-col items-center gap-2 flex-1">
                <div className="relative w-full flex justify-center" style={{ height: h }}>
                  {isLast && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-card border border-border rounded-full px-2 py-0.5 shadow-pb-1 mono text-[10.5px] z-10 whitespace-nowrap">
                      {Math.round(t.net / 1000)}k
                    </div>
                  )}
                  <PillBar height={h} color="hsl(var(--income))" variant={variant} />
                </div>
                <div className="text-[10.5px] text-muted-foreground uppercase mono tracking-wider">
                  {t.month}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
