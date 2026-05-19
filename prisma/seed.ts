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

  // ── Sample Transactions (May 2026) ────────────────────────────────────────
  // Ported from design-reference/mockups/source/data.jsx.
  // Amounts are signed: positive = income, negative = expense/savings.
  const txData = [
    { id: 't01', date: new Date('2026-05-01'), description: 'Tenant rent — apt 4B',           amount:  180000, currency: 'HUF', type: 'INCOME',  categoryId: 'rent_in',   recurringRuleId: 'rec_rentin' },
    { id: 't02', date: new Date('2026-05-01'), description: 'Rent — Bartók Béla út',          amount: -148000, currency: 'HUF', type: 'EXPENSE', categoryId: 'housing',   recurringRuleId: 'rec_rent' },
    { id: 't03', date: new Date('2026-05-02'), description: 'Spar — weekly groceries',        amount:  -14820, currency: 'HUF', type: 'EXPENSE', categoryId: 'food' },
    { id: 't04', date: new Date('2026-05-03'), description: 'Allowance — parents',            amount:  100000, currency: 'HUF', type: 'INCOME',  categoryId: 'allowance', recurringRuleId: 'rec_allow' },
    { id: 't05', date: new Date('2026-05-04'), description: 'Spotify Family',                 amount:   -2490, currency: 'HUF', type: 'EXPENSE', categoryId: 'subs',      recurringRuleId: 'rec_spotify' },
    { id: 't06', date: new Date('2026-05-04'), description: 'Mobile contract — installment 9/15', amount: -20045, currency: 'HUF', type: 'EXPENSE', categoryId: 'phone',   recurringRuleId: 'rec_mobile' },
    { id: 't07', date: new Date('2026-05-05'), description: 'Anthropic — Claude Pro',         amount:     -20, currency: 'USD', type: 'EXPENSE', categoryId: 'subs',      recurringRuleId: 'rec_claude' },
    { id: 't08', date: new Date('2026-05-06'), description: 'OpenAI — ChatGPT Plus',          amount:     -20, currency: 'USD', type: 'EXPENSE', categoryId: 'subs',      recurringRuleId: 'rec_chatgpt' },
    { id: 't09', date: new Date('2026-05-06'), description: 'BKK monthly pass',               amount:   -9500, currency: 'HUF', type: 'EXPENSE', categoryId: 'transit' },
    { id: 't10', date: new Date('2026-05-07'), description: 'Plasma — May visit 1',           amount:   12000, currency: 'HUF', type: 'INCOME',  categoryId: 'plasma' },
    { id: 't11', date: new Date('2026-05-08'), description: 'Gym — FitBalance',               amount:  -14990, currency: 'HUF', type: 'EXPENSE', categoryId: 'fitness',   recurringRuleId: 'rec_gym' },
    { id: 't12', date: new Date('2026-05-08'), description: 'Hevy — annual',                  amount:    -899, currency: 'HUF', type: 'EXPENSE', categoryId: 'fitness',   recurringRuleId: 'rec_hevy' },
    { id: 't13', date: new Date('2026-05-09'), description: 'Pizza Manufaktúra',              amount:   -5990, currency: 'HUF', type: 'EXPENSE', categoryId: 'eating' },
    { id: 't14', date: new Date('2026-05-10'), description: 'YouTube Premium',                amount:   -2990, currency: 'HUF', type: 'EXPENSE', categoryId: 'subs',      recurringRuleId: 'rec_yt' },
    { id: 't15', date: new Date('2026-05-12'), description: 'Lidl',                           amount:   -9210, currency: 'HUF', type: 'EXPENSE', categoryId: 'food' },
    { id: 't16', date: new Date('2026-05-12'), description: 'Apple Music',                    amount:   -1990, currency: 'HUF', type: 'EXPENSE', categoryId: 'subs',      recurringRuleId: 'rec_apple' },
    { id: 't17', date: new Date('2026-05-13'), description: 'PS Plus Essential',              amount:   -3590, currency: 'HUF', type: 'EXPENSE', categoryId: 'subs',      recurringRuleId: 'rec_ps' },
    { id: 't18', date: new Date('2026-05-14'), description: 'Plasma — May visit 2',           amount:   12000, currency: 'HUF', type: 'INCOME',  categoryId: 'plasma' },
    { id: 't19', date: new Date('2026-05-14'), description: 'Coffee — Magvető Café',          amount:   -1450, currency: 'HUF', type: 'EXPENSE', categoryId: 'eating' },
    { id: 't20', date: new Date('2026-05-15'), description: 'Spar',                           amount:  -11340, currency: 'HUF', type: 'EXPENSE', categoryId: 'food' },
    { id: 't21', date: new Date('2026-05-15'), description: 'Google One 200GB',               amount:    -990, currency: 'HUF', type: 'EXPENSE', categoryId: 'subs',      recurringRuleId: 'rec_google' },
    { id: 't22', date: new Date('2026-05-16'), description: 'Emergency fund — auto-save',     amount:  -25000, currency: 'HUF', type: 'SAVINGS', categoryId: 'emergency' },
    { id: 't23', date: new Date('2026-05-17'), description: 'Bolt — late night',              amount:   -2800, currency: 'HUF', type: 'EXPENSE', categoryId: 'transit' },
    { id: 't24', date: new Date('2026-05-17'), description: 'Plasma — May visit 3',           amount:   12000, currency: 'HUF', type: 'INCOME',  categoryId: 'plasma' },
    { id: 't25', date: new Date('2026-05-18'), description: 'Cinema — Toldi',                 amount:   -2900, currency: 'HUF', type: 'EXPENSE', categoryId: 'eating' },
  ] as const;

  for (const tx of txData) {
    await prisma.transaction.upsert({
      where: { id: tx.id },
      update: { ...tx },
      create: { ...tx },
    });
  }
  console.log(`  ✓ Transactions: ${txData.length} sample rows`);

  // Run CSV importer if /seed/transactions.csv exists
  const { existsSync } = await import('fs');
  const { resolve: res } = await import('path');
  const csvPath = res(process.cwd(), 'seed', 'transactions.csv');
  if (existsSync(csvPath)) {
    const { execSync } = await import('child_process');
    console.log('  Running CSV importer…');
    execSync('pnpm tsx scripts/csv-import.ts', { stdio: 'inherit' });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
