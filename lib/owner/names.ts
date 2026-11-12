import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const ownerNameMaxLength = 80;
export const ownerNamesDismissalCookie = 'pb-owner-names-dismissed';
const optionalName = z.string().trim().max(ownerNameMaxLength).transform(value => value || null);
export const ownerNamesSchema = z.object({ displayName: optionalName, instanceName: optionalName });

export async function importLegacyOwnerNames(db: PrismaClient, env: Record<string, string | undefined>) {
  const displayName = env.PB_USER_DISPLAY_NAME?.trim().slice(0, ownerNameMaxLength);
  const instanceName = env.PB_INSTANCE_NAME?.trim().slice(0, ownerNameMaxLength);

  await db.$transaction(async tx => {
    const owner = await tx.user.findFirst({ select: { id: true } });
    if (!owner) return;

    const imported = await tx.appSettings.updateMany({
      where: { id: 'singleton', legacyNamesImported: false },
      data: { legacyNamesImported: true },
    });
    if (!imported.count) return;

    if (displayName) {
      await tx.user.updateMany({
        where: { id: owner.id, OR: [{ displayName: null }, { displayName: '' }] },
        data: { displayName },
      });
    }
    if (instanceName) {
      await tx.appSettings.updateMany({
        where: { id: 'singleton', OR: [{ instanceName: null }, { instanceName: '' }] },
        data: { instanceName },
      });
    }
  });
}
