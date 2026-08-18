'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { syncAllAutoRates } from '@/lib/frankfurter';
import { lockRate } from '@/lib/fx';
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache';
import { requireAuthenticatedUser } from '@/lib/require-auth';

const currencySchema = z.enum(['HUF', 'USD', 'EUR', 'GBP']);
const rateSchema = z.object({
  from: currencySchema,
  to: currencySchema,
  rate: z.number().positive().finite(),
  mode: z.enum(['AUTO', 'MANUAL']),
});

export async function setAnchorCurrency(code: string) {
  await requireAuthenticatedUser();
  currencySchema.parse(code);
  await prisma.appSettings.update({
    where: { id: 'singleton' },
    data: { anchorCurrency: code },
  });

  // Frozen rates are stored relative to a specific anchor, so switching the anchor
  // re-baselines every transaction to today's rate for the NEW anchor. This is the
  // one moment history re-prices; afterwards rows are frozen again. Recurring is
  // unaffected (it converts live and has no stored lock).
  const currencies = await prisma.transaction.findMany({
    distinct: ['currency'],
    select: { currency: true },
  });
  const locks = await Promise.all(
    currencies.map(async ({ currency }) => ({
      currency,
      ...(await lockRate(currency as 'HUF' | 'USD' | 'EUR' | 'GBP', code)),
    })),
  );
  await prisma.$transaction(
    locks.map((l) =>
      prisma.transaction.updateMany({
        where: { currency: l.currency },
        data: { fxRate: l.fxRate, fxAnchor: l.fxAnchor },
      }),
    ),
  );

  // The anchor moved *and* every transaction was re-locked to it, so both the FX
  // and transaction reads are now wrong.
  revalidateFinanceTags(CACHE_TAGS.fx, CACHE_TAGS.transactions);
  revalidatePath('/', 'layout');
}

export async function setExchangeRate(input: {
  from: string;
  to: string;
  rate: number;
  mode: 'AUTO' | 'MANUAL';
}) {
  await requireAuthenticatedUser();
  const { from, to, rate, mode } = rateSchema.parse(input);
  await prisma.exchangeRate.upsert({
    where: { fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to } },
    update: { rate, mode, updatedAt: new Date() },
    create: { fromCurrency: from, toCurrency: to, rate, mode },
  });
  revalidateFinanceTags(CACHE_TAGS.fx);
  revalidatePath('/', 'layout');
}

export async function addTrackedCurrency(code: string) {
  await requireAuthenticatedUser();
  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  const anchor = settings?.anchorCurrency ?? 'HUF';

  // Create both directions at rate 1 as a placeholder (user can set manually or sync)
  await prisma.exchangeRate.upsert({
    where: { fromCurrency_toCurrency: { fromCurrency: code, toCurrency: anchor } },
    update: {},
    create: { fromCurrency: code, toCurrency: anchor, rate: 1, mode: 'MANUAL' },
  });
  revalidateFinanceTags(CACHE_TAGS.fx);
  revalidatePath('/settings');
}

export async function removeTrackedCurrency(from: string, to: string) {
  await requireAuthenticatedUser();
  await prisma.exchangeRate.deleteMany({
    where: { fromCurrency: from, toCurrency: to },
  });
  revalidateFinanceTags(CACHE_TAGS.fx);
  revalidatePath('/settings');
}

export async function setFxAutoSync(enabled: boolean) {
  await requireAuthenticatedUser();
  await prisma.appSettings.update({
    where: { id: 'singleton' },
    data: { fxAutoSync: enabled },
  });
}

export async function setAutoInsights(enabled: boolean) {
  await requireAuthenticatedUser();
  await prisma.appSettings.update({
    where: { id: 'singleton' },
    data: { autoInsightsMonthly: enabled },
  });
}

export async function setOllamaModel(model: string) {
  await requireAuthenticatedUser();
  await prisma.appSettings.update({
    where: { id: 'singleton' },
    data: { ollamaModel: model },
  });
  revalidatePath('/settings');
}

export async function changePassword(input: { current: string; next: string }) {
  await requireAuthenticatedUser();
  const user = await prisma.user.findFirst();
  if (!user) return { error: 'No user found' };

  const valid = await bcrypt.compare(input.current, user.passwordHash);
  if (!valid) return { error: 'Current password is incorrect' };

  const hash = await bcrypt.hash(input.next, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  return { success: true };
}

export async function forceFxSync(): Promise<{ synced: number }> {
  await requireAuthenticatedUser();
  const synced = await syncAllAutoRates();
  revalidateFinanceTags(CACHE_TAGS.fx);
  revalidatePath('/settings');
  return { synced };
}

export async function clearAllData(): Promise<void> {
  await requireAuthenticatedUser();
  await prisma.aiInsight.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.recurringRule.deleteMany();
  await prisma.category.deleteMany();
  revalidateFinanceTags(CACHE_TAGS.transactions, CACHE_TAGS.recurring, CACHE_TAGS.categories);
  revalidatePath('/', 'layout');
}

export async function getDatabaseSize(): Promise<string> {
  await requireAuthenticatedUser();
  try {
    const result = await prisma.$queryRaw<Array<{ pg_size_pretty: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database()))
    `;
    return result[0]?.pg_size_pretty ?? '—';
  } catch {
    return '—';
  }
}
