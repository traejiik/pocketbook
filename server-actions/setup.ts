'use server';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { claimOwner, ensureSetupCode, OwnerSetupError } from '@/lib/owner/setup';
import { printSetupCode } from '@/lib/owner/setup-output';

const log = logger('auth');

export async function generateSetupCode() {
  try {
    const result = await ensureSetupCode(prisma);
    if (result.status !== 'issued') return result;

    printSetupCode(result.code);
    return { status: 'issued' as const, expiresAt: result.expiresAt };
  } catch (err) {
    if (err instanceof OwnerSetupError) return { status: 'error' as const, error: err.message };
    log.error('setup code generation failed');
    return { status: 'error' as const, error: 'Could not generate a setup code. Try again.' };
  }
}

export async function createOwner(formData: FormData): Promise<{ error?: string; field?: 'code' }> {
  try {
    await claimOwner(prisma, {
      code: formData.get('code'),
      displayName: formData.get('displayName'),
      email: formData.get('email'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
      instanceName: formData.get('instanceName'),
    });
    log.info('owner setup completed');
    return {};
  } catch (err) {
    if (err instanceof OwnerSetupError) return { error: err.message, field: err.field };
    // Prisma errors can contain query arguments. Setup failures must never
    // expose submitted credentials or the generated code.
    log.error('owner setup failed');
    return { error: 'Could not finish setup. Try again.' };
  }
}
