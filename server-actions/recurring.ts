'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
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

export async function upsertRecurringRule(input: RecurringRuleInput) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorised');

  const parsed = ruleSchema.parse(input);
  const { id, hasInstallment, ...fields } = parsed;

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
  } else {
    await prisma.recurringRule.create({ data });
  }

  revalidatePath('/recurring');
  revalidatePath('/renewals');
  revalidatePath('/dashboard');
}

export async function archiveRecurringRule(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorised');

  await prisma.recurringRule.update({ where: { id }, data: { archived: true } });

  revalidatePath('/recurring');
  revalidatePath('/renewals');
  revalidatePath('/dashboard');
}
