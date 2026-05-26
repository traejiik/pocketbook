'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAuthenticatedUser } from '@/lib/require-auth';

export async function saveInsight(content: string, model: string, monthCovered: string) {
  await requireAuthenticatedUser();
  const user = await prisma.user.findFirst();
  if (!user) throw new Error('No user found');

  await prisma.aiInsight.create({
    data: { userId: user.id, monthCovered, modelUsed: model, content },
  });
  revalidatePath('/insights');
}

export async function setInsightFeedback(id: string, feedback: 'helpful' | 'not-useful') {
  await requireAuthenticatedUser();
  await prisma.aiInsight.update({ where: { id }, data: { feedback } });
}

export async function getInsightHistory() {
  await requireAuthenticatedUser();
  return prisma.aiInsight.findMany({
    orderBy: { generatedAt: 'desc' },
    take: 12,
  });
}
