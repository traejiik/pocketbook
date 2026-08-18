import { PrismaClient, FxMode } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { importTransactions } from '../lib/import-transactions';

// Load .env.local then .env so SEED_USER_* and PB_DATABASE_URL are available when
// run via tsx directly. `.env` matters because that is where PB_DATABASE_URL
// actually lives (see .env.example); reading only .env.local made `pnpm db:seed`
// fail locally for anyone who never created that optional override file.
// Earlier files win, and real environment variables win over both.
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

const connectionString = process.env.PB_DATABASE_URL;
if (!connectionString) {
  throw new Error('PB_DATABASE_URL must be set to run the seed script');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  console.log('Seeding database…');

  // ── User ──────────────────────────────────────────────────────────────────
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  if (!email || !password) throw new Error('SEED_USER_EMAIL and SEED_USER_PASSWORD must be set');

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });
  console.log(`  ✓ User: ${email}`);

  // ── AppSettings ───────────────────────────────────────────────────────────
  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      anchorCurrency: 'HUF',
      ollamaUrl: process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434',
      ollamaModel: 'llama3.1:8b',
      fxAutoSync: true,
      autoInsightsMonthly: true,
    },
  });
  console.log('  ✓ AppSettings: singleton');

  // ── Exchange Rates ────────────────────────────────────────────────────────
  // Every declared currency (USD/EUR/GBP) needs a HUF pair so it is convertible
  // to the anchor. Missing pairs make transactions in that currency drop out of
  // every aggregation (toAnchor → null), so all three ship with defaults.
  const fxData = [
    { fromCurrency: 'HUF', toCurrency: 'USD', rate: 0.002791, mode: FxMode.AUTO, provider: 'frankfurter.dev' },
    { fromCurrency: 'USD', toCurrency: 'HUF', rate: 358.40,   mode: FxMode.AUTO, provider: 'frankfurter.dev' },
    { fromCurrency: 'HUF', toCurrency: 'EUR', rate: 0.002525, mode: FxMode.AUTO, provider: 'frankfurter.dev' },
    { fromCurrency: 'EUR', toCurrency: 'HUF', rate: 396.10,   mode: FxMode.AUTO, provider: 'frankfurter.dev' },
    { fromCurrency: 'HUF', toCurrency: 'GBP', rate: 0.002174, mode: FxMode.AUTO, provider: 'frankfurter.dev' },
    { fromCurrency: 'GBP', toCurrency: 'HUF', rate: 460.00,   mode: FxMode.AUTO, provider: 'frankfurter.dev' },
  ];

  const existingRateCount = await prisma.exchangeRate.count();
  if (existingRateCount === 0) {
    // Fresh database: seed every pair with its starting rate.
    for (const fx of fxData) {
      await prisma.exchangeRate.upsert({
        where: { fromCurrency_toCurrency: { fromCurrency: fx.fromCurrency, toCurrency: fx.toCurrency } },
        update: { rate: fx.rate, updatedAt: new Date() },
        create: fx,
      });
    }
    console.log('  ✓ Seeded default FX rates.');
  } else {
    // Existing database: backfill any missing pair (e.g. GBP on a pre-GBP DB)
    // create-only, so a live synced or manually overridden rate is never clobbered.
    for (const fx of fxData) {
      await prisma.exchangeRate.upsert({
        where: { fromCurrency_toCurrency: { fromCurrency: fx.fromCurrency, toCurrency: fx.toCurrency } },
        update: {},
        create: fx,
      });
    }
    console.log(`  Kept ${existingRateCount} existing FX rate(s); backfilled any missing pairs.`);
  }

  // ── Savings category ──────────────────────────────────────────────────────
  const existingSavingsCat = await prisma.category.findFirst({ where: { kind: 'SAVINGS' } })
  if (!existingSavingsCat) {
    await prisma.category.create({ data: { name: 'Savings', color: '#10b981', kind: 'SAVINGS' } })
    console.log('  ✓ Seeded Savings category')
  } else {
    console.log('  Skipped Savings category — already exists.')
  }

  // Run CSV importer if /seed/transactions.csv exists
  const csvPath = resolve(process.cwd(), 'seed', 'transactions.csv');
  if (existsSync(csvPath)) {
    console.log('  Running CSV importer…');
    const csv = readFileSync(csvPath, 'utf-8');
    const { imported, skipped, errors } = await importTransactions(csv);
    console.log(`  CSV import: ${imported} inserted, ${skipped} skipped.`);
    if (errors.length > 0) errors.forEach(e => console.warn('  ', e));
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
