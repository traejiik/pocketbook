import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

// The dashboard chart is a client island rendered from server data, so these pin the
// contract in source: what the page hands over, and what each state renders.
const source = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8')

describe('dashboard chart card: empty month and net trend', () => {
  const chart = source('app/(app)/dashboard/DashboardChartSection.tsx')
  const page = source('app/(app)/dashboard/page.tsx')

  test("the page hands last month's breakdown to the chart alongside this month's", () => {
    expect(page).toContain('getLastMonthExpensesByCategory()')
    expect(page).toContain('lastMonthByCategory={lastMonthByCategory}')
  })

  test('an empty month keeps the chart footprint: resting hatch pills, a day count and Add expense', () => {
    expect(chart).toContain('Nothing spent yet')
    expect(chart).toContain('`Day ${now.getDate()} of ${daysInMonth}`')
    expect(chart).toContain('<PillBar color={GHOST} variant="hatch" />')
    expect(chart).toContain('led last month')
    expect(chart).toContain('Add expense')
    expect(chart).toContain('useTransactionSheet')
    // The grid keeps the same 212px column and footer rhythm whether or not there is data
    expect(chart).toContain('relative grid grid-cols-4 gap-6 h-[212px] items-end px-2 max-w-[640px]')
    // The old one-liner is gone on both tiers
    expect(chart).not.toContain('No expenses this month')
  })

  test('net trend labels every month, colours by sign and draws row-less months as placeholders', () => {
    expect(chart).toContain('fmtCompact(t.net, anchorCurrency, { signed: true })')
    expect(chart).toContain('net < 0 ? EXPENSE : INCOME')
    expect(chart).toContain("variant={!hasData ? 'hatch' : isLast ? 'mid' : 'solid'}")
    expect(chart).toContain('so far ·')
    expect(chart).toContain('-month avg ·')
    // Trend bars stop short of the column so their labels never leave it
    expect(chart).toContain('const TREND_RANGE = 150')
  })
})
