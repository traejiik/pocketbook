import { PrismaClient, FxMode } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { importTransactions } from '../lib/import-transactions';

// Load .env.local so SEED_USER_* vars are available when run via tsx directly.
try {
  const envPath = resolve(process.cwd(), '.env.local');
  const contents = readFileSync(envPath, 'utf-8');
  for (const line of contents.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
} catch {
  // No .env.local — rely on environment already set.
}

const prisma = new PrismaClient();

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
  const existingRateCount = await prisma.exchangeRate.count();
  if (existingRateCount === 0) {
    const fxData = [
      { fromCurrency: 'HUF', toCurrency: 'USD', rate: 0.002791, mode: FxMode.AUTO, provider: 'frankfurter.app' },
      { fromCurrency: 'USD', toCurrency: 'HUF', rate: 358.40,   mode: FxMode.AUTO, provider: 'frankfurter.app' },
      { fromCurrency: 'HUF', toCurrency: 'EUR', rate: 0.002525, mode: FxMode.AUTO, provider: 'frankfurter.app' },
      { fromCurrency: 'EUR', toCurrency: 'HUF', rate: 396.10,   mode: FxMode.AUTO, provider: 'frankfurter.app' },
    ];

    for (const fx of fxData) {
      await prisma.exchangeRate.upsert({
        where: { fromCurrency_toCurrency: { fromCurrency: fx.fromCurrency, toCurrency: fx.toCurrency } },
        update: { rate: fx.rate, updatedAt: new Date() },
        create: fx,
      });
    }
    console.log('  ✓ Seeded default FX rates.');
  } else {
    console.log(`  Skipped FX seed — ${existingRateCount} rate(s) already in DB.`);
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
