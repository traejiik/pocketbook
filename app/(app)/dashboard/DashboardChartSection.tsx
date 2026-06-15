'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import { PillBar } from '@/components/finance/PillBar'
import { CalmCard, CalmCardHead } from '@/components/finance/CalmCard'
import { fmtAnchor } from '@/lib/format'

const SHORT_LABEL: Record<string, string> = {
  'Rent Income': 'Rent',
  'Food & Groceries': 'Food',
  'Eating Out': 'Eat out',
  Subscriptions: 'Subs',
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
  anchorCurrency?: string
}

type PillVariant = 'solid' | 'mid' | 'hatch'

function catVariant(i: number): PillVariant {
  return i === 0 ? 'solid' : i === 2 ? 'hatch' : 'mid'
}

export function DashboardChartSection({ byCategory, trend6mo, totalExpense, anchorCurrency = 'HUF' }: Props) {
  const [view, setView] = useState<'cat' | 'trend'>('cat')

  const topCats = byCategory.slice(0, 4)
  const maxCat = Math.max(...topCats.map((b) => b.value), 1)
  const topCat = byCategory[0]
  const trendMax = Math.max(...trend6mo.map((t) => t.net), 1)

  return (
    <CalmCard className="col-span-12 lg:col-span-7 p-6">
      <CalmCardHead
        title="Expenses by category"
        sub={`${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} · ${fmtAnchor(totalExpense, anchorCurrency)} total`}
        right={
          <Segmented
            options={[
              { label: 'Categories', value: 'cat' as const },
              { label: 'Net trend', value: 'trend' as const },
            ]}
            value={view}
            onChange={setView}
          />
        }
      />

      {view === 'cat' ? (
        <div className="mt-6">
          <div className="grid grid-cols-4 gap-6 h-[220px] items-end px-2 max-w-[640px]">
            {topCats.map((b, i) => {
              const h = 30 + (b.value / maxCat) * 182
              const isMax = i === 0
              return (
                <div key={b.categoryId} className="flex flex-col items-center gap-3 min-w-0">
                  <div
                    className="relative w-full max-w-[104px] flex justify-center"
                    style={{ height: h }}
                  >
                    {isMax && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-secondary rounded-full px-2.5 py-1 mono text-[10.5px] whitespace-nowrap z-10">
                        {Math.round((b.value / totalExpense) * 100)}%
                      </div>
                    )}
                    <PillBar color={b.color} variant={catVariant(i)} />
                  </div>
                  <div className="text-[10.5px] text-muted-foreground uppercase mono tracking-[0.1em] truncate w-full text-center">
                    {sl(b.name)}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-6 pt-4 border-t border-border/45 flex items-center gap-2 text-[11.5px] text-muted-foreground">
            {topCat && (
              <>
                <span className="w-2 h-2 rounded-full" style={{ background: topCat.color }} />
                <span className="font-medium text-foreground">{topCat.name}</span>
                <span>leads · {fmtAnchor(topCat.value, anchorCurrency)}</span>
              </>
            )}
            <Link
              href="/categories"
              className="ml-auto inline-flex items-center gap-1 text-foreground/80 hover:text-foreground transition-colors"
            >
              See all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 h-[252px] flex items-end gap-5 px-2 max-w-[640px]">
          {trend6mo.map((t, i) => {
            const h = 30 + (t.net / trendMax) * 182
            const isLast = i === trend6mo.length - 1
            return (
              <div key={t.month} className="flex flex-col items-center gap-3 flex-1">
                <div className="relative w-full max-w-[64px] flex justify-center" style={{ height: h }}>
                  {isLast && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-secondary rounded-full px-2.5 py-1 mono text-[10.5px] z-10">
                      {Math.round(t.net / 1000)}k
                    </div>
                  )}
                  <PillBar color="hsl(var(--income))" variant={isLast ? 'solid' : 'mid'} />
                </div>
                <div className="text-[10.5px] text-muted-foreground uppercase mono tracking-[0.1em]">
                  {t.month}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CalmCard>
  )
}
