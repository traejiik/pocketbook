import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const passwordSchema = z.string()
  .refine(password => Array.from(password).length >= 12, 'Password must be at least 12 characters.')
  .refine(password => !/[\r\n]/.test(password), 'Password must be on a single line.')
  .refine(password => !bcrypt.truncates(password), 'Password must be at most 72 bytes in UTF-8.');

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
