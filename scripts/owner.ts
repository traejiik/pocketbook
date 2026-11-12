import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { OwnerRecoveryError, resetOwnerPassword } from '../lib/owner/password';
import { ensureSetupCode, issueSetupCode, OwnerSetupError } from '../lib/owner/setup';
import { printSetupCode } from '../lib/owner/setup-output';
import { importLegacyOwnerNames } from '../lib/owner/names';

const invocationPassword = process.env.PB_RESET_PASSWORD;
delete process.env.PB_RESET_PASSWORD;

function databaseUrl() {
  if (process.env.PB_DATABASE_URL) return process.env.PB_DATABASE_URL;
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    const contents = readFileSync(file, 'utf8');
    const url = parseEnv(contents).PB_DATABASE_URL;
    if (url) return url;
  }
  return undefined;
}

async function readPassword() {
  if (invocationPassword !== undefined) return invocationPassword;
  if (process.stdin.isTTY) throw new OwnerRecoveryError('Pass the new password through stdin or PB_RESET_PASSWORD.');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 74) throw new OwnerRecoveryError('Password must be at most 72 bytes in UTF-8.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  const [command, ...extra] = process.argv.slice(2);
  if (extra.length || (command !== 'setup-code' && command !== 'startup-setup-code' && command !== 'reset-password')) {
    throw new OwnerRecoveryError('Usage: owner setup-code | owner reset-password');
  }
  const connectionString = databaseUrl();
  if (!connectionString) throw new OwnerRecoveryError('PB_DATABASE_URL is required.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (command === 'setup-code') {
      process.stdout.write(`${await issueSetupCode(db)}\n`);
    } else if (command === 'startup-setup-code') {
      await importLegacyOwnerNames(db, process.env);
      const result = await ensureSetupCode(db);
      if (result.status === 'issued') printSetupCode(result.code);
    } else {
      await resetOwnerPassword(db, await readPassword());
      process.stdout.write('Password reset. All existing sessions have been revoked.\n');
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  const message = error instanceof OwnerSetupError || error instanceof OwnerRecoveryError
    ? error.message : 'Owner command failed. Check the database connection and applied migrations.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
