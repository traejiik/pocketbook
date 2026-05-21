export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronRight, Plus, Sparkles, Settings } from 'lucide-react'
import { DashboardActions } from './DashboardActions'
import {
  getCurrentMonthKpis,
  getExpensesByCategory,
  getUpcomingRenewals,
  getRecentTransactions,
  getMonthlyTrend,
  getLastAiInsight,
  getAiInsightCount,
} from '@/lib/aggregations'
import { prisma } from '@/lib/prisma'
import { pingOllama } from '@/lib/ollama'
import { fmtHUF, fmtCur, fmtDate } from '@/lib/format'
import { KpiBig } from '@/components/finance/KpiBig'
import { GaugeMeter } from '@/components/finance/GaugeMeter'
import { DashboardChartSection } from './DashboardChartSection'
import { Badge } from '@/components/ui/badge'

export default async function DashboardPage() {
  const [kpis, byCategory, upcoming, recentTx, trend6mo, lastInsight, insightCount, settings] = await Promise.all([
    getCurrentMonthKpis(),
    getExpensesByCategory(),
    getUpcomingRenewals(30),
    getRecentTransactions(4),
    getMonthlyTrend(6),
    getLastAiInsight(),
    getAiInsightCount(),
    prisma.appSettings.findUnique({ where: { id: 'singleton' } }),
  ])

  const ollamaUrl = settings?.ollamaUrl ?? 'http://ollama:11434'
  const ollamaReachable = await pingOllama(ollamaUrl)

  const now = new Date()
  const monthLabel = now.toLocaleDateString('en-GB', { month: 'short' })
  const upcomingTotalHUF = upcoming.reduce((s, r) => s + r.hufEquivalent, 0)
  const nextRenewal = upcoming[0] ?? null
  const lastInsightDate = lastInsight
    ? lastInsight.generatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : null

  return (
    <div className="px-6 py-5 space-y-5 max-w-[1280px] mx-auto">
      {/* Page header */}
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight leading-none">Dashboard</h1>
          <div className="text-[13px] text-muted-foreground mt-2.5">Your finances at a glance.</div>
        </div>
        <DashboardActions />
      </div>

      {/* Row 1 — KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiBig label="Income"   value={kpis.income}  tone="income"   deltaPct="+4.2%" footnote="Increased from last month" href="/transactions?type=INCOME" />
        <KpiBig label="Expenses" value={kpis.expense} tone="expense"  deltaPct="−2.8%" footnote="Decreased from last month" href="/transactions?type=EXPENSE" />
        <KpiBig label="Net"      value={kpis.net}     tone="income"   deltaPct="+9.1%" footnote="Increased from last month" href="/transactions" />
        <KpiBig label="Savings"  value={kpis.savings} tone="savings"  deltaPct="On auto" footnote="Emergency Fund · weekly" href="/transactions?type=SAVINGS" />
      </div>

      {/* Row 2 + 3 in the same 12-col grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Expenses by category with Segmented toggle (client island) */}
        <DashboardChartSection
          byCategory={byCategory}
          trend6mo={trend6mo}
          totalExpense={kpis.expense}
        />

        {/* Upcoming renewals */}
        <div className="col-span-5 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Upcoming renewals</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                Next 30 days · {fmtHUF(upcomingTotalHUF)}
              </div>
            </div>
            <Link
              href="/renewals"
              className="text-[12px] inline-flex items-center gap-1.5 border border-border rounded-full pl-2 pr-2.5 py-1 hover:bg-accent"
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
                        <Badge variant="outline" className="py-0! text-[10px] text-amber-500 border-amber-500/40">
                          {rule.installmentPaid ?? 0}/{rule.installmentTotal}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right tabular text-[13px] shrink-0">
                  {fmtCur(Number(rule.amount), rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP')}
                  {rule.currency !== 'HUF' && (
                    <div className="text-[10px] text-muted-foreground">≈ {fmtHUF(hufEquivalent)}</div>
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
        <div className="col-span-5 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Recent activity</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                Last {recentTx.length} transactions
              </div>
            </div>
            <Link
              href="/transactions"
              className="text-[12px] inline-flex items-center gap-1.5 border border-border rounded-full pl-2 pr-2.5 py-1 hover:bg-accent"
            >
              <Plus className="w-3 h-3" /> View all
            </Link>
          </div>
          <div className="divide-y divide-border -mx-1">
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
                          : 'hsl(var(--foreground))',
                      }}
                    >
                      {t.type === 'INCOME' ? '+' : t.type === 'SAVINGS' ? '↓' : '−'}
                      {fmtCur(Math.abs(amtNum), t.currency as 'HUF' | 'USD' | 'EUR' | 'GBP').replace('−', '')}
                    </div>
                    <Badge
                      variant="outline"
                      className={`py-0! text-[10px]! mt-0.5 ${
                        t.type === 'INCOME'
                          ? 'text-income border-income/40'
                          : t.type === 'SAVINGS'
                          ? 'text-savings border-savings/40'
                          : 'text-expense border-expense/40'
                      }`}
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
        <div className="col-span-4 bg-card border border-border rounded-2xl p-5 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Income used</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                {fmtHUF(kpis.expense + kpis.savings)} of {fmtHUF(kpis.income)}
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
        <div className="col-span-3 flex flex-col gap-4">
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
                className="mt-3.5 w-full inline-flex items-center justify-center gap-2 h-9 rounded-full bg-primary text-primary-foreground font-medium text-[12px] hover:opacity-90 transition"
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

          {/* AI Insights dark card */}
          <div
            className="rounded-2xl p-5 relative overflow-hidden flex flex-col text-white flex-1"
            style={{ background: 'linear-gradient(150deg, #0a1a33 0%, #112a55 50%, #0c1f3d 100%)' }}
          >
            <svg
              className="absolute inset-0 w-full h-full opacity-55 pointer-events-none"
              viewBox="0 0 280 280"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <radialGradient id="ai-glow" cx="70%" cy="20%" r="80%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.75" />
                  <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>
              <rect width="280" height="280" fill="url(#ai-glow)" />
              {Array.from({ length: 6 }).map((_, i) => (
                <ellipse
                  key={i}
                  cx="220" cy="60"
                  rx={50 + i * 18} ry={36 + i * 12}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeOpacity={0.22 - i * 0.022}
                  strokeWidth="1"
                  transform={`rotate(${-25 + i * 3} 220 60)`}
                />
              ))}
            </svg>
            <div className="relative flex-1 flex flex-col">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[13.5px] font-medium text-white/85">AI Insights</div>
                  <div className="text-[10.5px] mono text-white/55 mt-0.5">{settings?.ollamaModel ?? 'No model picked'}</div>
                </div>
                <div className="flex gap-2">
                  {ollamaReachable ? (
                    <Link
                      href="/insights?generate=1"
                      title="Generate insights"
                      className="w-9 h-9 rounded-full bg-white text-[#0a1a33] flex items-center justify-center hover:scale-105 transition"
                    >
                      <Sparkles className="w-4 h-4" />
                    </Link>
                  ) : (
                    <span
                      title="Ollama endpoint unreachable"
                      className="w-9 h-9 rounded-full bg-white/15 text-white/30 flex items-center justify-center cursor-not-allowed"
                    >
                      <Sparkles className="w-4 h-4" />
                    </span>
                  )}
                  <Link
                    href="/settings"
                    title="Settings"
                    className="w-9 h-9 rounded-full bg-destructive text-white flex items-center justify-center hover:scale-105 transition"
                  >
                    <Settings className="w-4 h-4" />
                  </Link>
                </div>
              </div>
              <div className="mt-auto">
                <div className="text-[24px] font-semibold tabular tracking-tight leading-none">
                  {!ollamaReachable ? 'Unreachable' : insightCount > 0 ? insightCount : '~12s'}
                </div>
                <div className="text-[10.5px] text-white/60 mt-1">
                  {lastInsightDate ? `Last · ${lastInsightDate}` : 'No insights yet'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
