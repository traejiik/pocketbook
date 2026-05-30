import { prisma } from '@/lib/prisma'

type RecurringCycle = 'MONTHLY' | 'ANNUAL'
type RuleKind = 'INCOME' | 'EXPENSE' | 'SAVINGS'
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
}

export function planDueRecurringRule(rule: DueRule, todayInput: Date = new Date()): PlannedRecurringRuleSync {
  const today = startOfLocalDay(todayInput)
  const cycle = rule.cycle as RecurringCycle
  const kind = rule.kind as RuleKind
  const currency = rule.currency as Currency
  const anchor = startOfLocalDay(rule.nextDue)
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
  const todayDate = startOfLocalDay(today)
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
    return { rulesProcessed: 0, transactionsCreated: 0 }
  }

  const plans = dueRules.map((rule) => planDueRecurringRule(rule, todayDate))

  let transactionsCreated = 0

  await prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      if (plan.transactions.length > 0) {
        const created = await tx.transaction.createMany({
          data: plan.transactions.map((transaction) => ({
            date: dateOnlyStringToDate(transaction.date),
            description: transaction.description,
            amount: transaction.amount,
            currency: transaction.currency,
            type: transaction.type,
            categoryId: transaction.categoryId,
            recurringRuleId: transaction.recurringRuleId,
          })),
          skipDuplicates: true,
        })
        transactionsCreated += created.count
      }

      await tx.recurringRule.update({
        where: { id: plan.ruleId },
        data: {
          nextDue: dateOnlyStringToDate(plan.nextDue),
          archived: plan.archived,
          installmentPaid: plan.installmentPaid,
        },
      })
    }
  })

  return {
    rulesProcessed: plans.length,
    transactionsCreated,
  }
}

function signedAmount(amount: number, kind: RuleKind) {
  return kind === 'INCOME' ? amount : -amount
}

function nextOccurrence(cycle: RecurringCycle, date: Date, anchor: Date) {
  if (cycle === 'MONTHLY') {
    return monthlyOccurrence(date.getFullYear(), date.getMonth() + 1, anchor.getDate())
  }
  return annualOccurrence(date.getFullYear() + 1, anchor.getMonth(), anchor.getDate())
}

function monthlyOccurrence(year: number, month: number, day: number) {
  const firstOfMonth = new Date(year, month, 1)
  const lastDay = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate()
  return new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), Math.min(day, lastDay))
}

function annualOccurrence(year: number, month: number, day: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, lastDay))
}

function dateOnlyStringToDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDateOnly(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
