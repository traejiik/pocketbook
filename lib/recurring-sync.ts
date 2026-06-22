import { prisma } from '@/lib/prisma'
import { lockRate, type FxLock } from '@/lib/fx'
import { notifyDiscord, DISCORD_GREEN } from '@/lib/notify'
import {
  type RecurringCycle,
  type RuleKind,
  monthlyOccurrence,
  annualOccurrence,
  parseDateOnly,
  formatDateOnly,
  startOfUtcDay,
  signedAmount,
} from '@/lib/recurring-dates'

type Currency = 'HUF' | 'USD' | 'EUR' | 'GBP'

type DueRule = {
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
  transactions: readonly { date: Date }[]
}

export type PlannedRecurringSyncTransaction = {
  date: string
  description: string
  amount: number
  currency: Currency
  type: RuleKind
  categoryId: string
  recurringRuleId: string
}

export type PlannedRecurringRuleSync = {
  ruleId: string
  nextDue: string
  archived: boolean
  installmentPaid: number | null
  transactions: PlannedRecurringSyncTransaction[]
}

export type RecurringSyncResult = {
  rulesProcessed: number
  transactionsCreated: number
  created: PlannedRecurringSyncTransaction[]
}

export function planDueRecurringRule(rule: DueRule, todayInput: Date = new Date()): PlannedRecurringRuleSync {
  const today = startOfUtcDay(todayInput)
  const cycle = rule.cycle as RecurringCycle
  const kind = rule.kind as RuleKind
  const currency = rule.currency as Currency
  const anchor = startOfUtcDay(rule.nextDue)
  const existingDates = new Set(rule.transactions.map((tx) => formatDateOnly(tx.date)))
  const dueDates: Date[] = []

  let cursor = anchor
  while (cursor.getTime() <= today.getTime()) {
    dueDates.push(cursor)
    cursor = nextOccurrence(cycle, cursor, anchor)
  }

  const remainingInstallments = rule.installmentTotal == null
    ? null
    : Math.max(rule.installmentTotal - (rule.installmentPaid ?? 0), 0)

  const datesToCreate = dueDates
    .filter((date) => !existingDates.has(formatDateOnly(date)))
    .slice(0, remainingInstallments ?? undefined)

  const createdInstallmentCount = rule.installmentTotal == null ? 0 : datesToCreate.length
  const nextInstallmentPaid = rule.installmentTotal == null
    ? null
    : Math.min((rule.installmentPaid ?? 0) + createdInstallmentCount, rule.installmentTotal)

  return {
    ruleId: rule.id,
    nextDue: formatDateOnly(cursor),
    archived: rule.installmentTotal != null && (nextInstallmentPaid ?? 0) >= rule.installmentTotal,
    installmentPaid: nextInstallmentPaid,
    transactions: datesToCreate.map((date) => ({
      date: formatDateOnly(date),
      description: rule.name,
      amount: signedAmount(Number(rule.amount), kind),
      currency,
      type: kind,
      categoryId: rule.categoryId,
      recurringRuleId: rule.id,
    })),
  }
}

export async function syncDueRecurringRules(today: Date = new Date()): Promise<RecurringSyncResult> {
  const todayDate = startOfUtcDay(today)
  const dueRules = await prisma.recurringRule.findMany({
    where: {
      archived: false,
      nextDue: { lte: todayDate },
    },
    include: {
      transactions: {
        where: { date: { lte: todayDate } },
        select: { date: true },
      },
    },
    orderBy: { nextDue: 'asc' },
  })

  if (dueRules.length === 0) {
    return { rulesProcessed: 0, transactionsCreated: 0, created: [] }
  }

  const plans = dueRules.map((rule) => planDueRecurringRule(rule, todayDate))

  // Once a recurring charge materialises into a ledger row it freezes the rate at
  // generation time, exactly like a manual transaction. Lock per distinct currency.
  const lockByCurrency = new Map<Currency, FxLock>()
  for (const currency of new Set(plans.flatMap((plan) => plan.transactions.map((t) => t.currency)))) {
    lockByCurrency.set(currency, await lockRate(currency))
  }

  let transactionsCreated = 0

  await prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      if (plan.transactions.length > 0) {
        const created = await tx.transaction.createMany({
          data: plan.transactions.map((transaction) => {
            const lock = lockByCurrency.get(transaction.currency)
            return {
              date: parseDateOnly(transaction.date),
              description: transaction.description,
              amount: transaction.amount,
              currency: transaction.currency,
              type: transaction.type,
              categoryId: transaction.categoryId,
              recurringRuleId: transaction.recurringRuleId,
              fxRate: lock?.fxRate ?? null,
              fxAnchor: lock?.fxAnchor ?? null,
            }
          }),
          skipDuplicates: true,
        })
        transactionsCreated += created.count
      }

      await tx.recurringRule.update({
        where: { id: plan.ruleId },
        data: {
          nextDue: parseDateOnly(plan.nextDue),
          archived: plan.archived,
          installmentPaid: plan.installmentPaid,
        },
      })
    }
  })

  const created = plans.flatMap((plan) => plan.transactions)

  // Notify after the transaction commits, never before — and never let a
  // webhook failure fail the sync itself (notifyDiscord does not throw).
  if (transactionsCreated > 0) {
    const lines = created
      .slice(0, 15)
      .map((tx) => `**${tx.description}** · ${formatSignedAmount(tx.amount, tx.currency)} · ${tx.date}`)
    if (created.length > 15) lines.push(`… and ${created.length - 15} more`)
    await notifyDiscord({
      title: `🔁 Logged ${transactionsCreated} recurring transaction${transactionsCreated === 1 ? '' : 's'}`,
      description: lines.join('\n'),
      color: DISCORD_GREEN,
    })
  }

  return {
    rulesProcessed: plans.length,
    transactionsCreated,
    created,
  }
}

// The minus sign is `−` (U+2212), matching the in-app display convention.
function formatSignedAmount(amount: number, currency: Currency) {
  const sign = amount < 0 ? '−' : '+'
  return `${sign}${Math.abs(amount).toLocaleString('en-GB')} ${currency}`
}

// Advance one cycle from `date`, anchored to the rule's original day-of-month so
// month-length clamping stays stable. UTC maths lives in lib/recurring-dates.
function nextOccurrence(cycle: RecurringCycle, date: Date, anchor: Date) {
  if (cycle === 'MONTHLY') {
    return monthlyOccurrence(date.getUTCFullYear(), date.getUTCMonth() + 1, anchor.getUTCDate())
  }
  return annualOccurrence(date.getUTCFullYear() + 1, anchor.getUTCMonth(), anchor.getUTCDate())
}
