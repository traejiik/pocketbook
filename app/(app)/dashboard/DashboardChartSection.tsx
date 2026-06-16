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
  const monthYear = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const sub = `${monthYear} · ${fmtAnchor(totalExpense, anchorCurrency)} total`
  const catCount = byCategory.length
  const topLabel = catCount > topCats.length ? `Top ${topCats.length} of ${catCount}` : null

  return (
    <>
      {/* Mobile + tablet — horizontal category bars, no Net-trend toggle (matches v5 mobile/tablet prototype) */}
      <CalmCard className="col-span-12 md:col-span-6 lg:hidden p-6">
        <CalmCardHead
          title="Expenses by category"
          sub={sub}
          right={
            <Link
              href="/categories"
              className="hidden md:inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              See all <ChevronRight className="w-3 h-3" />
            </Link>
          }
        />
        {topLabel && (
          <div className="mt-4 text-[10px] mono uppercase tracking-[0.12em] text-muted-foreground">{topLabel}</div>
        )}
        <div className={`${topLabel ? 'mt-3' : 'mt-5'} space-y-3`}>
          {topCats.map((b) => {
            const pct = Math.round((b.value / totalExpense) * 100)
            return (
              <div key={b.categoryId}>
                <div className="flex items-center justify-between text-[12px] mb-1.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                    <span className="font-medium truncate">{b.name}</span>
                  </span>
                  <span className="tabular text-muted-foreground shrink-0 ml-2">
                    {fmtAnchor(b.value, anchorCurrency)} <span className="text-foreground/45">· {pct}%</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden bg-secondary">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(b.value / maxCat) * 100}%`, background: b.color }}
                  />
                </div>
              </div>
            )
          })}
          {topCats.length === 0 && (
            <div className="py-6 text-center text-[12px] text-muted-foreground">No expenses this month</div>
          )}
        </div>
      </CalmCard>

      {/* Desktop — vertical pill bars with Categories / Net-trend toggle */}
      <CalmCard className="hidden lg:block col-span-12 lg:col-span-7 p-6">
        <CalmCardHead
          title="Expenses by category"
          sub={sub}
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
          <div className="mt-6 pt-9">
            <div className="grid grid-cols-4 gap-6 h-[212px] items-end px-2 max-w-[640px]">
              {topCats.map((b, i) => {
                const h = 30 + (b.value / maxCat) * 174
                const isMax = i === 0
                return (
                  <div key={b.categoryId} className="flex flex-col items-center gap-3 min-w-0">
                    <div
                      className="relative w-full max-w-[104px] h-[212px] flex justify-center"
                    >
                      {isMax && (
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-secondary rounded-full px-2.5 py-1 mono text-[10.5px] whitespace-nowrap z-10">
                          {Math.round((b.value / totalExpense) * 100)}%
                        </div>
                      )}
                      <div className="absolute bottom-0 w-full flex justify-center" style={{ height: h }}>
                        <PillBar color={b.color} variant={catVariant(i)} />
                      </div>
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
              {topLabel && (
                <span className="ml-auto mono text-[10px] uppercase tracking-[0.12em]">{topLabel}</span>
              )}
              <Link
                href="/categories"
                className={`${topLabel ? 'ml-3' : 'ml-auto'} inline-flex items-center gap-1 text-foreground/80 hover:text-foreground transition-colors`}
              >
                See all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 pt-9 h-[252px] flex items-end gap-5 px-2 max-w-[640px]">
            {trend6mo.map((t, i) => {
              const h = 30 + (t.net / trendMax) * 174
              const isLast = i === trend6mo.length - 1
              return (
                <div key={t.month} className="flex flex-col items-center gap-3 flex-1">
                  <div className="relative w-full max-w-[64px] h-[212px] flex justify-center">
                    {isLast && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-secondary rounded-full px-2.5 py-1 mono text-[10.5px] z-10">
                        {Math.round(t.net / 1000)}k
                      </div>
                    )}
                    <div className="absolute bottom-0 w-full flex justify-center" style={{ height: h }}>
                      <PillBar color="hsl(var(--income))" variant={isLast ? 'solid' : 'mid'} />
                    </div>
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
    </>
  )
}
