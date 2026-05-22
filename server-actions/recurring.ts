'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { endOfMonth, isBefore } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

const ruleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.enum(['HUF', 'USD', 'EUR', 'GBP']),
  cycle: z.enum(['MONTHLY', 'ANNUAL']),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['INCOME', 'EXPENSE']),
  categoryId: z.string().min(1),
  hasInstallment: z.boolean().default(false),
  installmentPaid: z.number().int().min(0).optional().nullable(),
  installmentTotal: z.number().int().min(1).optional().nullable(),
  installmentEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export type RecurringRuleInput = z.infer<typeof ruleSchema>;

export async function upsertRecurringRule(input: RecurringRuleInput): Promise<{ ok: true; backfilled?: boolean; backfilledDate?: string } | { error: string }> {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorised');

  const parsed = ruleSchema.parse(input);
  const { id, hasInstallment, ...fields } = parsed;

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

  const newRule = await prisma.recurringRule.create({ data });

  revalidatePath('/recurring');
  revalidatePath('/renewals');
  revalidatePath('/dashboard');

  if (fields.cycle === 'MONTHLY') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextDueDate = new Date(fields.nextDue);
    const dayOfMonth = nextDueDate.getDate();

    let currentMonthDue = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
    if (currentMonthDue.getMonth() !== today.getMonth()) {
      currentMonthDue = endOfMonth(new Date(today.getFullYear(), today.getMonth(), 1));
      currentMonthDue.setHours(0, 0, 0, 0);
    }

    if (isBefore(currentMonthDue, today) && isBefore(today, nextDueDate)) {
      await prisma.transaction.create({
        data: {
          description: newRule.name,
          amount: newRule.amount,
          currency: newRule.currency,
          type: newRule.kind,
          date: currentMonthDue,
          categoryId: newRule.categoryId,
          recurringRuleId: newRule.id,
        },
      });
      revalidatePath('/transactions');
      const dateStr = currentMonthDue.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      return { ok: true, backfilled: true, backfilledDate: dateStr };
    }
  }

  return { ok: true };
}

export async function archiveRecurringRule(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorised');

  await prisma.recurringRule.update({ where: { id }, data: { archived: true } });

  revalidatePath('/recurring');
  revalidatePath('/renewals');
  revalidatePath('/dashboard');
}
