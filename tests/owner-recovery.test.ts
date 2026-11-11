import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { passwordSchema, resetOwnerPassword } from '@/lib/owner/password';

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
});
