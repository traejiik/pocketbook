import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { activeSetupCodeExpiry } from '@/lib/owner/setup';
import { SetupForm } from './SetupForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (await prisma.user.findFirst({ select: { id: true } })) redirect('/login');
  const setup = await prisma.appSettings.findUnique({
    where: { id: 'singleton' },
    select: { setupCodeHash: true, setupCodeExpiresAt: true },
  });
  return <SetupForm initialCodeExpiry={activeSetupCodeExpiry(setup)} />;
}
