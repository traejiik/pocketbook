import { PrismaClient, CategoryKind, RecurringCycle, FxMode } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

  // ── Categories ────────────────────────────────────────────────────────────
  const categoryData = [
    { id: 'rent_in',   name: 'Rent Income',      color: '#3FBF7F', kind: CategoryKind.INCOME  },
    { id: 'allowance', name: 'Allowance',         color: '#5AA3FF', kind: CategoryKind.INCOME  },
    { id: 'plasma',    name: 'Plasma',            color: '#C58CFF', kind: CategoryKind.INCOME  },
    { id: 'housing',   name: 'Housing',           color: '#FF8A65', kind: CategoryKind.EXPENSE },
    { id: 'food',      name: 'Food & Groceries',  color: '#F5B544', kind: CategoryKind.EXPENSE },
    { id: 'subs',      name: 'Subscriptions',     color: '#6FB8FF', kind: CategoryKind.EXPENSE },
    { id: 'transit',   name: 'Transit',           color: '#7BD3B3', kind: CategoryKind.EXPENSE },
    { id: 'eating',    name: 'Eating Out',        color: '#E36F8E', kind: CategoryKind.EXPENSE },
    { id: 'fitness',   name: 'Fitness',           color: '#A4D453', kind: CategoryKind.EXPENSE },
    { id: 'phone',     name: 'Phone Plan',        color: '#9C8CFF', kind: CategoryKind.EXPENSE },
    { id: 'misc',      name: 'Misc',              color: '#8E97A8', kind: CategoryKind.EXPENSE },
    { id: 'emergency', name: 'Emergency Fund',    color: '#4FB3E0', kind: CategoryKind.SAVINGS },
  ];

  for (const cat of categoryData) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: { name: cat.name, color: cat.color, kind: cat.kind },
      create: cat,
    });
  }
  console.log(`  ✓ Categories: ${categoryData.length} rows`);

  // ── AppSettings ───────────────────────────────────────────────────────────
  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      anchorCurrency: 'HUF',
      ollamaUrl: 'http://ollama:11434',
      ollamaModel: 'llama3.1:8b',
      fxAutoSync: true,
      autoInsightsMonthly: true,
    },
  });
  console.log('  ✓ AppSettings: singleton');

  // ── Exchange Rates ────────────────────────────────────────────────────────
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
  console.log(`  ✓ ExchangeRates: ${fxData.length} rows`);

  // ── Recurring Rules ───────────────────────────────────────────────────────
  const recurringData = [
    { id: 'rec_rent',    name: 'Rent — Bartók Béla út',  amount: 148000, currency: 'HUF', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-01'), kind: CategoryKind.EXPENSE, categoryId: 'housing' },
    { id: 'rec_mobile',  name: 'Mobile contract',         amount:  20045, currency: 'HUF', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-04'), kind: CategoryKind.EXPENSE, categoryId: 'phone',   installmentPaid: 9, installmentTotal: 15, installmentEndsOn: new Date('2026-07-04') },
    { id: 'rec_gym',     name: 'FitBalance Gym',          amount:  14990, currency: 'HUF', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-08'), kind: CategoryKind.EXPENSE, categoryId: 'fitness' },
    { id: 'rec_chatgpt', name: 'ChatGPT Plus',            amount:     20, currency: 'USD', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-06'), kind: CategoryKind.EXPENSE, categoryId: 'subs' },
    { id: 'rec_claude',  name: 'Claude Pro',              amount:     20, currency: 'USD', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-05'), kind: CategoryKind.EXPENSE, categoryId: 'subs' },
    { id: 'rec_ps',      name: 'PS Plus Essential',       amount:   3590, currency: 'HUF', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-13'), kind: CategoryKind.EXPENSE, categoryId: 'subs' },
    { id: 'rec_yt',      name: 'YouTube Premium',         amount:   2990, currency: 'HUF', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-10'), kind: CategoryKind.EXPENSE, categoryId: 'subs' },
    { id: 'rec_apple',   name: 'Apple Music',             amount:   1990, currency: 'HUF', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-12'), kind: CategoryKind.EXPENSE, categoryId: 'subs' },
    { id: 'rec_spotify', name: 'Spotify Family',          amount:   2490, currency: 'HUF', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-04'), kind: CategoryKind.EXPENSE, categoryId: 'subs' },
    { id: 'rec_google',  name: 'Google One 200GB',        amount:    990, currency: 'HUF', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-15'), kind: CategoryKind.EXPENSE, categoryId: 'subs' },
    { id: 'rec_hevy',    name: 'Hevy Pro',                amount:    899, currency: 'HUF', cycle: RecurringCycle.ANNUAL,  nextDue: new Date('2027-05-08'), kind: CategoryKind.EXPENSE, categoryId: 'fitness' },
    { id: 'rec_kick',    name: 'Kickresume',              amount:     19, currency: 'EUR', cycle: RecurringCycle.ANNUAL,  nextDue: new Date('2026-11-22'), kind: CategoryKind.EXPENSE, categoryId: 'subs' },
    { id: 'rec_jb',      name: 'JetBrains All Products',  amount:     69, currency: 'EUR', cycle: RecurringCycle.ANNUAL,  nextDue: new Date('2026-09-01'), kind: CategoryKind.EXPENSE, categoryId: 'subs' },
    { id: 'rec_rentin',  name: 'Tenant rent — apt 4B',    amount: 180000, currency: 'HUF', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-01'), kind: CategoryKind.INCOME,  categoryId: 'rent_in' },
    { id: 'rec_allow',   name: 'Allowance',               amount: 100000, currency: 'HUF', cycle: RecurringCycle.MONTHLY, nextDue: new Date('2026-06-03'), kind: CategoryKind.INCOME,  categoryId: 'allowance' },
  ];

  for (const rule of recurringData) {
    const { installmentPaid, installmentTotal, installmentEndsOn, ...base } = rule as typeof rule & {
      installmentPaid?: number;
      installmentTotal?: number;
      installmentEndsOn?: Date;
    };
    await prisma.recurringRule.upsert({
      where: { id: rule.id },
      update: { ...base, installmentPaid, installmentTotal, installmentEndsOn },
      create: { ...base, installmentPaid, installmentTotal, installmentEndsOn },
    });
  }
  console.log(`  ✓ RecurringRules: ${recurringData.length} rows`);

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
