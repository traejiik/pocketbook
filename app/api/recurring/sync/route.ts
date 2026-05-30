import { syncDueRecurringRules } from '@/lib/recurring-sync'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret')
  const expected = process.env.FX_SYNC_SECRET

  if (!expected || secret !== expected) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const result = await syncDueRecurringRules()
  if (result.rulesProcessed > 0) {
    revalidatePath('/transactions')
    revalidatePath('/dashboard')
    revalidatePath('/renewals')
    revalidatePath('/recurring')
  }

  return Response.json(result)
}
