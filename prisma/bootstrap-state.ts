// Shared by `prisma/seed.ts` (which writes the bootstrap state) and
// `prisma/bootstrap-check.ts` (which decides, at container start, whether the
// migrate / seed / FX-backfill steps need to run at all). Keeping the seed's
// invariants next to the check means the two can never disagree about what
// "seeded" means.
import { FxMode, type PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Every declared currency (USD/EUR/GBP) needs a HUF pair so it is convertible
// to the anchor. Missing pairs make transactions in that currency drop out of
// every aggregation (toAnchor → null), so all three ship with defaults.
export const DEFAULT_FX_RATES = [
  { fromCurrency: 'HUF', toCurrency: 'USD', rate: 0.002791, mode: FxMode.AUTO, provider: 'frankfurter.dev' },
  { fromCurrency: 'USD', toCurrency: 'HUF', rate: 358.40,   mode: FxMode.AUTO, provider: 'frankfurter.dev' },
  { fromCurrency: 'HUF', toCurrency: 'EUR', rate: 0.002525, mode: FxMode.AUTO, provider: 'frankfurter.dev' },
  { fromCurrency: 'EUR', toCurrency: 'HUF', rate: 396.10,   mode: FxMode.AUTO, provider: 'frankfurter.dev' },
  { fromCurrency: 'HUF', toCurrency: 'GBP', rate: 0.002174, mode: FxMode.AUTO, provider: 'frankfurter.dev' },
  { fromCurrency: 'GBP', toCurrency: 'HUF', rate: 460.00,   mode: FxMode.AUTO, provider: 'frankfurter.dev' },
];

export type AppliedMigration = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

/**
 * Which migration folders `prisma migrate deploy` still has work for.
 * `pending` are folders with no successful row; `failed` are rows that started
 * but neither finished nor were rolled back — deploy must run so it can surface
 * Prisma's own failed-migration error instead of the app booting on a half schema.
 */
export function pendingMigrations(
  folders: string[],
  applied: AppliedMigration[],
): { pending: string[]; failed: string[] } {
  const done = new Set(
    applied.filter((m) => m.finished_at !== null && m.rolled_back_at === null).map((m) => m.migration_name),
  );
  const failed = applied
    .filter((m) => m.finished_at === null && m.rolled_back_at === null)
    .map((m) => m.migration_name);
  const pending = folders.filter((f) => !done.has(f)).sort();
  return { pending, failed };
}

/**
 * Reasons the idempotent seed still has work to do; empty means it would be a
 * no-op. Mirrors each step of `prisma/seed.ts`: the env user exists with the env
 * password (so a rotated `PB_SEED_USER_PASSWORD` re-seeds), the settings row,
 * every default FX pair, a Savings category, and no pending bootstrap CSV.
 */
export async function seedWork(
  prisma: PrismaClient,
  opts: { email: string; password: string; csvPresent: boolean },
): Promise<string[]> {
  const reasons: string[] = [];

  const user = await prisma.user.findUnique({ where: { email: opts.email }, select: { passwordHash: true } });
  if (!user) reasons.push('seed user missing');
  else if (!(await bcrypt.compare(opts.password, user.passwordHash))) reasons.push('seed user password changed');

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' }, select: { id: true } });
  if (!settings) reasons.push('app settings missing');

  const pairs = await prisma.exchangeRate.findMany({ select: { fromCurrency: true, toCurrency: true } });
  const have = new Set(pairs.map((p) => `${p.fromCurrency}>${p.toCurrency}`));
  const missing = DEFAULT_FX_RATES.filter((fx) => !have.has(`${fx.fromCurrency}>${fx.toCurrency}`));
  if (missing.length > 0) reasons.push(`${missing.length} default FX pair(s) missing`);

  const savings = await prisma.category.findFirst({ where: { kind: 'SAVINGS' }, select: { id: true } });
  if (!savings) reasons.push('savings category missing');

  if (opts.csvPresent) reasons.push('bootstrap CSV present');

  return reasons;
}
