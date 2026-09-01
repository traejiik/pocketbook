'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache';
import { requireAuthenticatedUser } from '@/lib/require-auth';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

const log = logger('categories');

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  kind: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export async function upsertCategory(input: CategoryInput): Promise<{ ok: true } | { error: string }> {
  await requireAuthenticatedUser();

  const { id, ...data } = categorySchema.parse(input);

  try {
    if (id) {
      await prisma.category.update({ where: { id }, data });
    } else {
      await prisma.category.create({ data });
    }
    log.info(id ? 'category updated' : 'category created', {
      id,
      name: data.name,
      kind: data.kind,
      color: data.color,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      log.warn('category rejected', { name: data.name, reason: 'duplicate name' });
      return { error: 'A category with that name already exists.' };
    }
    throw e;
  }

  revalidateFinanceTags(CACHE_TAGS.categories);
  revalidatePath('/categories');
  revalidatePath('/dashboard');
  revalidatePath('/transactions');
  return { ok: true };
}

export async function deleteCategory(id: string, replacementId?: string) {
  await requireAuthenticatedUser();

  const txCount = await prisma.transaction.count({ where: { categoryId: id } });

  if (txCount > 0) {
    if (!replacementId) {
      log.warn('category delete rejected', { id, txCount, reason: 'replacement category required' });
      throw new Error('Replacement category required');
    }

    // Atomically reassign transactions and delete the category
    await prisma.$transaction([
      prisma.transaction.updateMany({
        where: { categoryId: id },
        data:  { categoryId: replacementId },
      }),
      prisma.recurringRule.updateMany({
        where: { categoryId: id },
        data:  { categoryId: replacementId },
      }),
      prisma.category.delete({ where: { id } }),
    ]);
  } else {
    await prisma.category.delete({ where: { id } });
  }

  log.info('category deleted', { id, reassignedTo: replacementId, reassigned: txCount });

  // Deleting a used category reassigns both transactions and recurring rules.
  revalidateFinanceTags(CACHE_TAGS.categories, CACHE_TAGS.transactions, CACHE_TAGS.recurring);
  revalidatePath('/categories');
  revalidatePath('/dashboard');
  revalidatePath('/transactions');
}
