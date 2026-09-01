'use server'

import { revalidatePath } from 'next/cache'
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache'
import { requireAuthenticatedUser } from '@/lib/require-auth'
import { syncDueRecurringRules, type RecurringSyncResult } from '@/lib/recurring-sync'
import { logger } from '@/lib/logger'

const log = logger('recurring')

export async function syncDueRecurringRulesAction(): Promise<RecurringSyncResult> {
  await requireAuthenticatedUser()

  const timer = log.start('recurring sync', { source: 'manual' })
  const result = await syncDueRecurringRules()
  timer.ok({
    rulesProcessed: result.rulesProcessed,
    transactionsCreated: result.transactionsCreated,
  })
  if (result.rulesProcessed > 0) {
    revalidateRecurringSyncPaths()
  }

  return result
}

function revalidateRecurringSyncPaths() {
  // A sync writes generated charges and advances each rule's nextDue.
  revalidateFinanceTags(CACHE_TAGS.transactions, CACHE_TAGS.recurring)
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/renewals')
  revalidatePath('/recurring')
}
