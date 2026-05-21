import { readFileSync } from 'fs';
import { join } from 'path';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  const displayName = process.env.PB_USER_DISPLAY_NAME ?? 'back';
  const version = `v${JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version}`;
  return <LoginForm displayName={displayName} version={version} />;
}
