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

export async function resetOwnerPassword(db: PrismaClient, input: string) {
  const password = passwordSchema.safeParse(input);
  if (!password.success) throw new OwnerRecoveryError(password.error.issues[0].message);
  const owners = await db.user.findMany({ select: { id: true }, take: 2 });
  if (owners.length !== 1) throw new OwnerRecoveryError('Password recovery requires exactly one owner.');
  const passwordHash = await hashPassword(password.data);
  await db.user.update({ where: { id: owners[0].id }, data: passwordUpdate(passwordHash) });
}
