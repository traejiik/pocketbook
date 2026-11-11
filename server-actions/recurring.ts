'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache';
import { requireAuthenticatedUser } from '@/lib/require-auth';
import { resumeNextDue } from '@/lib/recurring/backfill';
import { formatDateOnly, type RecurringCycle } from '@/lib/recurring/dates';
import { lockRecurringRules } from '@/lib/recurring/locking';
import {
  createRecurringRule,
  dateOnlyStringToDate,
  installmentError,
  installmentFields,
  lockRates,
  planNewRule,
  recurringRuleSchema,
  type RecurringRuleInput,
} from '@/lib/recurring/create';
import { logger } from '@/lib/logger';

const log = logger('recurring');


type RecurringRuleResult =
  | {
      ok: true
      nextDue?: string
      backfilledCount?: number
      backfilledFrom?: string
      backfilledTo?: string
    }
  | { error: string }

type InstallmentSnapshot = NonNullable<RecurringRuleInput['installmentSnapshot']>;

function sameInstallment(left: InstallmentSnapshot, right: InstallmentSnapshot) {
  return left.installmentPaid === right.installmentPaid
    && left.installmentTotal === right.installmentTotal
    && left.installmentEndsOn === right.installmentEndsOn;
}

export async function upsertRecurringRule(input: RecurringRuleInput): Promise<RecurringRuleResult> {
  await requireAuthenticatedUser();

  const fields = recurringRuleSchema.parse(input);
  const { id } = fields;

  const invalid = installmentError(fields);
  if (invalid) {
    log.warn('rule rejected', { name: fields.name, reason: 'paid count exceeds total' });
    return { error: invalid };
  }

  if (!id) {
    const duplicate = await prisma.recurringRule.findFirst({
      where: { name: { equals: fields.name, mode: 'insensitive' }, archived: false },
    });
    if (duplicate) {
      log.warn('rule rejected', { name: fields.name, reason: 'duplicate name' });
      return { error: 'A rule with that name already exists.' };
    }
  }

  if (id) {
    const updated = await prisma.$transaction(async (tx): Promise<{ error: string } | { cycle: RecurringCycle; nextDue: string }> => {
      await lockRecurringRules(tx, [id]);
      const existing = await tx.recurringRule.findUnique({
        where: { id },
        select: {
          cycle: true, cycleInterval: true, anchorDay: true, nextDue: true,
          installmentPaid: true, installmentTotal: true, installmentEndsOn: true,
        },
      });
      if (!existing) return { error: 'Rule not found.' };

      const current = { ...existing, nextDue: formatDateOnly(existing.nextDue) };
      const baseline = fields.scheduleSnapshot ?? current;
      const dateChanged = fields.nextDue !== baseline.nextDue;
      const anchorChanged = fields.cycle !== 'WEEKLY' && fields.anchorDay != null && fields.anchorDay !== baseline.anchorDay;
      const scheduleChanged = dateChanged || anchorChanged
        || fields.cycle !== baseline.cycle || fields.cycleInterval !== baseline.cycleInterval;
      const snapshotStale = baseline.nextDue !== current.nextDue || baseline.anchorDay !== current.anchorDay
        || baseline.cycle !== current.cycle || baseline.cycleInterval !== current.cycleInterval;
      if (snapshotStale && scheduleChanged) {
        return { error: 'The rule’s schedule has changed. Reload and try again.' };
      }

      const currentInstallment = {
        installmentPaid: existing.installmentPaid,
        installmentTotal: existing.installmentTotal,
        installmentEndsOn: existing.installmentEndsOn ? formatDateOnly(existing.installmentEndsOn) : null,
      };
      const installment = installmentFields(fields);
      const requestedInstallment = { ...installment, installmentEndsOn: fields.hasInstallment ? fields.installmentEndsOn ?? null : null };
      const installmentBaseline = fields.installmentSnapshot ?? currentInstallment;
      // The editor renders an unset paid count on an existing plan as zero.
      const displayedInstallment = installmentBaseline.installmentTotal == null
        ? installmentBaseline
        : { ...installmentBaseline, installmentPaid: installmentBaseline.installmentPaid ?? 0 };
      const installmentChanged = !sameInstallment(requestedInstallment, displayedInstallment);
      if (installmentChanged && !sameInstallment(installmentBaseline, currentInstallment)) {
        return { error: 'The rule’s installments have changed. Reload and try again.' };
      }

      const nextDue = dateChanged ? dateOnlyStringToDate(fields.nextDue) : existing.nextDue;
      const defaultAnchorDay = dateChanged || baseline.cycle === 'WEEKLY'
        ? nextDue.getUTCDate()
        : existing.anchorDay ?? nextDue.getUTCDate();
      const anchorDay = fields.cycle === 'WEEKLY' ? null : fields.anchorDay ?? defaultAnchorDay;
      // Older callers with no installment snapshot cannot safely overwrite the
      // installment controls of a rule whose schedule has moved.
      const writeInstallment = installmentChanged && (fields.installmentSnapshot || !snapshotStale);
      await tx.recurringRule.update({
        where: { id },
        data: {
          name: fields.name,
          amount: fields.amount,
          currency: fields.currency,
          ...(scheduleChanged ? { cycle: fields.cycle, cycleInterval: fields.cycleInterval, nextDue, anchorDay } : {}),
          kind: fields.kind,
          categoryId: fields.categoryId,
          ...(writeInstallment ? installment : {}),
        },
      });
      return {
        cycle: scheduleChanged ? fields.cycle : current.cycle,
        nextDue: formatDateOnly(nextDue),
      };
    });
    if ('error' in updated) return updated;
    log.info('rule updated', {
      id,
      name: fields.name,
      amount: fields.amount,
      currency: fields.currency,
      cycle: updated.cycle,
      nextDue: updated.nextDue,
      kind: fields.kind,
    });
    revalidateFinanceTags(CACHE_TAGS.recurring);
    revalidatePath('/recurring');
    revalidatePath('/renewals');
    revalidatePath('/dashboard');
    revalidatePath('/savings');
    return { ok: true };
  }

  const catchUp = planNewRule(fields);
  const locks = await lockRates([fields.currency]);
  await prisma.$transaction((tx) => createRecurringRule(tx, fields, catchUp, locks.get(fields.currency)!));

  log.info('rule created', {
    name: fields.name,
    amount: fields.amount,
    currency: fields.currency,
    cycle: fields.cycle,
    nextDue: catchUp.nextDue,
    kind: fields.kind,
    backfilled: catchUp.transactions.length,
    archived: catchUp.archived,
  });

  // A new rule can backfill catch-up charges, which touches the ledger as well.
  revalidateFinanceTags(
    CACHE_TAGS.recurring,
    ...(catchUp.transactions.length > 0 ? [CACHE_TAGS.transactions] : []),
  );
  revalidatePath('/recurring');
  revalidatePath('/renewals');
  revalidatePath('/dashboard');
  revalidatePath('/savings');

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
  log.info('rule archived', { id });

  revalidateFinanceTags(CACHE_TAGS.recurring);
  revalidatePath('/recurring');
  revalidatePath('/renewals');
  revalidatePath('/dashboard');
  revalidatePath('/savings');
}

export async function deleteRecurringRule(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAuthenticatedUser();

  // A rule that has logged charges is the parent of real ledger history — deleting it
  // would orphan or cascade-destroy those transactions. Only never-charged rules
  // (mistakes created and never run) may be hard-deleted; everything else archives.
  const linkedCount = await prisma.$transaction(async (tx) => {
    await lockRecurringRules(tx, [id]);
    const count = await tx.transaction.count({ where: { recurringRuleId: id } });
    if (count === 0) await tx.recurringRule.delete({ where: { id } });
    return count;
  });
  if (linkedCount > 0) {
    log.warn('rule delete rejected', { id, linkedCount, reason: 'rule has logged charges' });
    return { error: 'Rules with logged charges can only be archived.' };
  }

  log.info('rule deleted', { id });

  revalidateFinanceTags(CACHE_TAGS.recurring);
  revalidatePath('/recurring');
  revalidatePath('/renewals');
  revalidatePath('/dashboard');
  revalidatePath('/savings');
  return { ok: true };
}

export async function unarchiveRecurringRule(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAuthenticatedUser();

  const restored = await prisma.$transaction(async (tx): Promise<{ error: string } | { nextDue: string }> => {
    await lockRecurringRules(tx, [id]);
    const rule = await tx.recurringRule.findUnique({
      where: { id },
      select: { cycle: true, cycleInterval: true, nextDue: true, anchorDay: true, installmentTotal: true, installmentPaid: true },
    });
    if (!rule) {
      log.warn('rule restore rejected', { id, reason: 'rule not found' });
      return { error: 'Rule not found.' };
    }
    if (rule.installmentTotal != null && (rule.installmentPaid ?? 0) >= rule.installmentTotal) {
      log.warn('rule restore rejected', { id, reason: 'installment plan already complete' });
      return { error: 'Completed installment plans can’t be restored.' };
    }

    // Resume on the same cadence without logging the missed occurrences.
    const nextDue = resumeNextDue(rule);
    await tx.recurringRule.update({
      where: { id },
      data: { archived: false, nextDue: dateOnlyStringToDate(nextDue) },
    });
    return { nextDue };
  });
  if ('error' in restored) return restored;
  const { nextDue } = restored;
  log.info('rule restored', { id, nextDue });

  revalidateFinanceTags(CACHE_TAGS.recurring);
  revalidatePath('/recurring');
  revalidatePath('/renewals');
  revalidatePath('/dashboard');
  revalidatePath('/savings');
  return { ok: true };
}
