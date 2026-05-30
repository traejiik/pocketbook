'use server'

import { revalidatePath } from 'next/cache'
import { requireAuthenticatedUser } from '@/lib/require-auth'
import { syncDueRecurringRules, type RecurringSyncResult } from '@/lib/recurring-sync'

export async function syncDueRecurringRulesAction(): Promise<RecurringSyncResult> {
  await requireAuthenticatedUser()

  const result = await syncDueRecurringRules()
  if (result.rulesProcessed > 0) {
    revalidateRecurringSyncPaths()
  }

  return result
}

function revalidateRecurringSyncPaths() {
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/renewals')
  revalidatePath('/recurring')
}
