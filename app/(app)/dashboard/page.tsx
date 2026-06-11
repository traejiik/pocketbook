export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronRight, Plus, Settings, TriangleAlert } from 'lucide-react'
import { DashboardActions } from './DashboardActions'
import {
  getCurrentMonthKpis,
  getLastMonthKpis,
  getExpensesByCategory,
  getUpcomingRenewals,
  getRecentTransactions,
  getMonthlyTrend,
  getLastAiInsight,
  getAiInsightCount,
} from '@/lib/aggregations'
import { prisma } from '@/lib/prisma'
import { pingOllama } from '@/lib/ollama'
import { fmtAnchor, fmtCur, fmtDate } from '@/lib/format'
import { KpiBig } from '@/components/finance/KpiBig'
import { GaugeMeter } from '@/components/finance/GaugeMeter'
import { DashboardChartSection } from './DashboardChartSection'
import { Badge } from '@/components/ui/badge'

export default async function DashboardPage() {
  // Fetch settings first so pingOllama can start as soon as the URL is known,
  // overlapping with the remaining DB queries rather than running serially after them.
  const settingsPromise = prisma.appSettings.findUnique({ where: { id: 'singleton' } })
  const pingPromise = settingsPromise.then(s => pingOllama(s?.ollamaUrl ?? 'http://ollama:11434'))

  const [kpis, lastKpis, byCategory, upcoming, recentTx, trend6mo, lastInsight, insightCount, settings, ollamaReachable] = await Promise.all([
    getCurrentMonthKpis(),
    getLastMonthKpis(),
    getExpensesByCategory(),
    getUpcomingRenewals(30),
    getRecentTransactions(4),
    getMonthlyTrend(6),
    getLastAiInsight(),
    getAiInsightCount(),
    settingsPromise,
    pingPromise,
  ])

  const ollamaUrl = settings?.ollamaUrl ?? 'http://ollama:11434'
  const anchor = settings?.anchorCurrency ?? 'HUF'

  function kpiDelta(curr: number, prev: number) {
    if (prev === 0) return null;
    const pct = ((curr - prev) / prev) * 100;
    return { label: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, up: pct >= 0 };
  }

  const incomeDelta  = kpiDelta(kpis.income,  lastKpis.income)
  const expenseDelta = kpiDelta(kpis.expense, lastKpis.expense)
  const netDelta     = kpiDelta(kpis.net,     lastKpis.net)
  const savingsDelta = kpiDelta(kpis.savings, lastKpis.savings)

  function deltaFootnote(d: { up: boolean } | null) {
    if (!d) return 'No prior data';
    return d.up ? 'Increased from last month' : 'Decreased from last month';
  }

  const now = new Date()
  const monthLabel = now.toLocaleDateString('en-GB', { month: 'short' })
  const upcomingTotalHUF = upcoming.reduce((s, r) => s + (r.hufEquivalent ?? 0), 0)
  const nextRenewal = upcoming[0] ?? null
  const lastInsightDate = lastInsight
    ? lastInsight.generatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : null

  return (
    <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5 max-w-[1280px] mx-auto">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight leading-none">Dashboard</h1>
          <div className="text-[13px] text-muted-foreground mt-2.5">Your finances at a glance.</div>
        </div>
        <DashboardActions />
      </div>

      {/* Unconvertible-currency notice — totals exclude rows with no FX path */}
      {kpis.unconvertibleCount > 0 && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-[12.5px] flex items-start gap-2.5">
          <TriangleAlert className="w-4 h-4 shrink-0 text-expense mt-0.5" />
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">
              {kpis.unconvertibleCount} transaction{kpis.unconvertibleCount === 1 ? '' : 's'} this month
              {' '}couldn&apos;t be converted to {anchor}.
            </span>{' '}
            The totals below exclude {kpis.unconvertibleCount === 1 ? 'it' : 'them'} — add a rate in{' '}
            <Link href="/settings#currencies" className="text-foreground underline underline-offset-2">Settings</Link>.
          </span>
        </div>
      )}

      {/* Row 1 — KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiBig label="Income"   value={kpis.income}  tone="income"  deltaPct={incomeDelta?.label  ?? '—'} footnote={deltaFootnote(incomeDelta)}  href="/transactions?type=INCOME"  currency={anchor} />
        <KpiBig label="Expenses" value={kpis.expense} tone="expense" deltaPct={expenseDelta?.label ?? '—'} footnote={deltaFootnote(expenseDelta)} href="/transactions?type=EXPENSE" currency={anchor} />
        <KpiBig label="Net"      value={kpis.net}     tone="income"  deltaPct={netDelta?.label     ?? '—'} footnote={deltaFootnote(netDelta)}     href="/transactions"              currency={anchor} />
        <KpiBig label="Savings"  value={kpis.savings} tone="savings" deltaPct={savingsDelta?.label ?? '—'} footnote={deltaFootnote(savingsDelta)} href="/transactions?type=SAVINGS" currency={anchor} />
      </div>

      {/* Row 2 + 3 in the same 12-col grid */}
      <div className="grid grid-cols-12 gap-3 sm:gap-4">
        {/* Expenses by category with Segmented toggle (client island) */}
        <DashboardChartSection
          byCategory={byCategory}
          trend6mo={trend6mo}
          totalExpense={kpis.expense}
          anchorCurrency={anchor}
        />

        {/* Upcoming renewals */}
        <div className="col-span-12 md:col-span-6 lg:col-span-5 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Upcoming renewals</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                Next 30 days · {fmtAnchor(upcomingTotalHUF, anchor)}
              </div>
            </div>
            <Link
              href="/renewals"
              className="text-[12px] inline-flex items-center gap-1.5 border border-border rounded-full pl-2 pr-2.5 py-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border -mx-1">
            {upcoming.slice(0, 6).map(({ rule, daysAway, hufEquivalent }) => (
              <div key={rule.id} className="flex items-center gap-3 px-1 py-2.5">
                <div className="w-9 h-9 rounded-md border border-border bg-secondary/40 flex flex-col items-center justify-center shrink-0">
                  <div className="text-[8.5px] text-muted-foreground uppercase mono leading-none">
                    {rule.nextDue.toLocaleDateString('en-GB', { month: 'short' })}
                  </div>
                  <div className="text-[12.5px] font-semibold leading-none mt-0.5">
                    {rule.nextDue.getDate()}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{rule.name}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: rule.category.color }} />
                    <span>{rule.category.name}</span>
                    <span className="text-border">·</span>
                    <span>in {daysAway} day{daysAway === 1 ? '' : 's'}</span>
                    {rule.installmentTotal && (
                      <>
                        <span className="text-border">·</span>
                        <Badge kind="warning" className="py-0! text-[10px]!">
                          {rule.installmentPaid ?? 0}/{rule.installmentTotal}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right tabular text-[13px] shrink-0">
                  {fmtCur(Number(rule.amount), rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP')}
                  {rule.currency !== anchor && hufEquivalent !== null && (
                    <div className="text-[10px] text-muted-foreground">≈ {fmtAnchor(hufEquivalent, anchor)}</div>
                  )}
                </div>
              </div>
            ))}
            {upcoming.length === 0 && (
              <div className="px-1 py-6 text-center text-[12px] text-muted-foreground">
                No renewals in the next 30 days
              </div>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="col-span-12 md:col-span-6 lg:col-span-5 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Recent activity</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                Last {recentTx.length} transactions
              </div>
            </div>
            <Link
              href="/transactions"
              className="text-[12px] inline-flex items-center gap-1.5 border border-border rounded-full pl-2 pr-2.5 py-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Plus className="w-3 h-3" /> View all
            </Link>
          </div>
          <div className="divide-y divide-border -mx-1">
            {recentTx.length === 0 && (
              <div className="px-1 py-6 text-center text-[12px] text-muted-foreground">
                No transactions this month
              </div>
            )}
            {recentTx.map((t: (typeof recentTx)[number]) => {
              const initials = t.category.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')
              const amtNum = Number(t.amount)
              return (
                <div key={t.id} className="flex items-center gap-3 px-1 py-2.5">
                  <div
                    className="w-9 h-9 rounded-full border border-border flex items-center justify-center shrink-0"
                    style={{ background: `${t.category.color}20`, color: t.category.color }}
                  >
                    <span className="text-[11px] font-bold mono">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{t.description}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      <span>{t.category.name}</span>
                      <span className="mx-1.5 text-border">·</span>
                      <span className="mono">{fmtDate(t.date.toISOString().split('T')[0], { short: true })}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="tabular text-[13px] font-semibold"
                      style={{
                        color: t.type === 'INCOME'
                          ? 'hsl(var(--income))'
                          : t.type === 'SAVINGS'
                          ? 'hsl(var(--savings))'
                          : 'hsl(var(--expense))',
                      }}
                    >
                      {t.type === 'INCOME' ? '+' : t.type === 'SAVINGS' ? '↓' : '−'}
                      {fmtCur(Math.abs(amtNum), t.currency as 'HUF' | 'USD' | 'EUR' | 'GBP').replace('−', '')}
                    </div>
                    <Badge
                      kind={t.type === 'INCOME' ? 'income' : t.type === 'SAVINGS' ? 'savings' : 'expense'}
                      className="py-0! text-[10px]! mt-0.5"
                    >
                      {t.type === 'INCOME' ? 'Income' : t.type === 'SAVINGS' ? 'Saved' : 'Spent'}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Income used — Gauge */}
        <div className="col-span-12 md:col-span-6 lg:col-span-4 bg-card border border-border rounded-2xl p-5 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Income used</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                {fmtAnchor(kpis.expense + kpis.savings, anchor)} of {fmtAnchor(kpis.income, anchor)}
              </div>
            </div>
            <span className="text-[10.5px] mono uppercase tracking-wider text-muted-foreground bg-secondary border border-border rounded-full px-2 py-0.5">
              {monthLabel}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center -my-2">
            <GaugeMeter percent={kpis.incomeUsedPct} />
          </div>
          <div className="flex items-center justify-center gap-5 mt-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-income" />
              Used
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="w-3 h-2.5 rounded-sm"
                style={{
                  background: 'repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/0.35) 0 2px, transparent 2px 5px)',
                  border: '1px solid hsl(var(--border))',
                }}
              />
              Remaining
            </span>
          </div>
        </div>

        {/* Right stack: Reminder + AI Insights */}
        <div className="col-span-12 md:col-span-6 lg:col-span-3 flex flex-col gap-4">
          {nextRenewal ? (
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col">
              <div className="text-[12.5px] text-muted-foreground">Reminder</div>
              <div className="text-[16px] font-semibold tracking-tight leading-tight mt-1">Next renewal</div>
              <div className="mt-3 text-[15px] font-semibold tracking-tight leading-snug text-primary">
                {nextRenewal.rule.name}
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-1.5 tabular">
                {fmtDate(nextRenewal.rule.nextDue.toISOString().split('T')[0], { short: true })} · in {nextRenewal.daysAway}d · {fmtCur(Number(nextRenewal.rule.amount), nextRenewal.rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP')}
              </div>
              <Link
                href="/renewals"
                className="mt-3.5 w-full inline-flex items-center justify-center gap-2 h-9 rounded-full bg-primary text-primary-foreground font-medium text-[12px] hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                View renewals
              </Link>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col">
              <div className="text-[12.5px] text-muted-foreground">Reminder</div>
              <div className="text-[14px] font-semibold mt-2">No upcoming renewals</div>
              <div className="text-[11.5px] text-muted-foreground mt-1">Nothing due in the next 30 days.</div>
            </div>
          )}

          {/* AI Insights card */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col flex-1">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12.5px] text-muted-foreground">AI Insights</div>
                <div className="text-[10.5px] mono text-muted-foreground mt-0.5">{settings?.ollamaModel ?? 'No model picked'}</div>
              </div>
              <Link
                href="/settings#ai-insights"
                title="AI settings"
                aria-label="AI settings"
                className="-mr-1 -mt-1 w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Settings className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="mt-auto">
              <div className="text-[24px] font-semibold tabular tracking-tight leading-none">
                {!ollamaReachable ? 'Unreachable' : insightCount > 0 ? insightCount : '~12s'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {!ollamaReachable
                  ? 'Ollama endpoint unreachable'
                  : lastInsightDate ? `Last · ${lastInsightDate}` : 'No insights yet'}
              </div>
              {ollamaReachable ? (
                <Link
                  href="/insights?generate=1"
                  className="mt-3.5 w-full inline-flex items-center justify-center gap-2 h-9 rounded-full bg-primary text-primary-foreground font-medium text-[12px] hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  Generate insight
                </Link>
              ) : (
                <Link
                  href="/settings#ai-insights"
                  className="mt-3.5 w-full inline-flex items-center justify-center gap-2 h-9 rounded-full border border-border font-medium text-[12px] hover:bg-accent transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  Configure Ollama
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
