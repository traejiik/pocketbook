import { cache } from 'react';
import { prisma } from './prisma';
import { toAnchor } from './fx';
import type { Category, RecurringRule } from '@prisma/client';

export type RuleWithCategory = RecurringRule & { category: Category };

export const getCurrentMonthKpis = cache(async () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const txs = await prisma.transaction.findMany({
    where: { date: { gte: start, lt: end } },
  });

  let income = 0, expense = 0, savings = 0;
  for (const t of txs) {
    const amt = await toAnchor(Math.abs(Number(t.amount)), t.currency as 'HUF' | 'USD' | 'EUR' | 'GBP');
    if (t.type === 'INCOME')  income  += amt;
    if (t.type === 'EXPENSE') expense += amt;
    if (t.type === 'SAVINGS') savings += amt;
  }

  const net = income - expense - savings;
  const incomeUsedPct = income > 0 ? Math.round(((expense + savings) / income) * 100) : 0;

  return { income, expense, savings, net, incomeUsedPct };
});

export const getExpensesByCategory = cache(async () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const txs = await prisma.transaction.findMany({
    where: { type: 'EXPENSE', date: { gte: start, lt: end } },
    include: { category: true },
  });

  const map = new Map<string, { name: string; color: string; value: number }>();
  for (const t of txs) {
    const amt = await toAnchor(Math.abs(Number(t.amount)), t.currency as 'HUF' | 'USD' | 'EUR' | 'GBP');
    const existing = map.get(t.categoryId);
    if (existing) existing.value += amt;
    else map.set(t.categoryId, { name: t.category.name, color: t.category.color, value: amt });
  }

  return [...map.entries()]
    .map(([categoryId, d]) => ({ categoryId, ...d, value: Math.round(d.value) }))
    .sort((a, b) => b.value - a.value);
});

export const getUpcomingRenewals = cache(async (daysAhead: number) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + daysAhead);

  const rules = await prisma.recurringRule.findMany({
    where: {
      kind: 'EXPENSE',
      archived: false,
      nextDue: { gte: today, lte: horizon },
    },
    include: { category: true },
    orderBy: { nextDue: 'asc' },
  });

  const results = await Promise.all(
    rules.map(async (rule) => {
      const hufEquivalent = await toAnchor(
        Math.abs(Number(rule.amount)),
        rule.currency as 'HUF' | 'USD' | 'EUR' | 'GBP',
      );
      const daysAway = Math.round((rule.nextDue.getTime() - today.getTime()) / 86_400_000);
      return { rule, daysAway, hufEquivalent };
    }),
  );

  return results;
});

export const getRecentTransactions = cache(async (limit: number) => {
  return prisma.transaction.findMany({
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: { category: true },
  });
});

export const getMonthlyTrend = cache(async (months: number) => {
  const results: { month: string; net: number }[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label = d.toLocaleDateString('en-GB', { month: 'short' });

    const txs = await prisma.transaction.findMany({
      where: { date: { gte: d, lt: next } },
    });

    let net = 0;
    for (const t of txs) {
      const amt = await toAnchor(Math.abs(Number(t.amount)), t.currency as 'HUF' | 'USD' | 'EUR' | 'GBP');
      if (t.type === 'INCOME')  net += amt;
      if (t.type === 'EXPENSE') net -= amt;
      if (t.type === 'SAVINGS') net -= amt;
    }
    results.push({ month: label, net: Math.round(net) });
  }

  return results;
});

export const getRecurringRules = cache(async () => {
  return prisma.recurringRule.findMany({
    where: { archived: false },
    include: { category: true },
    orderBy: { nextDue: 'asc' },
  });
});

export const getCategories = cache(async () => {
  return prisma.category.findMany({ orderBy: { name: 'asc' } });
});

export const getCategoriesWithStats = cache(async () => {
  const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  const txCounts = await prisma.transaction.groupBy({
    by: ['categoryId'],
    _count: { id: true },
  });
  const txSums = await prisma.transaction.findMany({ select: { categoryId: true, amount: true, currency: true } });

  const countMap = new Map(txCounts.map((r) => [r.categoryId, r._count.id]));
  const sumMap = new Map<string, number>();
  for (const t of txSums) {
    const prev = sumMap.get(t.categoryId) ?? 0;
    sumMap.set(t.categoryId, prev + Math.abs(Number(t.amount)));
  }

  return cats.map((c) => ({
    ...c,
    txCount: countMap.get(c.id) ?? 0,
    txTotalHUF: Math.round(sumMap.get(c.id) ?? 0),
  }));
});

export const getLastAiInsight = cache(async () => {
  return prisma.aiInsight.findFirst({ orderBy: { generatedAt: 'desc' } });
});

export const getAiInsightCount = cache(async () => {
  return prisma.aiInsight.count();
});
