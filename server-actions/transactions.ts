'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { lockRate } from '@/lib/fx';
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache';
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

// For an installment rule, `installmentPaid` mirrors the number of linked
// transactions and `archived` means "fully paid". Rather than increment/
// decrement in each path (which drifts the moment one is missed), recompute
// both from the live count after any create / edit / delete. This is
// self-healing: it also corrects any rule whose counter drifted previously.
async function reconcileInstallmentRule(client: Prisma.TransactionClient, ruleId: string) {
  const rule = await client.recurringRule.findUnique({
    where: { id: ruleId },
    select: { installmentTotal: true },
  });
  if (!rule || rule.installmentTotal == null) return; // not an installment rule — nothing to track

  const paid = await client.transaction.count({ where: { recurringRuleId: ruleId } });
  await client.recurringRule.update({
    where: { id: ruleId },
    data: {
      installmentPaid: Math.min(paid, rule.installmentTotal),
      archived: paid >= rule.installmentTotal,
    },
  });
}

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

  // Freeze the FX rate at write time so the transaction's anchor value stays put
  // even as live rates move. `lock.fxAnchor` is the current anchor currency.
  const lock = await lockRate(fields.currency);

  if (id) {
    // The rule link can change on edit, so reconcile both the old and new rule.
    const existing = await prisma.transaction.findUnique({
      where: { id },
      select: { recurringRuleId: true, currency: true, fxRate: true, fxAnchor: true },
    });
    // Keep the original lock when only amount/date/etc. change. Re-lock only when
    // the currency changes (old rate no longer applies), the row was never locked,
    // or the anchor has moved since it was logged.
    const keepLock = !!existing
      && existing.currency === fields.currency
      && existing.fxRate !== null
      && existing.fxAnchor === lock.fxAnchor;
    const updateData = keepLock ? data : { ...data, fxRate: lock.fxRate, fxAnchor: lock.fxAnchor };
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data: updateData });
      const affected = new Set<string>();
      if (existing?.recurringRuleId) affected.add(existing.recurringRuleId);
      if (data.recurringRuleId) affected.add(data.recurringRuleId);
      for (const ruleId of affected) await reconcileInstallmentRule(tx, ruleId);
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({ data: { ...data, fxRate: lock.fxRate, fxAnchor: lock.fxAnchor } });
      if (data.recurringRuleId) await reconcileInstallmentRule(tx, data.recurringRuleId);
    });
  }

  // `reconcileInstallmentRule` can move a rule's paid count / archived flag, so the
  // recurring reads are invalidated here too, not just the transaction ones.
  revalidateFinanceTags(CACHE_TAGS.transactions, CACHE_TAGS.recurring);
  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  revalidatePath('/renewals');
  revalidatePath('/recurring');
}

export async function deleteTransaction(id: string) {
  await requireAuthenticatedUser();

  // Capture the rule link before deleting so we can roll back the installment
  // counter (and un-archive a rule that is no longer fully paid).
  const existing = await prisma.transaction.findUnique({
    where: { id },
    select: { recurringRuleId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id } });
    if (existing?.recurringRuleId) await reconcileInstallmentRule(tx, existing.recurringRuleId);
  });

  // `reconcileInstallmentRule` can move a rule's paid count / archived flag, so the
  // recurring reads are invalidated here too, not just the transaction ones.
  revalidateFinanceTags(CACHE_TAGS.transactions, CACHE_TAGS.recurring);
  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  revalidatePath('/renewals');
  revalidatePath('/recurring');
}
