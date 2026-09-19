'use server'

import { revalidatePath } from 'next/cache'
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache'
import { requireAuthenticatedUser } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import {
  classifyImportRows,
  commitImportRows,
  parseTransactionRows,
  type ImportResult,
  type PreviewRow,
} from '@/lib/import-transactions'
import {
  classifyRecurringRows,
  commitRecurringRows,
  parseRecurringRows,
  type RecurringImportResult,
  type RecurringPreviewRow,
} from '@/lib/import-recurring'
import { logger } from '@/lib/logger'

const log = logger('import')

const MAX_IMPORT_BYTES = 2 * 1024 * 1024
const MAX_IMPORT_ROWS = 5000

export type ImportCategory = { id: string; name: string; color: string; kind: 'INCOME' | 'EXPENSE' | 'SAVINGS' }

export type TransactionImportPreview =
  | { ok: true; filename: string; rows: PreviewRow[]; categories: ImportCategory[] }
  | { error: string }

/** Validate an uploaded file's size and type before reading it. */
async function readCsvUpload(formData: FormData): Promise<{ name: string; text: string } | { error: string }> {
  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'Choose a CSV file first.' }
  if (file.size > MAX_IMPORT_BYTES) return { error: 'That file is larger than 2 MB. Split it and import the parts.' }
  return { name: file.name, text: await file.text() }
}

/** Parse and classify a CSV without writing anything, for the review sheet. */
export async function previewTransactionImport(formData: FormData): Promise<TransactionImportPreview> {
  await requireAuthenticatedUser()
  const upload = await readCsvUpload(formData)
  if ('error' in upload) return upload

  return log.track('csv preview', { filename: upload.name, bytes: upload.text.length }, async () => {
    const parsed = parseTransactionRows(upload.text)
    if (parsed.length === 0) return { error: 'No rows found. The first line must be a header row.' }
    if (parsed.length > MAX_IMPORT_ROWS) return { error: `That file has ${parsed.length} rows; the limit is ${MAX_IMPORT_ROWS}.` }
    const [rows, categories] = await Promise.all([
      classifyImportRows(parsed),
      prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true, kind: true } }),
    ])
    return { ok: true as const, filename: upload.name, rows, categories }
  })
}

/** Write the rows the user kept in the review sheet. */
export async function commitTransactionImport(rows: unknown[]): Promise<ImportResult | { error: string }> {
  await requireAuthenticatedUser()
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'Nothing selected to import.' }
  if (rows.length > MAX_IMPORT_ROWS) return { error: `At most ${MAX_IMPORT_ROWS} rows can be imported at once.` }

  const timer = log.start('csv import', { rows: rows.length })
  const result = await commitImportRows(rows)
  timer.ok({ imported: result.imported, skipped: result.skipped, errors: result.errors.length })
  for (const error of result.errors) log.warn('csv row rejected', { detail: error })

  revalidateFinanceTags(CACHE_TAGS.transactions, ...(result.touchedRules ? [CACHE_TAGS.recurring] : []))
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/renewals')
  revalidatePath('/recurring')
  revalidatePath('/categories')
  return result
}

export type RecurringImportPreview =
  | { ok: true; filename: string; rows: RecurringPreviewRow[]; categories: ImportCategory[] }
  | { error: string }

/** Parse and classify a recurring-rules CSV, including each rule's catch-up charges, without writing. */
export async function previewRecurringImport(formData: FormData): Promise<RecurringImportPreview> {
  await requireAuthenticatedUser()
  const upload = await readCsvUpload(formData)
  if ('error' in upload) return upload

  return log.track('recurring csv preview', { filename: upload.name, bytes: upload.text.length }, async () => {
    const parsed = parseRecurringRows(upload.text)
    if (parsed.length === 0) return { error: 'No rows found. The first line must be a header row.' }
    if (parsed.length > MAX_IMPORT_ROWS) return { error: `That file has ${parsed.length} rows; the limit is ${MAX_IMPORT_ROWS}.` }
    const [rows, categories] = await Promise.all([
      classifyRecurringRows(parsed),
      prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true, kind: true } }),
    ])
    return { ok: true as const, filename: upload.name, rows, categories }
  })
}

/** Create the recurring rules kept in the review sheet, with their catch-up charges. */
export async function commitRecurringImport(rules: unknown[]): Promise<RecurringImportResult | { error: string }> {
  await requireAuthenticatedUser()
  if (!Array.isArray(rules) || rules.length === 0) return { error: 'Nothing selected to import.' }
  if (rules.length > MAX_IMPORT_ROWS) return { error: `At most ${MAX_IMPORT_ROWS} rules can be imported at once.` }

  const timer = log.start('recurring csv import', { rows: rules.length })
  const result = await commitRecurringRows(rules)
  timer.ok({ imported: result.imported, skipped: result.skipped, backfilled: result.backfilled, errors: result.errors.length })
  for (const error of result.errors) log.warn('recurring csv row rejected', { detail: error })

  revalidateFinanceTags(CACHE_TAGS.recurring, ...(result.backfilled > 0 ? [CACHE_TAGS.transactions] : []))
  revalidatePath('/recurring')
  revalidatePath('/renewals')
  revalidatePath('/dashboard')
  if (result.backfilled > 0) revalidatePath('/transactions')
  return result
}
