'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { Prisma } from '@prisma/client';

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  kind: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export async function upsertCategory(input: CategoryInput): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorised');

  const { id, ...data } = categorySchema.parse(input);

  try {
    if (id) {
      await prisma.category.update({ where: { id }, data });
    } else {
      await prisma.category.create({ data });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'A category with that name already exists.' };
    }
    throw e;
  }

  revalidatePath('/categories');
  revalidatePath('/dashboard');
  revalidatePath('/transactions');
  return { ok: true };
}

export async function deleteCategory(id: string, replacementId?: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorised');

  const txCount = await prisma.transaction.count({ where: { categoryId: id } });

  if (txCount > 0) {
    if (!replacementId) throw new Error('Replacement category required');

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

  revalidatePath('/categories');
  revalidatePath('/dashboard');
  revalidatePath('/transactions');
}
