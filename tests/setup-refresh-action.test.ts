import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSetupCode } from '@/server-actions/setup';

const { ensureSetupCode, printSetupCode } = vi.hoisted(() => ({
  ensureSetupCode: vi.fn(),
  printSetupCode: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/owner/setup', () => ({ ensureSetupCode }));
vi.mock('@/lib/owner/setup-output', () => ({ printSetupCode }));

afterEach(() => vi.resetAllMocks());

describe('generate setup code', () => {
  it('prints a newly issued code and returns only its status and expiry', async () => {
    ensureSetupCode.mockResolvedValue({ status: 'issued', expiresAt: 1234, code: 'example-code' });

    await expect(generateSetupCode()).resolves.toEqual({ status: 'issued', expiresAt: 1234 });
    expect(printSetupCode).toHaveBeenCalledOnce();
    expect(printSetupCode).toHaveBeenCalledWith('example-code');
  });

  it.each([
    { status: 'active', expiresAt: 1234 },
    { status: 'configured' },
  ])('returns $status without printing another code', async (result) => {
    ensureSetupCode.mockResolvedValue(result);

    await expect(generateSetupCode()).resolves.toEqual(result);
    expect(printSetupCode).not.toHaveBeenCalled();
  });
});
