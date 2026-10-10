export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { frozenToAnchor, type Currency } from '@/lib/fx'
import { getAnchorCurrency, getSavingsSummary } from '@/lib/aggregations'
import { SavingsView, type SavingsMovement } from '@/components/savings/SavingsView'

export default async function SavingsPage() {
  const [summary, anchorCurrency, rows] = await Promise.all([
    getSavingsSummary(),
    getAnchorCurrency(),
    // Every deposit and withdrawal, for the History list. Savings is a low-volume
    // ledger (a handful of rows a month), so the page sends them all and the client
    // groups and filters them — no client-side fetching (rule 4).
    prisma.transaction.findMany({
      where: { type: { in: ['SAVINGS', 'WITHDRAWAL'] } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, date: true, description: true, amount: true, currency: true,
        fxRate: true, fxAnchor: true, type: true, categoryId: true,
      },
    }),
  ])

  const movements: SavingsMovement[] = []
  for (const r of rows) {
    const magnitude = Math.abs(Number(r.amount))
    movements.push({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      description: r.description,
      amount: magnitude,
      currency: r.currency,
      type: r.type as SavingsMovement['type'],
      categoryId: r.categoryId,
      anchorAmount: await frozenToAnchor(
        magnitude,
        r.currency as Currency,
        r.fxRate === null ? null : Number(r.fxRate),
        r.fxAnchor,
      ),
    })
  }

  return <SavingsView summary={summary} movements={movements} anchorCurrency={anchorCurrency} />
}
