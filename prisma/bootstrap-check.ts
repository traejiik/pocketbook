// Container-start gate: `node prisma/bootstrap-check.js <step>` answers whether a
// bootstrap step still has work, so `entrypoint.sh` can skip it when it would be
// a no-op. Exit codes: 0 = up to date (skip), 10 = needed (run), anything else =
// the check itself failed, which aborts startup rather than guessing.
//
//   steps: migrations | seed | fx-backfill
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { pendingMigrations, seedWork, type AppliedMigration } from './bootstrap-state';

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

const UP_TO_DATE = 0;
const NEEDED = 10;

async function checkMigrations(prisma: PrismaClient): Promise<string[]> {
  const dir = resolve(process.cwd(), 'prisma', 'migrations');
  const folders = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

  const [{ exists }] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS exists
  `;
  if (!exists) return ['migrations table missing (fresh database)'];

  const applied = await prisma.$queryRaw<AppliedMigration[]>`
    SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"
  `;
  const { pending, failed } = pendingMigrations(folders, applied);
  const reasons: string[] = [];
  if (pending.length > 0) reasons.push(`${pending.length} pending: ${pending.join(', ')}`);
  if (failed.length > 0) reasons.push(`${failed.length} unfinished: ${failed.join(', ')}`);
  return reasons;
}

async function checkSeed(prisma: PrismaClient): Promise<string[]> {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  if (!email || !password) throw new Error('SEED_USER_EMAIL and SEED_USER_PASSWORD must be set');
  const csvPresent = existsSync(resolve(process.cwd(), 'seed', 'transactions.csv'));
  return seedWork(prisma, { email, password, csvPresent });
}

async function checkFxBackfill(prisma: PrismaClient): Promise<string[]> {
  const unlocked = await prisma.transaction.count({ where: { fxRate: null } });
  return unlocked > 0 ? [`${unlocked} transaction(s) without a locked rate`] : [];
}

const CHECKS: Record<string, (prisma: PrismaClient) => Promise<string[]>> = {
  migrations: checkMigrations,
  seed: checkSeed,
  'fx-backfill': checkFxBackfill,
};

async function main(): Promise<number> {
  const step = process.argv[2] ?? '';
  const check = CHECKS[step];
  if (!check) {
    console.error(`bootstrap-check: unknown step "${step}" (expected ${Object.keys(CHECKS).join(' | ')})`);
    return 2;
  }
  const connectionString = process.env.PB_DATABASE_URL;
  if (!connectionString) {
    console.error('bootstrap-check: PB_DATABASE_URL must be set');
    return 2;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const reasons = await check(prisma);
    if (reasons.length === 0) {
      console.log(`  ${step}: up to date`);
      return UP_TO_DATE;
    }
    console.log(`  ${step}: needed — ${reasons.join('; ')}`);
    return NEEDED;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('bootstrap-check failed:', err);
    process.exit(1);
  });
