import { syncDueRecurringRules } from '@/lib/recurring-sync'
import { revalidatePath } from 'next/cache'
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache'
import { logger } from '@/lib/logger'

const log = logger('recurring')

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const secret = request.headers.get('x-internal-job-token')
  const expected = process.env.PB_INTERNAL_JOB_TOKEN

  if (!expected || secret !== expected) {
    log.warn('recurring sync refused', { reason: expected ? 'bad token' : 'no job token configured' })
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const timer = log.start('recurring sync', { source: 'scheduled' })
  const result = await syncDueRecurringRules()
  timer.ok({
    rulesProcessed: result.rulesProcessed,
    transactionsCreated: result.transactionsCreated,
  })
  if (result.rulesProcessed > 0) {
    revalidateFinanceTags(CACHE_TAGS.transactions, CACHE_TAGS.recurring)
    revalidatePath('/transactions')
    revalidatePath('/dashboard')
    revalidatePath('/renewals')
    revalidatePath('/recurring')
  }

  return Response.json(result)
}
