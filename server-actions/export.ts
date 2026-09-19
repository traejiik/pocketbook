'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuthenticatedUser } from '@/lib/require-auth'
import { toCsv } from '@/lib/csv'
import { logger } from '@/lib/logger'

const log = logger('export')

const DAY = /^\d{4}-\d{2}-\d{2}$/

const rangeSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ from: z.string().regex(DAY), to: z.string().regex(DAY) }).refine((r) => r.from <= r.to, 'Start must be on or before end'),
])

export type ExportRange = z.input<typeof rangeSchema>

/**
 * Columns shared with the importer so an export re-imports as duplicates:
 * the category travels by name *and* id, and the extra FX columns are ignored
 * on import. `amount` keeps the stored sign; the importer takes the sign from
 * `type` regardless.
 */
const EXPORT_HEADER = [
  'date', 'description', 'amount', 'currency', 'type',
  'category', 'category_id', 'recurring_rule_name', 'fx_rate', 'fx_anchor',
]

function filenameFor(range: z.infer<typeof rangeSchema>): string {
  if ('all' in range) return 'pocketbook-transactions-all.csv'
  const [fromMonth, toMonth] = [range.from.slice(0, 7), range.to.slice(0, 7)]
  const wholeMonth = fromMonth === toMonth && range.from.endsWith('-01')
    && new Date(range.to + 'T00:00:00Z').getUTCDate() === new Date(Date.UTC(+toMonth.slice(0, 4), +toMonth.slice(5), 0)).getUTCDate()
  return wholeMonth
    ? `pocketbook-transactions-${fromMonth}.csv`
    : `pocketbook-transactions-${range.from}-to-${range.to}.csv`
}

/** Build a CSV of transactions in the range (inclusive), oldest first, for download in the browser. */
export async function exportTransactionsCsv(
  input: ExportRange,
): Promise<{ filename: string; csv: string; count: number } | { error: string }> {
  await requireAuthenticatedUser()
  const parsed = rangeSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid range' }
  const range = parsed.data

  const where = 'all' in range
    ? {}
    : { date: { gte: new Date(range.from + 'T00:00:00Z'), lte: new Date(range.to + 'T00:00:00Z') } }

  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: {
      date: true, description: true, amount: true, currency: true, type: true, fxRate: true, fxAnchor: true,
      category: { select: { id: true, name: true } },
      recurringRule: { select: { name: true } },
    },
  })

  const csv = toCsv([
    EXPORT_HEADER,
    ...rows.map((t) => [
      t.date.toISOString().slice(0, 10),
      t.description,
      t.amount.toString(),
      t.currency,
      t.type,
      t.category.name,
      t.category.id,
      t.recurringRule?.name ?? '',
      t.fxRate?.toString() ?? '',
      t.fxAnchor ?? '',
    ]),
  ])

  const filename = filenameFor(range)
  log.info('transactions exported', { rows: rows.length, filename })
  return { filename, csv, count: rows.length }
}
