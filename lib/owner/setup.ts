import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword, passwordSchema } from './password';

const settingsKey = { id: 'singleton' } as const;
const validityMs = 30 * 60_000;

type StoredSetupCode = { setupCodeHash: string | null; setupCodeExpiresAt: Date | null };

export function activeSetupCodeExpiry(setup: StoredSetupCode | null, now = Date.now()): number | null {
  if (!setup?.setupCodeHash || !setup.setupCodeExpiresAt) return null;
  const expiry = setup.setupCodeExpiresAt.getTime();
  return expiry > now ? expiry : null;
}

const setupSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/, 'Enter a valid setup code.'),
  displayName: z.string().trim().min(1, 'Enter your display name.').max(80),
  email: z.email().trim().max(254),
  password: passwordSchema,
  confirmPassword: z.string(),
  instanceName: z.string().trim().min(1, 'Enter an instance name.').max(80),
}).refine(input => input.password === input.confirmPassword, 'Passwords do not match.');

export class OwnerSetupError extends Error {
  constructor(message: string, readonly field?: 'code') {
    super(message);
  }
}

function digest(code: string) {
  return createHash('sha256').update(code).digest();
}

async function assertNoOwner(db: Prisma.TransactionClient) {
  if (await db.user.findFirst({ select: { id: true } })) {
    throw new OwnerSetupError('Pocketbook is already configured.');
  }
}

async function lockSetup(db: Prisma.TransactionClient) {
  const [settings] = await db.$queryRaw<StoredSetupCode[]>`
    SELECT "setupCodeHash", "setupCodeExpiresAt" FROM "AppSettings" WHERE "id" = ${settingsKey.id} FOR UPDATE
  `;
  if (!settings) throw new OwnerSetupError('Finish database bootstrap before setting up an owner.');
  return settings;
}

async function verifyCode(db: Prisma.TransactionClient, code: Buffer) {
  const setup = await db.appSettings.findUnique({
    where: settingsKey,
    select: { setupCodeHash: true, setupCodeExpiresAt: true },
  });
  const expected = Buffer.from(setup?.setupCodeHash ?? '', 'hex');
  if (activeSetupCodeExpiry(setup) === null
    || expected.length !== code.length || !timingSafeEqual(expected, code)) {
    throw new OwnerSetupError('The setup code is invalid or expired.', 'code');
  }
}

async function writeSetupCode(db: Prisma.TransactionClient, now = new Date()) {
  const code = randomBytes(32).toString('base64url');
  const expiresAt = now.getTime() + validityMs;
  await db.appSettings.update({
    where: settingsKey,
    data: {
      setupCodeHash: digest(code).toString('hex'),
      setupCodeExpiresAt: new Date(expiresAt),
    },
  });
  return { code, expiresAt };
}

export async function issueSetupCode(db: PrismaClient, now?: Date) {
  return db.$transaction(async tx => {
    await lockSetup(tx);
    await assertNoOwner(tx);
    const { code } = await writeSetupCode(tx, now);
    return code;
  }, { isolationLevel: 'ReadCommitted' });
}

type SetupCodeStatus =
  | { status: 'configured' }
  | { status: 'active'; expiresAt: number }
  | { status: 'issued'; expiresAt: number; code: string };

export async function ensureSetupCode(db: PrismaClient): Promise<SetupCodeStatus> {
  return db.$transaction(async tx => {
    const setup = await lockSetup(tx);
    if (await tx.user.findFirst({ select: { id: true } })) return { status: 'configured' };
    const now = new Date();
    const expiresAt = activeSetupCodeExpiry(setup, now.getTime());
    if (expiresAt !== null) return { status: 'active', expiresAt };
    return { status: 'issued', ...await writeSetupCode(tx, now) };
  }, { isolationLevel: 'ReadCommitted' });
}

export async function claimOwner(db: PrismaClient, input: unknown) {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    throw new OwnerSetupError(issue.message, issue.path[0] === 'code' ? 'code' : undefined);
  }
  const { code, email, displayName, password, instanceName } = parsed.data;
  const codeDigest = digest(code);
  await assertNoOwner(db);
  await verifyCode(db, codeDigest);
  const passwordHash = await hashPassword(password);

  await db.$transaction(async tx => {
    await lockSetup(tx);
    await assertNoOwner(tx);
    await verifyCode(tx, codeDigest);
    await tx.user.create({ data: { email, displayName, passwordHash } });
    await tx.appSettings.update({
      where: settingsKey,
      data: { instanceName, legacyNamesImported: true, setupCodeHash: null, setupCodeExpiresAt: null },
    });
  }, { isolationLevel: 'ReadCommitted' });
}
