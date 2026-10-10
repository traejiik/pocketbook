import { prisma } from './prisma'
import { frozenToAnchor, type Currency } from './fx'

/**
 * One savings pot's balance in the anchor (deposits − withdrawals), read fresh and
 * uncached for the withdrawal check in `upsertTransaction`. `excludeId` leaves out
 * the row being edited, so an edited withdrawal is judged against the pot as if it
 * were not there yet. Rows with no FX path are skipped, the same as every total.
 *
 * Kept out of `lib/aggregations.ts` so the Server Action does not pull the cached
 * reads (and `unstable_cache`) into its module graph.
 */
export async function getPotBalance(categoryId: string, excludeId?: string): Promise<number> {
  const rows = await prisma.transaction.findMany({
    where: { categoryId, type: { in: ['SAVINGS', 'WITHDRAWAL'] }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { amount: true, currency: true, fxRate: true, fxAnchor: true, type: true },
  })
  let balance = 0
  for (const r of rows) {
    const amt = await frozenToAnchor(
      Math.abs(Number(r.amount)),
      r.currency as Currency,
      r.fxRate === null ? null : Number(r.fxRate),
      r.fxAnchor,
    )
    if (amt === null) continue
    balance += r.type === 'WITHDRAWAL' ? -amt : amt
  }
  return balance
}
