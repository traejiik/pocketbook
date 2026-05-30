import { cache } from 'react';
import { prisma } from './prisma';

export type Currency = 'HUF' | 'USD' | 'EUR' | 'GBP';

const CURRENCIES: Currency[] = ['HUF', 'USD', 'EUR', 'GBP'];

const getAnchorCurrency = cache(async (): Promise<string> => {
  const settings = await prisma.appSettings.findFirst({ where: { id: 'singleton' } });
  return settings?.anchorCurrency ?? 'HUF';
});

// Load every stored rate once per request and index it by `${from}:${to}`.
// One query instead of one findUnique per transaction row, and it gives us the
// full set so we can triangulate cross rates that aren't stored directly.
const getRateIndex = cache(async (): Promise<Map<string, number>> => {
  const rows = await prisma.exchangeRate.findMany();
  const index = new Map<string, number>();
  for (const row of rows) {
    index.set(`${row.fromCurrency}:${row.toCurrency}`, Number(row.rate));
  }
  return index;
});

// Resolve a rate directly, or triangulate through a single pivot currency
// (e.g. EUR→USD via EUR→HUF→USD when only HUF pairs are stored). Returns null
// only when no path exists — callers must treat null as "unconvertible", never 0.
async function resolveRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  const index = await getRateIndex();

  const direct = index.get(`${from}:${to}`);
  if (direct !== undefined) return direct;

  for (const pivot of CURRENCIES) {
    if (pivot === from || pivot === to) continue;
    const leg1 = index.get(`${from}:${pivot}`);
    const leg2 = index.get(`${pivot}:${to}`);
    if (leg1 !== undefined && leg2 !== undefined) return leg1 * leg2;
  }

  return null;
}

export async function getRate(from: Currency, to: Currency): Promise<number | null> {
  return resolveRate(from, to);
}

export async function toAnchor(amount: number, from: Currency): Promise<number | null> {
  const anchor = await getAnchorCurrency();
  if (from === anchor) return amount;
  const rate = await resolveRate(from, anchor);
  return rate !== null ? amount * rate : null;
}

export async function fromAnchor(amount: number, to: Currency): Promise<number | null> {
  const anchor = await getAnchorCurrency();
  if (to === anchor) return amount;
  const rate = await resolveRate(anchor, to);
  return rate !== null ? amount * rate : null;
}
