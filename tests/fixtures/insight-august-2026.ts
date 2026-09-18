import type { InsightSnapshot } from '@/lib/insights-data'

// The real August 2026 ledger, as the notes read by hand in September were given
// it. Every "invented" case below is a figure one of those notes actually wrote.
export const august: InsightSnapshot = {
  monthKey: '2026-08',
  monthName: 'August 2026',
  anchor: 'HUF',
  kpis: {
    income: 585_140,
    expense: 468_482,
    savings: 50_000,
    net: 66_658,
    operatingNet: 116_658,
    savingsRate: 9,
    unconvertibleCount: 0,
  },
  prev: { income: 287_505, expense: 289_708, savings: 0, operatingNet: -2_203 },
  categories: [
    { name: 'Housing', value: 150_000, prevValue: 150_000 },
    { name: 'Other Expense', value: 120_734, prevValue: 7_963 },
    { name: 'Food & Groceries', value: 86_165, prevValue: 38_947 },
    { name: 'Subscriptions', value: 32_920, prevValue: 35_238 },
    { name: 'Fitness', value: 29_570, prevValue: 1_190 },
    { name: 'Eating Out', value: 21_293, prevValue: 12_920 },
  ],
  trend: [
    { month: 'Mar', net: 0 },
    { month: 'Apr', net: 0 },
    { month: 'May', net: 66_372 },
    { month: 'Jun', net: 2_416 },
    { month: 'Jul', net: -2_203 },
    { month: 'Aug', net: 66_658 },
  ],
  largest: [
    { description: 'Rent', category: 'Housing', amount: 150_000, date: '2026-08-10T00:00:00.000Z' },
    { description: 'AirPods Pro 3', category: 'Other Expense', amount: 89_897, date: '2026-08-22T00:00:00.000Z' },
    { description: 'Spar Groceries', category: 'Food & Groceries', amount: 22_201, date: '2026-08-15T00:00:00.000Z' },
  ],
  // Counts are illustrative; the largest per category follow the real ledger
  // where the notes quoted them (AirPods, Spar, Rent).
  categoryDetail: [
    { category: 'Housing', count: 1, largest: { description: 'Rent', amount: 150_000, date: '2026-08-10T00:00:00.000Z', recurring: true } },
    { category: 'Other Expense', count: 4, largest: { description: 'AirPods Pro 3', amount: 89_897, date: '2026-08-22T00:00:00.000Z', recurring: false } },
    { category: 'Food & Groceries', count: 14, largest: { description: 'Spar Groceries', amount: 22_201, date: '2026-08-15T00:00:00.000Z', recurring: false } },
    { category: 'Subscriptions', count: 6, largest: { description: 'ChatGPT Plus', amount: 8_990, date: '2026-08-05T00:00:00.000Z', recurring: true } },
    { category: 'Fitness', count: 3, largest: { description: 'Gym membership', amount: 18_900, date: '2026-08-02T00:00:00.000Z', recurring: false } },
    { category: 'Eating Out', count: 9, largest: { description: 'Dinner', amount: 6_450, date: '2026-08-19T00:00:00.000Z', recurring: false } },
  ],
  expenseCount: 42,
  upcoming: [
    { name: 'PS Plus Extra', category: 'Subscriptions', daysAway: 20, amount: 5_590 },
    { name: 'Rent', category: 'Housing', daysAway: 22, amount: 150_000 },
  ],
  installments: [],
  committed: {
    monthlyIncome: 585_140,
    monthlyExpenses: 200_871,
    monthlySavings: 50_000,
    netUsable: 0,
    expenseRatio: 0.34,
    hasNormalisedAnnuals: true,
    expensesByCategory: [],
  },
  priorNotes: [
    { monthName: 'June 2026', opening: 'Your income for June 2026 came in at 277,047 Ft, which is a stable amount.' },
  ],
  verdict: 'steady',
}
