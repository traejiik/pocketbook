'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAuthenticatedUser } from '@/lib/require-auth';

const txSchema = z.object({
  id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.enum(['HUF', 'USD', 'EUR', 'GBP']),
  type: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
  categoryId: z.string().min(1),
  recurringRuleId: z.string().optional().nullable(),
});

export type TxInput = z.infer<typeof txSchema>;

export async function upsertTransaction(input: TxInput) {
  await requireAuthenticatedUser();

  const parsed = txSchema.parse(input);
  const { id, ...fields } = parsed;

  // Income is positive; expense and savings are stored negative
  const signedAmount = fields.type === 'INCOME' ? fields.amount : -fields.amount;
  const data = {
    date: new Date(fields.date),
    description: fields.description,
    amount: signedAmount,
    currency: fields.currency,
    type: fields.type,
    categoryId: fields.categoryId,
    recurringRuleId: fields.recurringRuleId ?? null,
  };

  if (id) {
    await prisma.transaction.update({ where: { id }, data });
  } else {
    const ruleId = data.recurringRuleId;
    if (ruleId) {
      const rule = await prisma.recurringRule.findUnique({ where: { id: ruleId } });
      if (rule?.installmentTotal != null) {
        const nextPaid = (rule.installmentPaid ?? 0) + 1;
        await prisma.$transaction([
          prisma.transaction.create({ data }),
          prisma.recurringRule.update({
            where: { id: ruleId },
            data: {
              installmentPaid: nextPaid,
              archived: nextPaid >= rule.installmentTotal,
            },
          }),
        ]);
        revalidatePath('/transactions');
        revalidatePath('/dashboard');
        revalidatePath('/renewals');
        revalidatePath('/recurring');
        return;
      }
    }
    await prisma.transaction.create({ data });
  }

  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  revalidatePath('/renewals');
}

export async function deleteTransaction(id: string) {
  await requireAuthenticatedUser();

  await prisma.transaction.delete({ where: { id } });
  revalidatePath('/transactions');
  revalidatePath('/dashboard');
}
