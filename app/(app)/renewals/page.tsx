export const dynamic = 'force-dynamic'

import { getUpcomingRenewals } from '@/lib/aggregations'
import { RenewalsView } from './RenewalsView'

export default async function RenewalsPage() {
  // Fetch 90 days up-front; client filters down to 30/60 depending on toggle
  const renewals = await getUpcomingRenewals(90)

  const serialised = renewals.map(({ rule, daysAway, hufEquivalent }) => ({
    rule: {
      id: rule.id,
      name: rule.name,
      amount: Number(rule.amount),
      currency: rule.currency,
      cycle: rule.cycle,
      nextDue: rule.nextDue.toISOString().split('T')[0],
      kind: rule.kind,
      categoryId: rule.categoryId,
      installmentPaid: rule.installmentPaid,
      installmentTotal: rule.installmentTotal,
      installmentEndsOn: rule.installmentEndsOn ? rule.installmentEndsOn.toISOString().split('T')[0] : null,
      archived: rule.archived,
      category: rule.category,
    },
    daysAway,
    hufEquivalent,
  }))

  return <RenewalsView renewals={serialised} />
}
