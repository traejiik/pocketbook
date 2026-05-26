/**
 * CLI wrapper for the shared CSV importer.
 * Usage: pnpm tsx scripts/csv-import.ts
 *
 * Reads seed/transactions.csv and calls the shared importTransactions service.
 * The same service is used by the browser UI (server-actions/import.ts) and the
 * production seed (prisma/seed.ts).
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { importTransactions } from '../lib/import-transactions'

// Load .env.local for standalone usage
try {
  const contents = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of contents.split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim()
      if (k && !(k in process.env)) process.env[k] = v
    }
  }
} catch { /* no .env.local */ }

const csvPath = resolve(process.cwd(), 'seed', 'transactions.csv')

if (!existsSync(csvPath)) {
  console.log('No CSV found at seed/transactions.csv — skipping import.')
  process.exit(0)
}

const csv = readFileSync(csvPath, 'utf-8')
importTransactions(csv)
  .then(({ imported, skipped, errors }) => {
    console.log(`CSV import done: ${imported} inserted, ${skipped} skipped.`)
    if (errors.length > 0) errors.forEach(e => console.warn(' ', e))
  })
  .catch(e => { console.error(e); process.exit(1) })
