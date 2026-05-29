'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAuthenticatedUser } from '@/lib/require-auth';
import { planRecurringCatchUp } from '@/lib/recurring-backfill';

const ruleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.enum(['HUF', 'USD', 'EUR', 'GBP']),
  cycle: z.enum(['MONTHLY', 'ANNUAL']),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
  categoryId: z.string().min(1),
  hasInstallment: z.boolean().default(false),
  installmentPaid: z.number().int().min(0).optional().nullable(),
  installmentTotal: z.number().int().min(1).optional().nullable(),
  installmentEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export type RecurringRuleInput = z.infer<typeof ruleSchema>;

type RecurringRuleResult =
  | {
      ok: true
      nextDue?: string
      backfilledCount?: number
      backfilledFrom?: string
      backfilledTo?: string
    }
  | { error: string }

export async function upsertRecurringRule(input: RecurringRuleInput): Promise<RecurringRuleResult> {
  await requireAuthenticatedUser();

  const parsed = ruleSchema.parse(input);
  const { id, hasInstallment, ...fields } = parsed;

  if (
    hasInstallment
    && fields.installmentPaid != null
    && fields.installmentTotal != null
    && fields.installmentPaid > fields.installmentTotal
  ) {
    return { error: 'Installment paid count cannot exceed total installments.' };
  }

  if (!id) {
    const duplicate = await prisma.recurringRule.findFirst({
      where: { name: { equals: fields.name, mode: 'insensitive' }, archived: false },
    });
    if (duplicate) return { error: 'A rule with that name already exists.' };
  }

  const data = {
    name: fields.name,
    amount: fields.amount,
    currency: fields.currency,
    cycle: fields.cycle,
    nextDue: new Date(fields.nextDue),
    kind: fields.kind,
    categoryId: fields.categoryId,
    installmentPaid:   hasInstallment ? (fields.installmentPaid  ?? 0)    : null,
    installmentTotal:  hasInstallment ? (fields.installmentTotal ?? null)  : null,
    installmentEndsOn: hasInstallment && fields.installmentEndsOn
      ? new Date(fields.installmentEndsOn)
      : null,
  };

  if (id) {
    await prisma.recurringRule.update({ where: { id }, data });
    revalidatePath('/recurring');
    revalidatePath('/renewals');
    revalidatePath('/dashboard');
    return { ok: true };
  }

  const catchUp = planRecurringCatchUp({
    name: fields.name,
    amount: fields.amount,
    currency: fields.currency,
    cycle: fields.cycle,
    nextDue: fields.nextDue,
    kind: fields.kind,
    categoryId: fields.categoryId,
    installmentPaid: data.installmentPaid,
    installmentTotal: data.installmentTotal,
  });

  await prisma.$transaction(async (tx) => {
    const created = await tx.recurringRule.create({
      data: {
        ...data,
        nextDue: dateOnlyStringToDate(catchUp.nextDue),
        archived: catchUp.archived,
      },
    });

    if (catchUp.transactions.length > 0) {
      await tx.transaction.createMany({
        data: catchUp.transactions.map((transaction) => ({
          description: transaction.description,
          amount: transaction.amount,
          currency: transaction.currency,
          type: transaction.type,
          date: dateOnlyStringToDate(transaction.date),
          categoryId: transaction.categoryId,
          recurringRuleId: created.id,
        })),
      });
    }

    return created;
  });

  revalidatePath('/recurring');
  revalidatePath('/renewals');
  revalidatePath('/dashboard');

  if (catchUp.transactions.length > 0) {
    revalidatePath('/transactions');
    return {
      ok: true,
      nextDue: catchUp.nextDue,
      backfilledCount: catchUp.transactions.length,
      backfilledFrom: catchUp.transactions[0].date,
      backfilledTo: catchUp.transactions[catchUp.transactions.length - 1].date,
    };
  }

  return { ok: true, nextDue: catchUp.nextDue };
}

export async function archiveRecurringRule(id: string) {
  await requireAuthenticatedUser();

  await prisma.recurringRule.update({ where: { id }, data: { archived: true } });

  revalidatePath('/recurring');
  revalidatePath('/renewals');
  revalidatePath('/dashboard');
}

function dateOnlyStringToDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
