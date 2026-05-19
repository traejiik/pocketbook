/**
 * One-time CSV importer. Run after `prisma db seed` if /seed/transactions.csv exists.
 * Idempotent: skips rows where (date, description, amount) already exist.
 *
 * CSV columns: date,description,amount,currency,type,category_id,recurring_rule_name?
 *
 * Usage: pnpm tsx scripts/csv-import.ts
 */

import { PrismaClient, TransactionType } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load .env.local for standalone usage
try {
  const contents = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
  for (const line of contents.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
} catch { /* no .env.local */ }

const CSV_PATH = resolve(process.cwd(), 'seed', 'transactions.csv');

const prisma = new PrismaClient();

function parseRow(headers: string[], values: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? '').trim(); });
  return row;
}

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.log('No CSV found at seed/transactions.csv — skipping import.');
    return;
  }

  const content = readFileSync(CSV_PATH, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) { console.log('CSV is empty.'); return; }

  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(l => parseRow(headers, l.split(',')));

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const { date, description, amount, currency, type, category_id, recurring_rule_name } = row;
    if (!date || !description || !amount || !currency || !type || !category_id) {
      console.warn('Skipping malformed row:', row);
      skipped++;
      continue;
    }

    const parsedDate = new Date(date + 'T00:00:00Z');
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedDate.getTime()) || isNaN(parsedAmount)) {
      console.warn('Skipping row with invalid date/amount:', row);
      skipped++;
      continue;
    }

    // Idempotency check: skip if (date, description, amount) already exists
    const existing = await prisma.transaction.findFirst({
      where: {
        date: parsedDate,
        description,
        amount: parsedAmount,
      },
    });
    if (existing) { skipped++; continue; }

    // Resolve optional recurring rule
    let recurringRuleId: string | null = null;
    if (recurring_rule_name) {
      const rule = await prisma.recurringRule.findFirst({ where: { name: recurring_rule_name } });
      recurringRuleId = rule?.id ?? null;
    }

    const txType = type.toUpperCase() as TransactionType;
    if (!['INCOME', 'EXPENSE', 'SAVINGS'].includes(txType)) {
      console.warn(`Unknown type "${type}" — skipping`);
      skipped++;
      continue;
    }

    await prisma.transaction.create({
      data: {
        date: parsedDate,
        description,
        amount: parsedAmount,
        currency: currency.toUpperCase(),
        type: txType,
        categoryId: category_id,
        recurringRuleId,
      },
    });
    inserted++;
  }

  console.log(`CSV import done: ${inserted} inserted, ${skipped} skipped.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
