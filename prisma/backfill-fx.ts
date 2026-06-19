// One-off backfill for the per-transaction FX lock (fxRate / fxAnchor).
//
// Run ONCE after applying the `add_transaction_fx_lock` migration. It stamps the
// CURRENT rate (for the current anchor) onto every transaction that has no lock
// yet, so existing history freezes at today's values instead of continuing to
// drift. There is no stored rate history, so today's rate is the best snapshot we
// can give old rows. Idempotent: only touches rows where fxRate IS NULL, and skips
// rows whose currency still has no FX path (they stay null → live fallback).
//
//   pnpm db:backfill-fx
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local then .env so PB_DATABASE_URL is available when run via tsx.
for (const file of ['.env.local', '.env']) {
  try {
    const contents = readFileSync(resolve(process.cwd(), file), 'utf-8');
    for (const line of contents.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0 && !line.startsWith('#')) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (k && !(k in process.env)) process.env[k] = v;
      }
    }
  } catch {
    // File may not exist — rely on the environment already set.
  }
}

type Currency = 'HUF' | 'USD' | 'EUR' | 'GBP';

async function main() {
  const { prisma } = await import('../lib/prisma');
  const { lockRate } = await import('../lib/fx');

  const rows = await prisma.transaction.findMany({
    where: { fxRate: null },
    select: { id: true, currency: true },
  });

  if (rows.length === 0) {
    console.log('Nothing to backfill — every transaction already has a locked rate.');
    return;
  }

  const lockCache = new Map<string, Awaited<ReturnType<typeof lockRate>>>();
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    let lock = lockCache.get(row.currency);
    if (!lock) {
      lock = await lockRate(row.currency as Currency);
      lockCache.set(row.currency, lock);
    }
    if (lock.fxRate === null) {
      // No FX path for this currency yet — leave null so reads fall back to live.
      skipped++;
      continue;
    }
    await prisma.transaction.update({
      where: { id: row.id },
      data: { fxRate: lock.fxRate, fxAnchor: lock.fxAnchor },
    });
    updated++;
  }

  console.log(`Backfilled ${updated} transaction(s); skipped ${skipped} with no FX path.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('../lib/prisma');
    await prisma.$disconnect();
  });
