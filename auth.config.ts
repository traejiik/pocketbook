import type { NextAuthConfig } from 'next-auth';

// Shared defaults. All session validation uses lib/auth.ts in the Node runtime.
export const authConfig = {
  session: { strategy: 'jwt' },
  providers: [],
  pages: { signIn: '/login' },
} satisfies NextAuthConfig;
