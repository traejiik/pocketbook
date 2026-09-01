import { prisma } from './prisma';
import { logger } from './logger';

const log = logger('fx');

export async function fetchFrankfurterRate(from: string, to: string): Promise<number> {
  const res = await fetch(`https://api.frankfurter.dev/v2/rate/${from}/${to}`);
  if (!res.ok) throw new Error(`Frankfurter: ${res.status}`);
  const json = await res.json() as { rate: number };
  if (json.rate === undefined) throw new Error(`No rate for ${from}→${to}`);
  return json.rate;
}

export async function syncAllAutoRates(): Promise<number> {
  const rates = await prisma.exchangeRate.findMany({ where: { mode: 'AUTO' } });
  let synced = 0;

  for (const r of rates) {
    const pair = `${r.fromCurrency}/${r.toCurrency}`;
    try {
      const rate = await fetchFrankfurterRate(r.fromCurrency, r.toCurrency);
      await prisma.exchangeRate.update({
        where: { id: r.id },
        data: { rate, updatedAt: new Date(), provider: 'frankfurter.dev' },
      });
      log.debug('rate updated', { pair, rate, previous: Number(r.rate) });
      synced++;
    } catch (err) {
      // One failing pair must not abandon the rest, so this is a warning rather
      // than a throw — but a pair that keeps failing is why a total looks stale.
      log.warn('rate update failed', { pair, err });
    }
  }

  return synced;
}
