'use server'

import { revalidatePath } from 'next/cache'
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache'
import { requireAuthenticatedUser } from '@/lib/require-auth'
import { importTransactions } from '@/lib/import-transactions'
import { logger } from '@/lib/logger'

const log = logger('import')

export async function uploadTransactionCsv(
  formData: FormData
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  await requireAuthenticatedUser()
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('CSV file is required')

  const timer = log.start('csv import', { filename: file.name, bytes: file.size })
  const result = await importTransactions(await file.text())
  timer.ok({
    imported: result.imported,
    skipped: result.skipped,
    errors: result.errors.length,
  })
  // Row-level problems are the reason an import "did nothing"; keep them out of
  // the summary line but on the record.
  for (const error of result.errors) log.warn('csv row rejected', { detail: error })

  revalidateFinanceTags(CACHE_TAGS.transactions)
  revalidatePath('/', 'layout')
  return result
}
