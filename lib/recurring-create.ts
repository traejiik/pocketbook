import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { lockRate, type FxLock } from './fx'
import { planRecurringCatchUp, type RecurringCatchUpPlan } from './recurring-backfill'

// Creating a recurring rule is shared by the Recurring page action and the CSV
// rule importer: both validate with `recurringRuleSchema`, plan the catch-up
// charges with `planRecurringCatchUp`, and write through `createRecurringRule`.

const DAY = /^\d{4}-\d{2}-\d{2}$/

export const recurringRuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  amount: z.number().positive(),
  currency: z.enum(['HUF', 'USD', 'EUR', 'GBP']),
  cycle: z.enum(['MONTHLY', 'ANNUAL']),
  nextDue: z.string().regex(DAY),
  kind: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
  categoryId: z.string().min(1),
  hasInstallment: z.boolean().default(false),
  installmentPaid: z.number().int().min(0).optional().nullable(),
  installmentTotal: z.number().int().min(1).optional().nullable(),
  installmentEndsOn: z.string().regex(DAY).optional().nullable(),
})

export type RecurringRuleInput = z.input<typeof recurringRuleSchema>
export type RecurringRuleFields = z.infer<typeof recurringRuleSchema>

/** UTC midnight, so the `@db.Date` column stores the intended calendar day in any timezone. */
export function dateOnlyStringToDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** The rule's stored installment fields: null unless it is an installment plan. */
export function installmentFields(fields: RecurringRuleFields) {
  return {
    installmentPaid: fields.hasInstallment ? (fields.installmentPaid ?? 0) : null,
    installmentTotal: fields.hasInstallment ? (fields.installmentTotal ?? null) : null,
    installmentEndsOn: fields.hasInstallment && fields.installmentEndsOn ? dateOnlyStringToDate(fields.installmentEndsOn) : null,
  }
}

export function installmentError(fields: RecurringRuleFields): string | null {
  return fields.hasInstallment
    && fields.installmentPaid != null
    && fields.installmentTotal != null
    && fields.installmentPaid > fields.installmentTotal
    ? 'Installment paid count cannot exceed total installments.'
    : null
}

/** Which past charges creating this rule would log, and where its next due date lands. */
export function planNewRule(fields: RecurringRuleFields, today?: Date): RecurringCatchUpPlan {
  const inst = installmentFields(fields)
  return planRecurringCatchUp({
    name: fields.name,
    amount: fields.amount,
    currency: fields.currency,
    cycle: fields.cycle,
    nextDue: fields.nextDue,
    kind: fields.kind,
    categoryId: fields.categoryId,
    installmentPaid: inst.installmentPaid,
    installmentTotal: inst.installmentTotal,
    today,
  })
}

/** Lock the current FX rate once per currency (AGENTS.md §9); rates don't move mid-request. */
export async function lockRates(currencies: Iterable<RecurringRuleFields['currency']>): Promise<Map<string, FxLock>> {
  const locks = new Map<string, FxLock>()
  for (const currency of new Set(currencies)) locks.set(currency, await lockRate(currency))
  return locks
}

/**
 * Create the rule and its planned catch-up charges inside `tx`. Backfilled
 * charges are ordinary transactions, so they carry the FX rate locked now.
 */
export async function createRecurringRule(
  tx: Prisma.TransactionClient,
  fields: RecurringRuleFields,
  plan: RecurringCatchUpPlan,
  lock: FxLock,
): Promise<{ id: string; backfilled: number }> {
  const created = await tx.recurringRule.create({
    data: {
      name: fields.name,
      amount: fields.amount,
      currency: fields.currency,
      cycle: fields.cycle,
      kind: fields.kind,
      categoryId: fields.categoryId,
      ...installmentFields(fields),
      nextDue: dateOnlyStringToDate(plan.nextDue),
      archived: plan.archived,
    },
  })

  if (plan.transactions.length > 0) {
    await tx.transaction.createMany({
      data: plan.transactions.map((t) => ({
        description: t.description,
        amount: t.amount,
        currency: t.currency,
        type: t.type,
        date: dateOnlyStringToDate(t.date),
        categoryId: t.categoryId,
        recurringRuleId: created.id,
        fxRate: lock.fxRate,
        fxAnchor: lock.fxAnchor,
      })),
    })
  }

  return { id: created.id, backfilled: plan.transactions.length }
}
