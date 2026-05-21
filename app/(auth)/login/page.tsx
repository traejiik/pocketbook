import { readFileSync } from 'fs';
import { join } from 'path';
import { headers } from 'next/headers';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const displayName = process.env.PB_USER_DISPLAY_NAME ?? 'back';
  const version = `v${JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version}`;
  const instanceName = process.env.PB_INSTANCE_NAME ?? '';
  const host = (await headers()).get('host') ?? '';
  return <LoginForm displayName={displayName} version={version} instanceName={instanceName} host={host} />;
}
