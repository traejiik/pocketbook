import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authConfig } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const log = logger('auth');

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { password: { type: 'password' } },
      async authorize({ password }) {
        // prisma is stubbed until session 2; auth won't run until DB is live
        if (!prisma) return null;
        const user = await prisma.user.findFirst();
        if (!user) {
          log.error('sign-in failed', { reason: 'no user row — has the seed run?' });
          return null;
        }
        const ok = await bcrypt.compare(password as string, user.passwordHash);
        // Never the password, never a hash: only whether the attempt succeeded.
        if (ok) log.info('sign-in succeeded', { email: user.email });
        else log.warn('sign-in failed', { reason: 'incorrect password' });
        return ok ? { id: user.id, email: user.email } : null;
      },
    }),
  ],
});
