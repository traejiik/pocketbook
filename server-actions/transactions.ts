'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getAnchorCurrency, lockRate } from '@/lib/fx';
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache';
import { requireAuthenticatedUser } from '@/lib/require-auth';
import { logger } from '@/lib/logger';
import { reconcileInstallmentRule } from '@/lib/installments';
import { releaseOccurrence, settleNextOccurrence } from '@/lib/recurring-early';
import { TX_TYPES, kindForType, signedForType } from '@/lib/transaction-type';
import { getPotBalance } from '@/lib/pot-balance';
import { fmtAnchor } from '@/lib/format';

const log = logger('transactions');

const txSchema = z.object({
  id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.enum(['HUF', 'USD', 'EUR', 'GBP']),
  type: z.enum(TX_TYPES),
  categoryId: z.string().min(1),
  recurringRuleId: z.string().optional().nullable(),
  /**
   * "Log recurring early": this transaction settles `recurringRuleId`'s next
   * occurrence, advancing the rule so the sync does not log it again. On edit,
   * turning it off hands the occurrence back (see `releaseOccurrence`).
   */
  logEarly: z.boolean().optional().default(false),
});

export type TxInput = z.input<typeof txSchema>;
export type TxResult = { ok: true; notice?: string } | { error: string };

export async function upsertTransaction(input: TxInput): Promise<TxResult> {
  await requireAuthenticatedUser();

  const parsed = txSchema.parse(input);
  const { id, logEarly, ...fields } = parsed;

  // The sign comes from the type (rule 16): income and withdrawals positive,
  // expenses and savings deposits negative.
  const signedAmount = signedForType(fields.amount, fields.type);
  const base = {
    date: new Date(fields.date),
    description: fields.description,
    amount: signedAmount,
    currency: fields.currency,
    type: fields.type,
    categoryId: fields.categoryId,
  };
  const requestedRule = fields.recurringRuleId ?? null;

  // Freeze the FX rate at write time so the transaction's anchor value stays put
  // even as live rates move. `lock.fxAnchor` is the current anchor currency.
  const lock = await lockRate(fields.currency);

  const guard = await checkCategoryAndPot(fields, id, lock.fxRate, logEarly);
  if (guard) {
    log.warn('transaction rejected', { id, type: fields.type, categoryId: fields.categoryId, reason: guard.error });
    return guard;
  }

  let notice: string | undefined;
  let ruleId: string | null = requestedRule;
  let coversDueDate: Date | null = null;

  const outcome = await prisma.$transaction(async (tx): Promise<TxResult> => {
    if (id) {
      const existing = await tx.transaction.findUnique({
        where: { id },
        select: { recurringRuleId: true, coversDueDate: true, currency: true, fxRate: true, fxAnchor: true },
      });
      if (!existing) return { error: 'Transaction not found.' };

      if (existing.coversDueDate && existing.recurringRuleId) {
        if (logEarly) {
          // Still settles the same occurrence; the rule cannot be swapped here.
          ruleId = existing.recurringRuleId;
          coversDueDate = existing.coversDueDate;
        } else {
          const released = await releaseOccurrence(tx, existing.recurringRuleId, existing.coversDueDate);
          if (!released) notice = 'The rule has moved on since, so its next due date was left as is.';
          ruleId = null;
        }
      } else if (logEarly && requestedRule) {
        const settled = await settleNextOccurrence(tx, requestedRule, fields.type);
        if ('error' in settled) return settled;
        coversDueDate = settled.coversDueDate;
      }

      // Keep the original lock when only amount/date/etc. change. Re-lock only when
      // the currency changes (old rate no longer applies), the row was never locked,
      // or the anchor has moved since it was logged.
      const keepLock = existing.currency === fields.currency
        && existing.fxRate !== null
        && existing.fxAnchor === lock.fxAnchor;
      const data = { ...base, recurringRuleId: ruleId, coversDueDate };
      await tx.transaction.update({
        where: { id },
        data: keepLock ? data : { ...data, fxRate: lock.fxRate, fxAnchor: lock.fxAnchor },
      });
      // The rule link can change on edit, so reconcile both the old and new rule.
      const affected = new Set<string>();
      if (existing.recurringRuleId) affected.add(existing.recurringRuleId);
      if (ruleId) affected.add(ruleId);
      for (const r of affected) await reconcileInstallmentRule(tx, r);
      return { ok: true };
    }

    if (logEarly && requestedRule) {
      const settled = await settleNextOccurrence(tx, requestedRule, fields.type);
      if ('error' in settled) return settled;
      coversDueDate = settled.coversDueDate;
    }
    await tx.transaction.create({
      data: { ...base, recurringRuleId: ruleId, coversDueDate, fxRate: lock.fxRate, fxAnchor: lock.fxAnchor },
    });
    if (ruleId) await reconcileInstallmentRule(tx, ruleId);
    return { ok: true };
  });

  if ('error' in outcome) {
    log.warn('transaction rejected', { id, ruleId: requestedRule ?? undefined, reason: outcome.error });
    return outcome;
  }

  log.info(id ? 'transaction updated' : 'transaction created', {
    id,
    description: fields.description,
    amount: signedAmount,
    currency: fields.currency,
    type: fields.type,
    date: fields.date,
    categoryId: fields.categoryId,
    ruleId: ruleId ?? undefined,
    settles: coversDueDate ? (coversDueDate as Date).toISOString().slice(0, 10) : undefined,
    fxRate: lock.fxRate,
    fxAnchor: lock.fxAnchor,
  });

  // `reconcileInstallmentRule` and early settlement move a rule's next due date,
  // paid count and archived flag, so the recurring reads are invalidated too.
  revalidateFinanceTags(CACHE_TAGS.transactions, CACHE_TAGS.recurring);
  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  revalidatePath('/savings');
  revalidatePath('/renewals');
  revalidatePath('/recurring');
  return notice ? { ok: true, notice } : { ok: true };
}

type Fields = Omit<z.output<typeof txSchema>, 'id' | 'logEarly'>;

// The category must be of the kind the type books against (a withdrawal comes out
// of a SAVINGS pot), and a withdrawal can neither link to a recurring rule nor take
// more than its pot holds. The pot check converts at the rate being locked now and
// excludes the row being edited; with no FX path it cannot judge, so it lets the
// write through rather than blocking on a missing rate.
async function checkCategoryAndPot(
  fields: Fields,
  id: string | undefined,
  fxRate: number | null,
  logEarly: boolean,
): Promise<{ error: string } | null> {
  const category = await prisma.category.findUnique({ where: { id: fields.categoryId }, select: { kind: true, name: true } });
  if (!category) return { error: 'Category not found.' };
  if (category.kind !== kindForType(fields.type)) {
    return { error: `"${category.name}" is not a ${kindForType(fields.type).toLowerCase()} category.` };
  }
  if (fields.type !== 'WITHDRAWAL') return null;
  if (fields.recurringRuleId || logEarly) return { error: 'A withdrawal cannot be linked to a recurring rule.' };
  if (fxRate === null) return null;

  const [balance, anchor] = await Promise.all([getPotBalance(fields.categoryId, id), getAnchorCurrency()]);
  const requested = fields.amount * fxRate;
  if (requested > balance + 0.5) {
    return { error: `${category.name} only holds ${fmtAnchor(Math.max(0, balance), anchor)}.` };
  }
  return null;
}

export async function deleteTransaction(id: string) {
  await requireAuthenticatedUser();

  // Capture the rule link before deleting so we can roll back the installment
  // counter (and un-archive a rule that is no longer fully paid).
  const existing = await prisma.transaction.findUnique({
    where: { id },
    select: { recurringRuleId: true, coversDueDate: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id } });
    if (existing?.recurringRuleId) {
      // An early-logged payment hands its occurrence back, so the rule is due again.
      if (existing.coversDueDate) await releaseOccurrence(tx, existing.recurringRuleId, existing.coversDueDate);
      await reconcileInstallmentRule(tx, existing.recurringRuleId);
    }
  });

  log.info('transaction deleted', { id, ruleId: existing?.recurringRuleId ?? undefined });

  // `reconcileInstallmentRule` can move a rule's paid count / archived flag, so the
  // recurring reads are invalidated here too, not just the transaction ones.
  revalidateFinanceTags(CACHE_TAGS.transactions, CACHE_TAGS.recurring);
  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  revalidatePath('/savings');
  revalidatePath('/renewals');
  revalidatePath('/recurring');
}
