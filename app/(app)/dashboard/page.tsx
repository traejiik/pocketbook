export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronRight, Sparkles, ArrowRight, CalendarDays, TriangleAlert } from 'lucide-react'
import {
  getCurrentMonthKpis,
  getLastMonthKpis,
  getExpensesByCategory,
  getLastMonthExpensesByCategory,
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
import { CalmCard, CalmCardHead } from '@/components/finance/CalmCard'
import { CategoryAvatar } from '@/components/finance/CategoryAvatar'
import { DashboardChartSection } from './DashboardChartSection'

export default async function DashboardPage() {
  // Fetch settings first so pingOllama can start as soon as the URL is known,
  // overlapping with the remaining DB queries rather than running serially after them.
  const settingsPromise = prisma.appSettings.findUnique({ where: { id: 'singleton' } })
  const pingPromise = settingsPromise.then(s => pingOllama(s?.ollamaUrl ?? 'http://ollama:11434'))

  const [kpis, lastKpis, byCategory, lastMonthByCategory, upcoming, recentTx, trend6mo, lastInsight, insightCount, settings, ollamaReachable] = await Promise.all([
    getCurrentMonthKpis(),
    getLastMonthKpis(),
    getExpensesByCategory(),
    getLastMonthExpensesByCategory(),
    getUpcomingRenewals(30),
    getRecentTransactions(4),
    getMonthlyTrend(6),
    getLastAiInsight(),
    getAiInsightCount(),
    settingsPromise,
    pingPromise,
  ])

  const anchor = settings?.anchorCurrency ?? 'HUF'

  function kpiDelta(curr: number, prev: number) {
    if (prev === 0) return null;
    const pct = ((curr - prev) / prev) * 100;
    return { label: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, up: pct >= 0 };
  }

  const incomeDelta = kpiDelta(kpis.income, lastKpis.income)
  const expenseDelta = kpiDelta(kpis.expense, lastKpis.expense)
  const netDelta = kpiDelta(kpis.net, lastKpis.net)
  const savingsDelta = kpiDelta(kpis.savings, lastKpis.savings)

  function deltaFootnote(d: { up: boolean } | null) {
    if (!d) return 'No prior data';
    return d.up ? 'Increased from last month' : 'Decreased from last month';
  }

  const now = new Date()
  const monthLabel = now.toLocaleDateString('en-GB', { month: 'short' })
  const monthLong = now.toLocaleDateString('en-GB', { month: 'long' })
  const upcomingTotalHUF = upcoming.reduce((s, r) => s + (r.hufEquivalent ?? 0), 0)
  const nextRenewal = upcoming[0] ?? null
  const lastInsightDate = lastInsight
    ? lastInsight.generatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : null

  return (
    <div className="px-4 lg:px-7 pb-9 pt-1 space-y-4 max-w-[1320px] mx-auto">
      {/* Unconvertible-currency notice — totals exclude rows with no FX path */}
      {kpis.unconvertibleCount > 0 && (
        <div className="calm-card px-4 py-3 text-[12.5px] flex items-start gap-2.5">
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

      {/* KPI row — 2-up on mobile, four-up from tablet (matches v5 tablet prototype) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiBig label="Income" value={kpis.income} tone="income" deltaPct={incomeDelta?.label ?? '—'} footnote={deltaFootnote(incomeDelta)} currency={anchor} />
        <KpiBig label="Expenses" value={kpis.expense} tone="expense" deltaPct={expenseDelta?.label ?? '—'} footnote={deltaFootnote(expenseDelta)} currency={anchor} />
        <KpiBig label="Net" value={kpis.net} tone="income" deltaPct={netDelta?.label ?? '—'} footnote={deltaFootnote(netDelta)} currency={anchor} />
        <KpiBig label="Savings" value={kpis.savings} tone="savings" deltaPct={savingsDelta?.label ?? '—'} footnote={deltaFootnote(savingsDelta)} currency={anchor} />
      </div>

      {/* 12-col grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Expenses by category (client island) */}
        <DashboardChartSection
          byCategory={byCategory}
          lastMonthByCategory={lastMonthByCategory}
          trend6mo={trend6mo}
          totalExpense={kpis.expense}
          anchorCurrency={anchor}
        />

        {/* Upcoming renewals */}
        <CalmCard className="col-span-12 md:col-span-6 lg:col-span-5 md:order-3 lg:order-none p-6">
          <CalmCardHead
            title="Upcoming renewals"
            sub={`Next 30 days · ${fmtAnchor(upcomingTotalHUF, anchor)}`}
            right={
              <Link href="/renewals" className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors">
                <span className="md:hidden">All</span>
                <span className="hidden md:inline">View all</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            }
          />
          <div className="mt-3">
            {upcoming.slice(0, 6).map(({ rule, daysAway, hufEquivalent }, i) => (
              <div
                key={rule.id}
                className={`items-center gap-3 py-[9.5px] ${i >= 4 ? 'hidden md:flex' : 'flex'} ${i ? 'border-t border-border/40' : ''}`}
              >
                <div className="w-9 h-9 rounded-[10px] bg-secondary/70 flex flex-col items-center justify-center shrink-0">
                  <div className="text-[8.5px] text-muted-foreground uppercase mono leading-none">
                    {rule.nextDue.toLocaleDateString('en-GB', { month: 'short' })}
                  </div>
                  <div className="text-[12.5px] font-semibold leading-none mt-0.5 tabular">
                    {rule.nextDue.getDate()}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{rule.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: rule.category.color }} />
                    <span>{rule.category.name}</span>
                    <span className="opacity-50">·</span>
                    <span>in {daysAway} day{daysAway === 1 ? '' : 's'}</span>
                    {rule.installmentTotal && (
                      <span className="renewal-badge mono text-[10px] tabular rounded-full px-1.5 py-px leading-none">
                        {rule.installmentPaid ?? 0}/{rule.installmentTotal}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right tabular text-[13px] shrink-0">
                  {fmtCur(Number(rule.amount), rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP')}
                  {rule.currency !== anchor && hufEquivalent !== null && (
                    <div className="text-[10.5px] text-muted-foreground">≈ {fmtAnchor(hufEquivalent, anchor)}</div>
                  )}
                </div>
              </div>
            ))}
            {upcoming.length === 0 && (
              <div className="py-6 text-center text-[12px] text-muted-foreground">
                No renewals in the next 30 days
              </div>
            )}
          </div>
        </CalmCard>

        {/* Recent activity */}
        <CalmCard className="col-span-12 md:col-span-6 lg:col-span-5 md:order-4 lg:order-none p-6">
          <CalmCardHead
            title="Recent activity"
            sub={`Last ${recentTx.length} transactions`}
            right={
              <>
                <span className="md:hidden text-[11px] text-muted-foreground">{monthLong}</span>
                <Link href="/transactions" className="hidden md:inline-flex text-[12px] text-muted-foreground hover:text-foreground items-center gap-1 transition-colors">
                  View all <ChevronRight className="w-3 h-3" />
                </Link>
              </>
            }
          />
          <div className="mt-3">
            {recentTx.length === 0 && (
              <div className="py-6 text-center text-[12px] text-muted-foreground">
                No transactions this month
              </div>
            )}
            {recentTx.map((t: (typeof recentTx)[number], i: number) => {
              const amtNum = Number(t.amount)
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 py-[9.5px] ${i ? 'border-t border-border/40' : ''}`}
                >
                  <CategoryAvatar name={t.category.name} color={t.category.color} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{t.description}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      <span>{t.category.name}</span>
                      <span className="mx-1.5 opacity-50">·</span>
                      <span className="mono">{fmtDate(t.date.toISOString().split('T')[0], { short: true })}</span>
                    </div>
                  </div>
                  <div
                    className="tabular text-[13px] font-medium shrink-0"
                    style={{
                      color:
                        t.type === 'INCOME'
                          ? 'hsl(var(--income))'
                          : t.type === 'SAVINGS'
                          ? 'hsl(var(--savings))'
                          : 'hsl(var(--foreground) / 0.85)',
                    }}
                  >
                    {t.type === 'INCOME' ? '+' : t.type === 'SAVINGS' ? '↓' : '−'}
                    {fmtCur(Math.abs(amtNum), t.currency as 'HUF' | 'USD' | 'EUR' | 'GBP').replace('−', '')}
                  </div>
                </div>
              )
            })}
          </div>
        </CalmCard>

        {/* Income used — gauge (mobile: right under the KPIs; tablet/desktop keep their slots) */}
        <CalmCard className="col-span-12 md:col-span-6 lg:col-span-4 order-first md:order-2 lg:order-none p-6 flex flex-col">
          <CalmCardHead
            title="Income used"
            sub={`${fmtAnchor(kpis.expense + kpis.savings, anchor)} of ${fmtAnchor(kpis.income, anchor)}`}
            right={
              <span className="mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground bg-secondary/80 rounded-full px-2.5 py-1">
                {monthLabel}
              </span>
            }
          />
          <div className="flex-1 flex items-center justify-center">
            <GaugeMeter percent={kpis.incomeUsedPct} />
          </div>
          <div className="flex items-center justify-center gap-5">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-income" />
              Used
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="w-3 h-2.5 rounded-sm"
                style={{
                  background: 'repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.35) 0 2px, transparent 2px 5px)',
                  border: '1px solid hsl(var(--border))',
                }}
              />
              Remaining
            </span>
          </div>
        </CalmCard>

        {/* Reminder + AI Insights — side-by-side pair on tablet, stacked rail on desktop */}
        <div className="col-span-12 lg:col-span-3 md:order-5 lg:order-none flex flex-col gap-4 md:grid md:grid-cols-2 lg:flex lg:flex-col">
          {nextRenewal ? (
            <CalmCard className="p-6 flex flex-col">
              <div className="md:hidden text-[11.5px] text-muted-foreground">Reminder · Next renewal</div>
              <div className="hidden md:block text-[11.5px] text-muted-foreground">Reminder</div>
              <div className="hidden md:block text-[14.5px] font-semibold tracking-tight mt-1">Next renewal</div>
              <div className="mt-2 md:mt-4 text-[14px] font-semibold tracking-tight text-primary leading-snug">
                {nextRenewal.rule.name}
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-1.5 tabular">
                {fmtDate(nextRenewal.rule.nextDue.toISOString().split('T')[0], { short: true })} · in {nextRenewal.daysAway}d · {fmtCur(Number(nextRenewal.rule.amount), nextRenewal.rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP')}
              </div>
              <Link
                href="/renewals"
                className="mt-5 w-full inline-flex items-center justify-center gap-2 h-11 lg:h-9 rounded-[12px] lg:rounded-[10px] bg-primary text-primary-foreground font-medium text-[13px] lg:text-[12px] hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <CalendarDays className="w-3.5 h-3.5" /> View renewals
              </Link>
            </CalmCard>
          ) : (
            <CalmCard className="p-6 flex flex-col">
              <div className="text-[11.5px] text-muted-foreground">Reminder</div>
              <div className="text-[14px] font-semibold mt-2">No upcoming renewals</div>
              <div className="text-[11.5px] text-muted-foreground mt-1">Nothing due in the next 30 days.</div>
            </CalmCard>
          )}

          {/* AI Insights card — model top-right; body adapts the real insight state (no fake commentary) */}
          <CalmCard className="p-6 flex flex-col flex-1">
            <div className="flex items-center gap-2">
              <span className="text-primary"><Sparkles className="w-[18px] h-[18px]" /></span>
              <span className="text-[14.5px] font-semibold tracking-tight">AI Insights</span>
              <span className="mono text-[10.5px] text-muted-foreground ml-auto">{settings?.ollamaModel ?? 'No model picked'}</span>
            </div>
            <div className="text-[12.5px] text-muted-foreground mt-3 leading-relaxed flex-1">
              {!ollamaReachable
                ? 'The Ollama endpoint is unreachable. Configure it in Settings to start generating insights.'
                : insightCount > 0
                ? `${insightCount} insight${insightCount === 1 ? '' : 's'} generated so far${lastInsightDate ? ` · last on ${lastInsightDate}` : ''}. Generate fresh commentary on where the money went.`
                : 'No insights generated yet. Generate fresh commentary on where the money went.'}
            </div>
            {ollamaReachable ? (
              <Link
                href="/insights?generate=1"
                className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 lg:h-9 rounded-[12px] lg:rounded-[10px] bg-secondary/90 hover:bg-secondary text-foreground font-medium text-[13px] lg:text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Generate <ArrowRight className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
              </Link>
            ) : (
              <Link
                href="/settings#ai-insights"
                className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 lg:h-9 rounded-[12px] lg:rounded-[10px] border border-border font-medium text-[13px] lg:text-[12px] hover:bg-accent transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Configure Ollama
              </Link>
            )}
          </CalmCard>
        </div>
      </div>
    </div>
  )
}
