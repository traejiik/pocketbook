'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache';
import { requireAuthenticatedUser } from '@/lib/require-auth';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { randomCategoryColor } from '@/lib/colors';

const log = logger('categories');

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  kind: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
  includeInBalance: z.boolean().default(true),
});

export type CategoryInput = z.input<typeof categorySchema>;

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
      includeInBalance: data.includeInBalance,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      log.warn('category rejected', { name: data.name, reason: 'duplicate name' });
      return { error: 'A category with that name already exists.' };
    }
    throw e;
  }

  // `categories` also reaches the carry-over read (`cumulative-net`), which filters
  // on `includeInBalance`, so a toggle re-derives every month's balance.
  revalidateFinanceTags(CACHE_TAGS.categories);
  revalidatePath('/categories');
  revalidatePath('/dashboard');
  revalidatePath('/transactions');
  revalidatePath('/insights');
  return { ok: true };
}

/**
 * Create a category from an import review, so an unknown name in a CSV can be
 * adopted without leaving the sheet. The colour is picked from the palette and
 * can be changed later on the Categories page. An existing category with the
 * same name and kind is returned as-is, so a double click is harmless.
 */
export async function createCategoryFromImport(
  name: string,
  kind: 'INCOME' | 'EXPENSE' | 'SAVINGS',
): Promise<{ id: string; name: string; color: string; kind: 'INCOME' | 'EXPENSE' | 'SAVINGS' } | { error: string }> {
  await requireAuthenticatedUser();

  const parsed = z.object({
    name: z.string().trim().min(1).max(100),
    kind: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
  }).safeParse({ name, kind });
  if (!parsed.success) return { error: 'That category name is not valid.' };

  const existing = await prisma.category.findFirst({
    where: { name: { equals: parsed.data.name, mode: 'insensitive' }, kind: parsed.data.kind },
    select: { id: true, name: true, color: true, kind: true },
  });
  if (existing) return { ...existing, kind: existing.kind as 'INCOME' | 'EXPENSE' | 'SAVINGS' };

  const created = await prisma.category.create({
    data: { name: parsed.data.name, kind: parsed.data.kind, color: randomCategoryColor() },
    select: { id: true, name: true, color: true, kind: true },
  });
  log.info('category created from import', { id: created.id, name: created.name, kind: created.kind });

  revalidateFinanceTags(CACHE_TAGS.categories);
  revalidatePath('/categories');
  return { ...created, kind: created.kind as 'INCOME' | 'EXPENSE' | 'SAVINGS' };
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
