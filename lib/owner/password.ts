import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { passwordIssue } from './password-policy';

export const passwordSchema = z.string().superRefine((password, context) => {
  const message = passwordIssue(password);
  if (message) context.addIssue({ code: 'custom', message });
});

export function hashPassword(password: string) {
  return bcrypt.hash(passwordSchema.parse(password), 12);
}

export function passwordUpdate(passwordHash: string) {
  return { passwordHash, sessionVersion: { increment: 1 } };
}

export class OwnerRecoveryError extends Error {}

function recoveryPassword(input: string) {
  const password = passwordSchema.safeParse(input);
  if (!password.success) throw new OwnerRecoveryError(password.error.issues[0].message);
  return password.data;
}

export async function resetOwnerPassword(db: PrismaClient, input: string) {
  const password = recoveryPassword(input);
  const owners = await db.user.findMany({ select: { id: true }, take: 2 });
  if (owners.length !== 1) throw new OwnerRecoveryError('Password recovery requires exactly one owner.');
  const passwordHash = await hashPassword(password);
  await db.user.update({ where: { id: owners[0].id }, data: passwordUpdate(passwordHash) });
}

export async function applyBootPasswordReset(db: PrismaClient, input: string | undefined) {
  const settings = { id: 'singleton' };
  if (!input) {
    await db.appSettings.updateMany({
      where: { ...settings, bootPasswordResetArmed: false },
      data: { bootPasswordResetArmed: true },
    });
    return 'idle';
  }

  return db.$transaction(async tx => {
    // Claim this activation under the singleton row lock. A failed password
    // write rolls the claim back, so the next startup can retry.
    const claim = await tx.appSettings.updateMany({
      where: { ...settings, bootPasswordResetArmed: true },
      data: { bootPasswordResetArmed: false },
    });
    if (!claim.count) return 'already-configured';

    const owners = await tx.user.findMany({ select: { id: true }, take: 2 });
    if (!owners.length) return 'unclaimed';
    if (owners.length !== 1) throw new OwnerRecoveryError('Password recovery requires exactly one owner.');

    const password = recoveryPassword(input);
    const { lastBootPasswordResetHash } = await tx.appSettings.findUniqueOrThrow({
      where: settings,
      select: { lastBootPasswordResetHash: true },
    });
    if (lastBootPasswordResetHash && await bcrypt.compare(password, lastBootPasswordResetHash)) return 'same-password';

    const passwordHash = await hashPassword(password);
    await tx.user.update({ where: { id: owners[0].id }, data: passwordUpdate(passwordHash) });
    await tx.appSettings.update({ where: settings, data: { lastBootPasswordResetHash: passwordHash } });
    return 'applied';
  });
}
