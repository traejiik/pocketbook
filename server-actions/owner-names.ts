'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import { ownerNamesDismissalCookie, ownerNamesSchema } from '@/lib/owner/names';
import { prisma } from '@/lib/prisma';
import { requireAuthenticatedUser } from '@/lib/require-auth';

const log = logger('settings');

export async function saveOwnerNames(form: FormData) {
  const { id } = await requireAuthenticatedUser();
  const parsed = ownerNamesSchema.safeParse({ displayName: form.get('displayName'), instanceName: form.get('instanceName') });
  if (!parsed.success) return { error: 'Enter names of up to 80 characters.' };

  const { displayName, instanceName } = parsed.data;
  await prisma.$transaction([
    prisma.appSettings.update({ where: { id: 'singleton' }, data: { instanceName, legacyNamesImported: true } }),
    prisma.user.update({ where: { id }, data: { displayName } }),
  ]);
  log.info('owner names updated');
  revalidatePath('/', 'layout');
  return { names: parsed.data };
}

export async function dismissOwnerNamesPrompt() {
  await requireAuthenticatedUser();
  (await cookies()).set(ownerNamesDismissalCookie, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
}
