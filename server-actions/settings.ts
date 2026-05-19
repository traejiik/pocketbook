'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function setAnchorCurrency(code: string) {
  await prisma.appSettings.update({
    where: { id: 'singleton' },
    data: { anchorCurrency: code },
  });
  revalidatePath('/', 'layout');
}

export async function setExchangeRate(input: {
  from: string;
  to: string;
  rate: number;
  mode: 'AUTO' | 'MANUAL';
}) {
  await prisma.exchangeRate.upsert({
    where: { fromCurrency_toCurrency: { fromCurrency: input.from, toCurrency: input.to } },
    update: { rate: input.rate, mode: input.mode, updatedAt: new Date() },
    create: {
      fromCurrency: input.from,
      toCurrency: input.to,
      rate: input.rate,
      mode: input.mode,
    },
  });
  revalidatePath('/', 'layout');
}

export async function addTrackedCurrency(code: string) {
  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  const anchor = settings?.anchorCurrency ?? 'HUF';

  // Create both directions at rate 1 as a placeholder (user can set manually or sync)
  await prisma.exchangeRate.upsert({
    where: { fromCurrency_toCurrency: { fromCurrency: code, toCurrency: anchor } },
    update: {},
    create: { fromCurrency: code, toCurrency: anchor, rate: 1, mode: 'MANUAL' },
  });
  revalidatePath('/settings');
}

export async function removeTrackedCurrency(from: string, to: string) {
  await prisma.exchangeRate.deleteMany({
    where: { fromCurrency: from, toCurrency: to },
  });
  revalidatePath('/settings');
}

export async function setFxAutoSync(enabled: boolean) {
  await prisma.appSettings.update({
    where: { id: 'singleton' },
    data: { fxAutoSync: enabled },
  });
}

export async function setAutoInsights(enabled: boolean) {
  await prisma.appSettings.update({
    where: { id: 'singleton' },
    data: { autoInsightsMonthly: enabled },
  });
}

export async function setOllamaModel(model: string) {
  await prisma.appSettings.update({
    where: { id: 'singleton' },
    data: { ollamaModel: model },
  });
  revalidatePath('/settings');
}

export async function changePassword(input: { current: string; next: string }) {
  const user = await prisma.user.findFirst();
  if (!user) return { error: 'No user found' };

  const valid = await bcrypt.compare(input.current, user.passwordHash);
  if (!valid) return { error: 'Current password is incorrect' };

  const hash = await bcrypt.hash(input.next, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  return { success: true };
}

export async function getDatabaseSize(): Promise<string> {
  try {
    const result = await prisma.$queryRaw<Array<{ pg_size_pretty: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database()))
    `;
    return result[0]?.pg_size_pretty ?? '—';
  } catch {
    return '—';
  }
}
