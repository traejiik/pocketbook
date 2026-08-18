'use server'

import { revalidatePath } from 'next/cache'
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache'
import { requireAuthenticatedUser } from '@/lib/require-auth'
import { importTransactions } from '@/lib/import-transactions'

export async function uploadTransactionCsv(
  formData: FormData
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  await requireAuthenticatedUser()
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('CSV file is required')
  const result = await importTransactions(await file.text())
  revalidateFinanceTags(CACHE_TAGS.transactions)
  revalidatePath('/', 'layout')
  return result
}
