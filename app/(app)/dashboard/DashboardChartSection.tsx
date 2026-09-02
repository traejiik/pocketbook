'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import { HATCH_BACKGROUND, PillBar } from '@/components/finance/PillBar'
import { CalmCard, CalmCardHead } from '@/components/finance/CalmCard'
import { useTransactionSheet } from '@/contexts/sheet-context'
import { fmtAnchor, fmtCompact } from '@/lib/format'

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
  /** Rows in the month. `0` means "no data yet", drawn as a placeholder rather than a zero bar. */
  count: number
}

interface Props {
  byCategory: CategoryBar[]
  /** Last month's breakdown — labels the resting chart while this month has no expenses. */
  lastMonthByCategory: CategoryBar[]
  trend6mo: TrendBar[]
  totalExpense: number
  anchorCurrency?: string
}

type PillVariant = 'solid' | 'mid' | 'hatch'

function catVariant(i: number): PillVariant {
  return i === 0 ? 'solid' : i === 2 ? 'hatch' : 'mid'
}

const INCOME = 'hsl(var(--income))'
const EXPENSE = 'hsl(var(--expense))'
// Hatch pills ignore the colour; this keeps the ghost bars honest if the variant ever changes.
const GHOST = 'hsl(var(--muted-foreground))'

// Every bar rests at 30px; the largest grows through the range on top of that. The
// trend range is shorter because its value labels sit above the bars inside the
// same 212px column, where the category chart parks its one chip on top of the bar.
const REST = 30
const CAT_RANGE = 174
const TREND_RANGE = 150

function AddExpenseButton({ onClick, className }: { onClick: () => void; className: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 bg-secondary/90 hover:bg-secondary text-foreground font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${className}`}
    >
      <Plus className="w-3.5 h-3.5" /> Add expense
    </button>
  )
}

export function DashboardChartSection({
  byCategory,
  lastMonthByCategory,
  trend6mo,
  totalExpense,
  anchorCurrency = 'HUF',
}: Props) {
  const [view, setView] = useState<'cat' | 'trend'>('cat')
  const { openNew } = useTransactionSheet()

  const topCats = byCategory.slice(0, 4)
  const maxCat = Math.max(...topCats.map((b) => b.value), 1)
  const topCat = byCategory[0]
  const isEmpty = topCats.length === 0
  const now = new Date()
  const monthYear = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const monthLong = now.toLocaleDateString('en-GB', { month: 'long' })
  const sub = `${monthYear} · ${fmtAnchor(totalExpense, anchorCurrency)} total`
  const catCount = byCategory.length
  const topLabel = catCount > topCats.length ? `Top ${topCats.length} of ${catCount}` : null

  // Empty month: the day count explains the blank, last month's top four label the
  // resting bars, and the chart keeps its footprint so the grid does not shift on the 1st.
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayLine = `Day ${now.getDate()} of ${daysInMonth}`
  const ghostCats = lastMonthByCategory.slice(0, 4)
  const lastLead = lastMonthByCategory[0]

  // Net trend: bar height is the magnitude against the largest month that has rows;
  // the sign is carried by colour and by the signed label above every bar. The
  // current month is partial, so it is drawn at half opacity and summed "so far".
  const trendMax = Math.max(...trend6mo.filter((t) => t.count > 0).map((t) => Math.abs(t.net)), 0)
  const current = trend6mo[trend6mo.length - 1]
  const completed = trend6mo.slice(0, -1).filter((t) => t.count > 0)
  const avgNet =
    completed.length > 0 ? Math.round(completed.reduce((s, t) => s + t.net, 0) / completed.length) : null
  const tone = (net: number) => (net < 0 ? EXPENSE : INCOME)

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
        {isEmpty ? (
          <>
            <div className="mt-5 text-center">
              <div className="text-[13px] font-medium">Nothing spent yet</div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                {dayLine} · your first expense will show up here
              </div>
            </div>
            <AddExpenseButton onClick={openNew} className="mt-4 w-full h-11 rounded-[12px] text-[13px]" />
            {ghostCats.length > 0 && (
              <div className="mt-5 space-y-3">
                {ghostCats.map((b) => (
                  <div key={b.categoryId}>
                    <div className="flex items-center gap-2 text-[12px] mb-1.5">
                      <span className="w-2 h-2 rounded-full border border-border shrink-0" />
                      <span className="font-medium text-muted-foreground truncate">{b.name}</span>
                    </div>
                    <div className="h-2.5 rounded-full border border-border" style={{ background: HATCH_BACKGROUND }} />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {topLabel && (
              <div className="mt-4 text-[11px] mono uppercase tracking-[0.12em] text-muted-foreground">{topLabel}</div>
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
            </div>
          </>
        )}
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
            <div className="relative grid grid-cols-4 gap-6 h-[212px] items-end px-2 max-w-[640px]">
              {isEmpty && (
                <div className="absolute inset-x-0 top-6 z-10 flex flex-col items-center text-center">
                  <div className="text-[13px] font-medium">Nothing spent yet</div>
                  <div className="mt-1 text-[12px] text-muted-foreground">
                    {dayLine} · your first expense of the month will show up here
                  </div>
                  <AddExpenseButton onClick={openNew} className="mt-4 h-9 rounded-[10px] px-3.5 text-[12px]" />
                </div>
              )}
              {isEmpty
                ? Array.from({ length: 4 }, (_, i) => {
                    const ghost = ghostCats[i]
                    return (
                      <div key={ghost?.categoryId ?? i} className="flex flex-col items-center gap-3 min-w-0">
                        <div className="relative w-full max-w-[104px] h-[212px] flex justify-center">
                          <div className="absolute bottom-0 w-full flex justify-center" style={{ height: REST }}>
                            <PillBar color={GHOST} variant="hatch" />
                          </div>
                        </div>
                        <div className="text-[10.5px] text-muted-foreground uppercase mono tracking-[0.1em] truncate w-full text-center">
                          {ghost ? sl(ghost.name) : ' '}
                        </div>
                      </div>
                    )
                  })
                : topCats.map((b, i) => {
                    const h = REST + (b.value / maxCat) * CAT_RANGE
                    const isMax = i === 0
                    return (
                      <div key={b.categoryId} className="flex flex-col items-center gap-3 min-w-0">
                        <div className="relative w-full max-w-[104px] h-[212px] flex justify-center">
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
            <div className="mt-11 pt-4 border-t border-border/45 flex items-center gap-2 text-[11.5px] text-muted-foreground">
              {isEmpty
                ? lastLead && (
                    <>
                      <span className="w-2 h-2 rounded-full" style={{ background: lastLead.color }} />
                      <span className="font-medium text-foreground">{lastLead.name}</span>
                      <span>
                        led last month · <span className="tabular">{fmtAnchor(lastLead.value, anchorCurrency)}</span>
                      </span>
                    </>
                  )
                : topCat && (
                    <>
                      <span className="w-2 h-2 rounded-full" style={{ background: topCat.color }} />
                      <span className="font-medium text-foreground">{topCat.name}</span>
                      <span>
                        leads · <span className="tabular">{fmtAnchor(topCat.value, anchorCurrency)}</span>
                      </span>
                    </>
                  )}
              {topLabel && (
                <span className="ml-auto mono text-[11px] uppercase tracking-[0.12em]">{topLabel}</span>
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
          <div className="mt-6 pt-9">
            <div className="flex items-end gap-5 h-[212px] px-2 max-w-[640px]">
              {trend6mo.map((t, i) => {
                const isLast = i === trend6mo.length - 1
                const hasData = t.count > 0
                const h = hasData && trendMax > 0 ? REST + (Math.abs(t.net) / trendMax) * TREND_RANGE : REST
                return (
                  <div key={t.month} className="flex flex-col items-center gap-3 flex-1 min-w-0">
                    <div className="relative w-full max-w-[64px] h-[212px] flex justify-center">
                      {hasData && (
                        <div
                          className={`absolute left-1/2 -translate-x-1/2 mono tabular text-[10.5px] whitespace-nowrap z-10 ${
                            isLast ? 'bg-secondary rounded-full px-2.5 py-1' : 'text-muted-foreground'
                          }`}
                          style={{ bottom: h + 8 }}
                        >
                          {fmtCompact(t.net, anchorCurrency, { signed: true })}
                        </div>
                      )}
                      <div className="absolute bottom-0 w-full flex justify-center" style={{ height: h }}>
                        <PillBar
                          color={hasData ? tone(t.net) : GHOST}
                          variant={!hasData ? 'hatch' : isLast ? 'mid' : 'solid'}
                        />
                      </div>
                    </div>
                    <div className="text-[10.5px] text-muted-foreground uppercase mono tracking-[0.1em]">{t.month}</div>
                  </div>
                )
              })}
            </div>
            <div className="mt-11 pt-4 border-t border-border/45 flex items-center gap-2 text-[11.5px] text-muted-foreground">
              {current && (
                <>
                  {current.count > 0 ? (
                    <span className="w-2 h-2 rounded-full" style={{ background: tone(current.net) }} />
                  ) : (
                    <span className="w-2 h-2 rounded-full border border-border" />
                  )}
                  <span className="font-medium text-foreground">{monthLong}</span>
                  <span>
                    so far · <span className="tabular">{fmtAnchor(current.net, anchorCurrency, { signed: true })}</span>
                  </span>
                </>
              )}
              {avgNet !== null && (
                <span className="ml-auto">
                  {completed.length}-month avg ·{' '}
                  <span className="tabular text-foreground">{fmtAnchor(avgNet, anchorCurrency, { signed: true })}</span>
                </span>
              )}
            </div>
          </div>
        )}
      </CalmCard>
    </>
  )
}
