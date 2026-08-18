import { cache } from 'react';
import { prisma } from './prisma';
import { toAnchor, frozenToAnchor } from './fx';
import { CACHE_TAGS, cachedAggregation } from './cache';

export { getAnchorCurrency } from './fx';
import type { Category, RecurringRule } from '@prisma/client';

export type RuleWithCategory = RecurringRule & { category: Category };

// Each heavy read below is wrapped twice, and the layers do different jobs:
//
//   cache(...)              — React per-request memoisation. Dedupes the repeat
//                             calls a single render makes (the app layout and the
//                             dashboard both ask for 30-day renewals).
//   cachedAggregation(...)  — Next.js `unstable_cache`. Survives *between*
//                             requests until a write revalidates its tags.
//
// The `unstable_cache` layer is only applied to the reads that scan rows and then
// run a per-row async FX conversion. Single trivial queries (`getRecentTransactions`,
// `getCategories`, the AI-insight lookups) stay on React `cache` alone — routing
// a `take: 4` query through the incremental cache costs more than it saves.

type FrozenTx = { amount: number | { toString(): string }; currency: string; fxRate: unknown; fxAnchor: string | null };

// Convert a transaction to the anchor using its frozen rate (live fallback for
// legacy/null rows). Centralises the Decimal → number coercion every caller needs.
function txToAnchor(t: FrozenTx): Promise<number | null> {
  return frozenToAnchor(
    Math.abs(Number(t.amount)),
    t.currency as 'HUF' | 'USD' | 'EUR' | 'GBP',
    t.fxRate === null || t.fxRate === undefined ? null : Number(t.fxRate),
    t.fxAnchor,
  );
}

async function kpisForRange(start: Date, end: Date) {
  const txs = await prisma.transaction.findMany({
    where: { date: { gte: start, lt: end } },
  });

  let income = 0, expense = 0, savings = 0, unconvertibleCount = 0;
  for (const t of txs) {
    const amt = await txToAnchor(t);
    if (amt === null) { unconvertibleCount++; continue; }   // no FX path — surfaced, not silently dropped
    if (t.type === 'INCOME')  income  += amt;
    if (t.type === 'EXPENSE') expense += amt;
    if (t.type === 'SAVINGS') savings += amt;
  }

  const net = income - expense - savings;
  const incomeUsedPct = income > 0 ? Math.round(((expense + savings) / income) * 100) : 0;

  return { income, expense, savings, net, incomeUsedPct, unconvertibleCount };
}

// `monthKey` is a `YYYY-MM` string (e.g. AiInsight.monthCovered). Boundaries are
// UTC midnight to match how `@db.Date` columns store calendar days.
function monthKeyRange(monthKey: string): { start: Date; end: Date } {
  const [year, month] = monthKey.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

// First-of-month at UTC midnight, `offset` months from `now`. All date maths
// runs in UTC so boundaries line up with how `@db.Date` columns store calendar
// days — local-timezone constructors would slip a day in positive offsets.
function utcMonthStart(now: Date, offset: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

// The month boundaries are resolved by the callers and passed in as ISO strings so
// they land in the cache key — a range computed from `new Date()` *inside* the
// cached callback would freeze the current month into the entry.
const cachedKpisForRange = cachedAggregation(
  ['kpis-for-range'],
  [CACHE_TAGS.transactions, CACHE_TAGS.fx],
  (startIso: string, endIso: string) => kpisForRange(new Date(startIso), new Date(endIso)),
);

export const getCurrentMonthKpis = cache(async () => {
  const now = new Date();
  return cachedKpisForRange(utcMonthStart(now, 0).toISOString(), utcMonthStart(now, 1).toISOString());
});

export const getLastMonthKpis = cache(async () => {
  const now = new Date();
  return cachedKpisForRange(utcMonthStart(now, -1).toISOString(), utcMonthStart(now, 0).toISOString());
});

export const getMonthKpis = cache(async (monthKey: string) => {
  const { start, end } = monthKeyRange(monthKey);
  return cachedKpisForRange(start.toISOString(), end.toISOString());
});

async function expensesByCategoryForRange(start: Date, end: Date) {
  const txs = await prisma.transaction.findMany({
    where: { type: 'EXPENSE', date: { gte: start, lt: end } },
    include: { category: true },
  });

  const map = new Map<string, { name: string; color: string; value: number }>();
  for (const t of txs) {
    const amt = await txToAnchor(t);
    if (amt === null) continue;
    const existing = map.get(t.categoryId);
    if (existing) existing.value += amt;
    else map.set(t.categoryId, { name: t.category.name, color: t.category.color, value: amt });
  }

  return [...map.entries()]
    .map(([categoryId, d]) => ({ categoryId, ...d, value: Math.round(d.value) }))
    .sort((a, b) => b.value - a.value);
}

// Category name/colour are denormalised into the result, so category edits have to
// bust this alongside transaction writes.
const cachedExpensesByCategoryForRange = cachedAggregation(
  ['expenses-by-category-for-range'],
  [CACHE_TAGS.transactions, CACHE_TAGS.categories, CACHE_TAGS.fx],
  (startIso: string, endIso: string) => expensesByCategoryForRange(new Date(startIso), new Date(endIso)),
);

export const getExpensesByCategory = cache(async () => {
  const now = new Date();
  return cachedExpensesByCategoryForRange(
    utcMonthStart(now, 0).toISOString(),
    utcMonthStart(now, 1).toISOString(),
  );
});

export const getMonthExpensesByCategory = cache(async (monthKey: string) => {
  const { start, end } = monthKeyRange(monthKey);
  return cachedExpensesByCategoryForRange(start.toISOString(), end.toISOString());
});

// `Date` and Prisma `Decimal` do not survive the cache's JSON round-trip, so the
// cached read emits plain values and `getUpcomingRenewals` rehydrates the two
// calendar dates its callers call `Date` methods on. `amount` stays a number —
// every consumer already read it through `Number(...)`.
type SerialisedRenewalRule =
  Omit<RuleWithCategory, 'amount' | 'nextDue' | 'installmentEndsOn'> & {
    amount: number;
    nextDue: string;
    installmentEndsOn: string | null;
  };

export type UpcomingRenewalRule =
  Omit<SerialisedRenewalRule, 'nextDue' | 'installmentEndsOn'> & {
    nextDue: Date;
    installmentEndsOn: Date | null;
  };

export type UpcomingRenewal = {
  rule: UpcomingRenewalRule;
  daysAway: number;
  hufEquivalent: number | null;  // null when no FX path exists — never coerce to 0
};

async function upcomingRenewalsFrom(
  todayIso: string,
  daysAhead: number,
): Promise<{ rule: SerialisedRenewalRule; daysAway: number; hufEquivalent: number | null }[]> {
  const today = new Date(todayIso);
  const horizon = new Date(today);
  horizon.setUTCDate(today.getUTCDate() + daysAhead);

  const rules = await prisma.recurringRule.findMany({
    where: {
      kind: 'EXPENSE',
      archived: false,
      nextDue: { gte: today, lte: horizon },
    },
    include: { category: true },
    orderBy: { nextDue: 'asc' },
  });

  return Promise.all(
    rules.map(async (rule) => {
      const hufEquivalent = await toAnchor(
        Math.abs(Number(rule.amount)),
        rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP',
      );
      const daysAway = Math.round((rule.nextDue.getTime() - today.getTime()) / 86_400_000);
      return {
        rule: {
          ...rule,
          amount: Number(rule.amount),
          nextDue: rule.nextDue.toISOString(),
          installmentEndsOn: rule.installmentEndsOn ? rule.installmentEndsOn.toISOString() : null,
        },
        daysAway,
        hufEquivalent,
      };
    }),
  );
}

// Recurring converts live (rules carry no frozen rate), so this depends on FX too.
const cachedUpcomingRenewals = cachedAggregation(
  ['upcoming-renewals'],
  [CACHE_TAGS.recurring, CACHE_TAGS.categories, CACHE_TAGS.fx],
  upcomingRenewalsFrom,
);

export const getUpcomingRenewals = cache(async (daysAhead: number): Promise<UpcomingRenewal[]> => {
  const now = new Date();
  // `daysAway` is measured from today, so today's date is part of the cache key:
  // entries roll over naturally at UTC midnight instead of going stale by a day.
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const rows = await cachedUpcomingRenewals(today.toISOString(), daysAhead);

  return rows.map(({ rule, daysAway, hufEquivalent }) => ({
    rule: {
      ...rule,
      nextDue: new Date(rule.nextDue),
      installmentEndsOn: rule.installmentEndsOn ? new Date(rule.installmentEndsOn) : null,
    },
    daysAway,
    hufEquivalent,
  }));
});

export const getRecentTransactions = cache(async (limit: number) => {
  return prisma.transaction.findMany({
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: { category: true },
  });
});

// Bucket key for a `@db.Date` value. Prisma hands those back as UTC midnight, so
// reading the UTC parts is what lines a row up with the UTC month boundaries above.
function utcMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

// `latestMonthIso` is the first-of-month UTC boundary the window ends on, passed in
// by the caller so the window is pinned by the cache key rather than by `new Date()`.
//
// One query spans the whole window and the months are split in memory. Fetching
// per month inside the loop meant `months` sequential round-trips (the `await`
// suspends the loop body, so query n+1 does not leave the process until query n
// has returned) over disjoint slices of one table — the same rows, N times the
// latency.
async function monthlyTrendFrom(latestMonthIso: string, months: number) {
  const latest = new Date(latestMonthIso);
  const windowStart = utcMonthStart(latest, -(months - 1));
  const windowEnd = utcMonthStart(latest, 1);

  // Seed a slot per month up front so months with no transactions still emit a
  // zero point rather than dropping out of the chart. Insertion order is oldest →
  // newest, which is the order the chart renders in.
  const buckets = new Map<string, { month: string; net: number }>();
  for (let i = months - 1; i >= 0; i--) {
    const d = utcMonthStart(latest, -i);
    buckets.set(utcMonthKey(d), {
      month: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      net: 0,
    });
  }

  const txs = await prisma.transaction.findMany({
    where: { date: { gte: windowStart, lt: windowEnd } },
  });

  for (const t of txs) {
    const bucket = buckets.get(utcMonthKey(t.date));
    if (!bucket) continue;   // outside the window; the `where` already excludes these
    const amt = await txToAnchor(t);
    if (amt === null) continue;
    if (t.type === 'INCOME')  bucket.net += amt;
    if (t.type === 'EXPENSE') bucket.net -= amt;
    if (t.type === 'SAVINGS') bucket.net -= amt;
  }

  return [...buckets.values()].map((b) => ({ month: b.month, net: Math.round(b.net) }));
}

const cachedMonthlyTrend = cachedAggregation(
  ['monthly-trend'],
  [CACHE_TAGS.transactions, CACHE_TAGS.fx],
  monthlyTrendFrom,
);

export const getMonthlyTrend = cache(async (months: number) => {
  const now = new Date();
  return cachedMonthlyTrend(utcMonthStart(now, 0).toISOString(), months);
});

export const getRecurringRules = cache(async () => {
  return prisma.recurringRule.findMany({
    where: { archived: false },
    include: { category: true, _count: { select: { transactions: true } } },
    orderBy: { nextDue: 'asc' },
  });
});

export const getArchivedRecurringRules = cache(async () => {
  return prisma.recurringRule.findMany({
    where: { archived: true },
    include: { category: true, _count: { select: { transactions: true } } },
    orderBy: { name: 'asc' },
  });
});

export const getCategories = cache(async () => {
  return prisma.category.findMany({ orderBy: { name: 'asc' } });
});

async function categoriesWithStats() {
  const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  const txCounts = await prisma.transaction.groupBy({
    by: ['categoryId'],
    _count: { id: true },
  });
  const txSums = await prisma.transaction.findMany({
    select: { categoryId: true, amount: true, currency: true, fxRate: true, fxAnchor: true },
  });

  const countMap = new Map(txCounts.map((r) => [r.categoryId, r._count.id]));
  const sumMap = new Map<string, number>();
  for (const t of txSums) {
    const converted = await txToAnchor(t);
    if (converted === null) continue;
    const prev = sumMap.get(t.categoryId) ?? 0;
    sumMap.set(t.categoryId, prev + converted);
  }

  return cats.map((c) => ({
    ...c,
    txCount: countMap.get(c.id) ?? 0,
    txTotalHUF: Math.round(sumMap.get(c.id) ?? 0),
  }));
}

// All-time and unbounded, so this is the read that benefits most from caching as
// history grows. `Category` has no date columns, so the result is JSON-safe as-is.
const cachedCategoriesWithStats = cachedAggregation(
  ['categories-with-stats'],
  [CACHE_TAGS.transactions, CACHE_TAGS.categories, CACHE_TAGS.fx],
  categoriesWithStats,
);

export const getCategoriesWithStats = cache(() => cachedCategoriesWithStats());

export const getLastAiInsight = cache(async () => {
  return prisma.aiInsight.findFirst({ orderBy: { generatedAt: 'desc' } });
});

export const getAiInsightCount = cache(async () => {
  return prisma.aiInsight.count();
});

export type RecurringBudgetSummary = {
  monthlyIncome: number
  monthlyExpenses: number
  monthlySavings: number
  netUsable: number
  expenseRatio: number           // monthlyExpenses / monthlyIncome, clamped 0–1
  hasNormalisedAnnuals: boolean
  expensesByCategory: { categoryId: string; name: string; color: string; amount: number }[]
}

async function recurringBudgetSummary(): Promise<RecurringBudgetSummary> {
  const rules = await prisma.recurringRule.findMany({
    where: { archived: false },
    include: { category: true },
  })

  let monthlyIncome = 0, monthlyExpenses = 0, monthlySavings = 0
  let hasNormalisedAnnuals = false
  const expenseCatMap = new Map<string, { name: string; color: string; amount: number }>()

  for (const rule of rules) {
    const rawAmt = Number(rule.amount)
    const normalised = rule.cycle === 'ANNUAL' ? rawAmt / 12 : rawAmt
    const amt = await toAnchor(normalised, rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP')
    if (amt === null) continue
    if (rule.cycle === 'ANNUAL') hasNormalisedAnnuals = true
    if (rule.category.kind === 'INCOME') {
      monthlyIncome += amt
    } else if (rule.category.kind === 'EXPENSE') {
      monthlyExpenses += amt
      const existing = expenseCatMap.get(rule.categoryId)
      if (existing) existing.amount += amt
      else expenseCatMap.set(rule.categoryId, { name: rule.category.name, color: rule.category.color, amount: amt })
    } else if (rule.category.kind === 'SAVINGS') {
      monthlySavings += amt
    }
  }

  const netUsable    = monthlyIncome - monthlyExpenses - monthlySavings
  const expenseRatio = monthlyIncome > 0 ? Math.min(monthlyExpenses / monthlyIncome, 1) : 0

  const expensesByCategory = [...expenseCatMap.entries()]
    .map(([categoryId, d]) => ({ categoryId, ...d, amount: Math.round(d.amount) }))
    .sort((a, b) => b.amount - a.amount)

  return {
    monthlyIncome:   Math.round(monthlyIncome),
    monthlyExpenses: Math.round(monthlyExpenses),
    monthlySavings:  Math.round(monthlySavings),
    netUsable:       Math.round(netUsable),
    expenseRatio,
    hasNormalisedAnnuals,
    expensesByCategory,
  }
}

// Recurring rules convert at the live rate (no frozen lock), so FX moves this.
const cachedRecurringBudgetSummary = cachedAggregation(
  ['recurring-budget-summary'],
  [CACHE_TAGS.recurring, CACHE_TAGS.categories, CACHE_TAGS.fx],
  recurringBudgetSummary,
)

export const getRecurringBudgetSummary = cache(
  (): Promise<RecurringBudgetSummary> => cachedRecurringBudgetSummary(),
)
