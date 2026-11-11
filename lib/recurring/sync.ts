import { prisma } from '@/lib/prisma'
import { lockRate, type FxLock } from '@/lib/fx'
import { sendInstanceNotification } from '@/lib/notifications/instance'
import { logger } from '@/lib/logger'
import {
  type Cadence,
  type RecurringCycle,
  type RuleKind,
  parseDateOnly,
  formatDateOnly,
  startOfUtcDay,
  signedAmount,
  addCycles,
} from '@/lib/recurring/dates'
import { lockRecurringRules } from '@/lib/recurring/locking'

type Currency = 'HUF' | 'USD' | 'EUR' | 'GBP'

type DueRule = {
  id: string
  name: string
  amount: number | { toString(): string }
  currency: string
  cycle: string
  cycleInterval: number
  nextDue: Date
  anchorDay: number | null
  kind: string
  categoryId: string
  installmentPaid: number | null
  installmentTotal: number | null
  transactions: readonly { date: Date; coversDueDate?: Date | null }[]
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
  const kind = rule.kind as RuleKind
  const currency = rule.currency as Currency
  const nextDue = startOfUtcDay(rule.nextDue)
  const cadence: Cadence = {
    cycle: rule.cycle as RecurringCycle,
    cycleInterval: rule.cycleInterval,
    anchorDay: rule.anchorDay,
  }
  // An occurrence is taken when a linked row sits on its date (generated) or
  // settled it early (`coversDueDate`, from "Log recurring early").
  const existingDates = new Set(rule.transactions.flatMap((tx) => [
    formatDateOnly(tx.date),
    ...(tx.coversDueDate ? [formatDateOnly(tx.coversDueDate)] : []),
  ]))
  const dueDates: Date[] = []

  let cursor = nextDue
  while (cursor.getTime() <= today.getTime()) {
    dueDates.push(cursor)
    cursor = addCycles(cadence, nextDue, dueDates.length)
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

const log = logger('recurring')

export async function syncDueRecurringRules(today: Date = new Date()): Promise<RecurringSyncResult> {
  const todayDate = startOfUtcDay(today)
  const dueRules = await prisma.recurringRule.findMany({
    where: {
      archived: false,
      nextDue: { lte: todayDate },
    },
    select: { id: true },
    orderBy: { nextDue: 'asc' },
  })

  if (dueRules.length === 0) {
    return { rulesProcessed: 0, transactionsCreated: 0, created: [] }
  }

  // The currency can change while sync waits for a rule lock. Preload the
  // supported rates before entering the write transaction so the FX lookups
  // never need a second connection while holding those locks.
  const lockByCurrency = new Map<Currency, FxLock>()
  for (const currency of ['HUF', 'USD', 'EUR', 'GBP'] as const) {
    lockByCurrency.set(currency, await lockRate(currency))
  }

  const result = await prisma.$transaction(async (tx): Promise<RecurringSyncResult> => {
    const lockedIds = await lockRecurringRules(tx, dueRules.map(({ id }) => id))
    const created: PlannedRecurringSyncTransaction[] = []
    let rulesProcessed = 0

    for (const { id } of dueRules) {
      if (!lockedIds.has(id)) continue
      const rule = await tx.recurringRule.findUnique({
        where: { id },
        include: {
          transactions: {
            where: { OR: [{ date: { lte: todayDate } }, { coversDueDate: { lte: todayDate } }] },
            select: { date: true, coversDueDate: true },
          },
        },
      })
      if (!rule || rule.archived || rule.nextDue > todayDate) continue

      const plan = planDueRecurringRule(rule, todayDate)
      let insertedCount = 0
      if (plan.transactions.length > 0) {
        const inserted = await tx.transaction.createManyAndReturn({
          data: plan.transactions.map((transaction) => {
            const lock = lockByCurrency.get(transaction.currency)
            return {
              ...transaction,
              date: parseDateOnly(transaction.date),
              fxRate: lock?.fxRate ?? null,
              fxAnchor: lock?.fxAnchor ?? null,
            }
          }),
          select: { date: true },
          skipDuplicates: true,
        })
        insertedCount = inserted.length
        const insertedDates = new Set(inserted.map(({ date }) => formatDateOnly(date)))
        created.push(...plan.transactions.filter(({ date }) => insertedDates.has(date)))
      }

      const installmentPaid = rule.installmentTotal == null ? null
        : Math.min((rule.installmentPaid ?? 0) + insertedCount, rule.installmentTotal)
      await tx.recurringRule.update({
        where: { id },
        data: {
          nextDue: parseDateOnly(plan.nextDue),
          archived: rule.installmentTotal != null && (installmentPaid ?? 0) >= rule.installmentTotal,
          installmentPaid,
        },
      })
      rulesProcessed++
    }

    return { rulesProcessed, transactionsCreated: created.length, created }
  })

  const { transactionsCreated, created } = result
  for (const transaction of created) {
    log.info('recurring charge generated', {
      description: transaction.description,
      amount: transaction.amount,
      currency: transaction.currency,
      date: transaction.date,
      ruleId: transaction.recurringRuleId,
    })
  }

  // Notify after the transaction commits, never before — and never let a
  // webhook failure fail the sync itself (delivery failures are handled internally).
  if (transactionsCreated > 0) {
    const lines = created
      .slice(0, 15)
      .map((tx) => `**${tx.description}** · ${formatSignedAmount(tx.amount, tx.currency)} · ${tx.date}`)
    if (created.length > 15) lines.push(`… and ${created.length - 15} more`)
    await sendInstanceNotification({
      type: 'recurringActivity',
      count: transactionsCreated,
      lines,
    })
  }

  return result
}

// The minus sign is `−` (U+2212), matching the in-app display convention.
function formatSignedAmount(amount: number, currency: Currency) {
  const sign = amount < 0 ? '−' : '+'
  return `${sign}${Math.abs(amount).toLocaleString('en-GB')} ${currency}`
}

