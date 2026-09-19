import type { Prisma } from '@prisma/client'
import { formatDateOnly, nextOccurrence, type RecurringCycle } from './recurring-dates'

// "Log recurring early": a transaction entered before its rule's due date
// settles that occurrence. The rule's `nextDue` advances one cycle and the
// transaction records the date it settled (`coversDueDate`), so the daily sync
// (lib/recurring-sync.ts) never logs the same payment again on the due day.

export type Settlement = { coversDueDate: Date; nextDue: Date } | { error: string }

/**
 * Settle `ruleId`'s next occurrence inside `tx`. Rejects an archived rule, a
 * rule of a different kind, or an occurrence that already has a transaction —
 * generated on its date or settled early.
 */
export async function settleNextOccurrence(
  tx: Prisma.TransactionClient,
  ruleId: string,
  type: 'INCOME' | 'EXPENSE' | 'SAVINGS',
): Promise<Settlement> {
  const rule = await tx.recurringRule.findUnique({
    where: { id: ruleId },
    select: { cycle: true, nextDue: true, kind: true, archived: true, name: true },
  })
  if (!rule || rule.archived) return { error: 'That recurring rule is no longer active.' }
  if (rule.kind !== type) return { error: `"${rule.name}" is a ${rule.kind.toLowerCase()} rule.` }

  const occurrence = rule.nextDue
  const taken = await tx.transaction.findFirst({
    where: { recurringRuleId: ruleId, OR: [{ date: occurrence }, { coversDueDate: occurrence }] },
    select: { id: true },
  })
  if (taken) return { error: `The ${formatDateOnly(occurrence)} "${rule.name}" payment is already logged.` }

  const nextDue = nextOccurrence(rule.cycle as RecurringCycle, occurrence, occurrence)
  await tx.recurringRule.update({ where: { id: ruleId }, data: { nextDue } })
  return { coversDueDate: occurrence, nextDue }
}

/**
 * Hand a settled occurrence back to its rule, when nothing has moved the rule on
 * since: if `nextDue` is still exactly one cycle after `coversDueDate`, it goes
 * back to `coversDueDate`. Otherwise (the sync or an edit already moved it) the
 * rule is left alone. Returns whether `nextDue` was rolled back.
 */
export async function releaseOccurrence(
  tx: Prisma.TransactionClient,
  ruleId: string,
  coversDueDate: Date,
): Promise<boolean> {
  const rule = await tx.recurringRule.findUnique({ where: { id: ruleId }, select: { cycle: true, nextDue: true } })
  if (!rule) return false
  const advanced = nextOccurrence(rule.cycle as RecurringCycle, coversDueDate, coversDueDate)
  if (rule.nextDue.getTime() !== advanced.getTime()) return false
  await tx.recurringRule.update({ where: { id: ruleId }, data: { nextDue: coversDueDate } })
  return true
}
