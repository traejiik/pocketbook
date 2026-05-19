import { cache } from 'react';
import { prisma } from './prisma';

export type Currency = 'HUF' | 'USD' | 'EUR' | 'GBP';

const getAnchorCurrency = cache(async (): Promise<string> => {
  const settings = await prisma.appSettings.findFirst({ where: { id: 'singleton' } });
  return settings?.anchorCurrency ?? 'HUF';
});

const getRateFromDB = cache(async (from: string, to: string): Promise<number> => {
  if (from === to) return 1;
  const row = await prisma.exchangeRate.findUnique({
    where: { fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to } },
  });
  return row ? Number(row.rate) : 1;
});

export async function getRate(from: Currency, to: Currency): Promise<number> {
  return getRateFromDB(from, to);
}

export async function toAnchor(amount: number, from: Currency): Promise<number> {
  const anchor = await getAnchorCurrency();
  if (from === anchor) return amount;
  const rate = await getRateFromDB(from, anchor);
  return amount * rate;
}

export async function fromAnchor(amount: number, to: Currency): Promise<number> {
  const anchor = await getAnchorCurrency();
  if (to === anchor) return amount;
  const rate = await getRateFromDB(anchor, to);
  return amount * rate;
}
