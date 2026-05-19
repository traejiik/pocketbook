import { prisma } from './prisma';

export async function fetchFrankfurterRate(from: string, to: string): Promise<number> {
  const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`Frankfurter: ${res.status}`);
  const json = await res.json() as { rates: Record<string, number> };
  const rate = json.rates[to];
  if (rate === undefined) throw new Error(`No rate for ${from}→${to}`);
  return rate;
}

export async function syncAllAutoRates(): Promise<number> {
  const rates = await prisma.exchangeRate.findMany({ where: { mode: 'AUTO' } });
  let synced = 0;

  for (const r of rates) {
    try {
      const rate = await fetchFrankfurterRate(r.fromCurrency, r.toCurrency);
      await prisma.exchangeRate.update({
        where: { id: r.id },
        data: { rate, updatedAt: new Date(), provider: 'frankfurter.app' },
      });
      synced++;
    } catch (e) {
      console.error(`FX sync failed for ${r.fromCurrency}→${r.toCurrency}`, e);
    }
  }

  return synced;
}
