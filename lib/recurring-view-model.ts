import { toAnchor, type Currency } from '@/lib/fx'

type RuleCategory = {
  id: string
  name: string
  color: string
  kind: string
}

export type RecurringRuleForView = {
  id: string
  name: string
  amount: number | { toString(): string }
  currency: string
  cycle: string
  nextDue: Date
  kind: string
  categoryId: string
  installmentPaid: number | null
  installmentTotal: number | null
  installmentEndsOn: Date | null
  archived: boolean
  category: RuleCategory
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function isCurrency(value: string): value is Currency {
  return value === 'HUF' || value === 'USD' || value === 'EUR' || value === 'GBP'
}

export async function buildRecurringRuleViewModels(
  rules: RecurringRuleForView[],
  anchorCurrency: string,
) {
  return Promise.all(
    rules.map(async (rule) => {
      const amount = Number(rule.amount)
      const anchorEquivalent = rule.currency === anchorCurrency || !isCurrency(rule.currency)
        ? null
        : await toAnchor(Math.abs(amount), rule.currency)

      return {
        id: rule.id,
        name: rule.name,
        amount,
        currency: rule.currency,
        cycle: rule.cycle,
        nextDue: toDateStr(rule.nextDue),
        kind: rule.kind,
        categoryId: rule.categoryId,
        installmentPaid: rule.installmentPaid,
        installmentTotal: rule.installmentTotal,
        installmentEndsOn: rule.installmentEndsOn ? toDateStr(rule.installmentEndsOn) : null,
        archived: rule.archived,
        category: rule.category,
        anchorEquivalent,
      }
    }),
  )
}
