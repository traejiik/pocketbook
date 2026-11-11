import type { Prisma } from '@prisma/client'
import type { TxType } from '../transactions/type'
import { addCycles, formatDateOnly } from './dates'

// "Log recurring early": a transaction entered before its rule's due date
// settles that occurrence. The rule's `nextDue` advances one cycle and the
// transaction records the date it settled (`coversDueDate`), so the daily sync
// (lib/recurring/sync.ts) never logs the same payment again on the due day.

export const EARLY_PAYMENT_DATE_ERROR = 'The payment date must be on or before the due date it covers.'

export type Settlement = { coversDueDate: Date; nextDue: Date } | { error: string }

/**
 * Settle the expected occurrence after the caller locks the rule. Rejects an
 * archived or different-kind rule, a moved schedule, or an existing claim.
 */
export async function settleNextOccurrence(
  tx: Prisma.TransactionClient,
  ruleId: string,
  type: TxType,
  expectedDueDate: string | undefined,
  date: Date,
  transactionId?: string,
): Promise<Settlement> {
  const rule = await tx.recurringRule.findUnique({
    where: { id: ruleId },
    select: { cycle: true, cycleInterval: true, nextDue: true, anchorDay: true, kind: true, archived: true, name: true },
  })
  if (!rule || rule.archived) return { error: 'That recurring rule is no longer active.' }
  if (rule.kind !== type) return { error: `"${rule.name}" is a ${rule.kind.toLowerCase()} rule.` }

  const occurrence = rule.nextDue
  if (expectedDueDate !== undefined && expectedDueDate !== formatDateOnly(occurrence)) {
    return { error: 'The payment’s due date has changed. Reload and try again.' }
  }

  if (date > occurrence) return { error: EARLY_PAYMENT_DATE_ERROR }

  const taken = await tx.transaction.findFirst({
    where: {
      recurringRuleId: ruleId,
      ...(transactionId ? { id: { not: transactionId } } : {}),
      OR: [{ date: occurrence }, { coversDueDate: occurrence }, { date }, { coversDueDate: date }],
    },
    select: { date: true, coversDueDate: true },
  })
  if (taken) {
    const claimedDate = taken.date.getTime() === occurrence.getTime() || taken.coversDueDate?.getTime() === occurrence.getTime()
      ? occurrence
      : date
    return { error: `The ${formatDateOnly(claimedDate)} "${rule.name}" payment is already logged.` }
  }

  const nextDue = addCycles(rule, occurrence, 1)
  await tx.recurringRule.update({ where: { id: ruleId }, data: { nextDue } })
  return { coversDueDate: occurrence, nextDue }
}

/**
 * After the caller locks the rule, hand back an occurrence if it hasn't moved on
 * since: if `nextDue` is still exactly one cycle after `coversDueDate`, it goes
 * back to `coversDueDate`. Otherwise (the sync or an edit already moved it) the
 * rule is left alone. Returns whether `nextDue` was rolled back.
 */
export async function releaseOccurrence(
  tx: Prisma.TransactionClient,
  ruleId: string,
  coversDueDate: Date,
): Promise<boolean> {
  const rule = await tx.recurringRule.findUnique({ where: { id: ruleId }, select: { cycle: true, cycleInterval: true, nextDue: true, anchorDay: true } })
  if (!rule) return false
  const advanced = addCycles(rule, coversDueDate, 1)
  if (rule.nextDue.getTime() !== advanced.getTime()) return false
  await tx.recurringRule.update({ where: { id: ruleId }, data: { nextDue: coversDueDate } })
  return true
}
