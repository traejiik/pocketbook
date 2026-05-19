import { getUpcomingRenewals } from '@/lib/aggregations'
import { RenewalsView } from './RenewalsView'

export default async function RenewalsPage() {
  // Fetch 90 days up-front; client filters down to 30/60 depending on toggle
  const renewals = await getUpcomingRenewals(90)

  const serialised = renewals.map(({ rule, daysAway, hufEquivalent }) => ({
    rule: {
      ...rule,
      amount: Number(rule.amount),
      nextDue: rule.nextDue,
      installmentEndsOn: rule.installmentEndsOn ?? null,
    },
    daysAway,
    hufEquivalent,
  }))

  return <RenewalsView renewals={serialised as any} />
}
