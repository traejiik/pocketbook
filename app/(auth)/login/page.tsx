import { readFileSync } from 'fs';
import { join } from 'path';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ passwordChanged?: string }>;
}) {
  const owner = await prisma.user.findFirst({ select: { displayName: true } });
  if (!owner) redirect('/setup');
  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' }, select: { instanceName: true } });
  const displayName = owner.displayName ?? process.env.PB_USER_DISPLAY_NAME ?? 'back';
  const version = `v${JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version}`;
  const instanceName = settings?.instanceName ?? process.env.PB_INSTANCE_NAME ?? '';
  const host = (await headers()).get('host') ?? '';
  return <LoginForm displayName={displayName} version={version} instanceName={instanceName} host={host} passwordChanged={(await searchParams).passwordChanged === '1'} />;
}
