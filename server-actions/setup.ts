'use server';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { claimOwner, OwnerSetupError } from '@/lib/owner/setup';

const log = logger('auth');

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
