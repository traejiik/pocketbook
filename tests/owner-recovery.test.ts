import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { applyBootPasswordReset, passwordSchema, resetOwnerPassword } from '@/lib/owner/password';

describe('owner recovery', () => {
  const password = 'a replacement password';
  function fakeDb(ids: string[]) {
    const findMany = vi.fn().mockResolvedValue(ids.map(id => ({ id })));
    const update = vi.fn().mockResolvedValue({});
    const db = { user: { findMany, update } } as unknown as PrismaClient;
    return { db, findMany, update };
  }

  it.each([[], ['one', 'two']].map(ids => [ids]))('requires exactly one owner', async (ids) => {
    const { db, update } = fakeDb(ids);
    await expect(resetOwnerPassword(db, password)).rejects.toThrow('exactly one owner');
    expect(update).not.toHaveBeenCalled();
  });

  it('updates the existing owner and revokes sessions in one write', async () => {
    const { db, update } = fakeDb(['owner']);
    await resetOwnerPassword(db, password);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'owner' },
      data: { passwordHash: expect.any(String), sessionVersion: { increment: 1 } },
    });
    const hash = update.mock.calls[0][0].data.passwordHash;
    expect(await bcrypt.compare(password, hash)).toBe(true);
  });

  it('checks the UTF-8 byte limit and leaves the database untouched on invalid input', async () => {
    const { db, findMany, update } = fakeDb(['owner']);
    expect(passwordSchema.safeParse('é'.repeat(36)).success).toBe(true);
    expect(passwordSchema.safeParse('😀'.repeat(6)).success).toBe(false);
    await expect(resetOwnerPassword(db, 'two lines\nof password')).rejects.toThrow('single line');
    await expect(resetOwnerPassword(db, 'é'.repeat(37))).rejects.toThrow('72 bytes');
    expect(findMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('resets once while configured and rearms on a boot without a value', async () => {
    const { db, update } = fakeDb(['owner']);
    const state = { bootPasswordResetArmed: true, lastBootPasswordResetHash: null as string | null };
    const appSettings = {
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.bootPasswordResetArmed !== state.bootPasswordResetArmed) return { count: 0 };
        Object.assign(state, data);
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => ({ ...state })),
      update: vi.fn(async ({ data }) => Object.assign(state, data)),
    };
    Object.assign(db, { appSettings, $transaction: async (work: (tx: PrismaClient) => unknown) => work(db) });

    expect(await applyBootPasswordReset(db, password)).toBe('applied');
    const different = 'another replacement password';
    expect(await applyBootPasswordReset(db, different)).toBe('already-configured');
    expect(update).toHaveBeenCalledOnce();
    expect(await applyBootPasswordReset(db, '')).toBe('idle');
    expect(await applyBootPasswordReset(db, password)).toBe('same-password');
    expect(await applyBootPasswordReset(db, different)).toBe('already-configured');
    expect(update).toHaveBeenCalledOnce();
    expect(await applyBootPasswordReset(db, undefined)).toBe('idle');
    expect(await applyBootPasswordReset(db, different)).toBe('applied');
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 });
    expect(await bcrypt.compare(different, update.mock.calls[1][0].data.passwordHash)).toBe(true);
  });

  it('leaves first-run setup available when there is no owner', async () => {
    const { db, update } = fakeDb([]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    Object.assign(db, { appSettings: { updateMany }, $transaction: async (work: (tx: PrismaClient) => unknown) => work(db) });

    expect(await applyBootPasswordReset(db, password)).toBe('unclaimed');
    expect(update).not.toHaveBeenCalled();
  });
});
