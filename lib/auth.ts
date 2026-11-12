import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authConfig } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const log = logger('auth');

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (trigger === 'signIn' && user?.id && Number.isInteger(user.sessionVersion)) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion;
        return token;
      }

      // Auth.js clears the session cookie when jwt returns null. A client
      // session update may supply data, but never supplies the token version.
      if (!token.sub || !Number.isInteger(token.sessionVersion)) return null;
      try {
        const owner = await prisma.user.findFirst({ select: { id: true, sessionVersion: true, displayName: true } });
        if (owner?.id !== token.sub || owner.sessionVersion !== token.sessionVersion) return null;
        token.name = owner.displayName;
        return token;
      } catch (err) {
        log.error('session validation failed', { err });
        return null;
      }
    },
    session({ session, token }) {
      return { ...session, user: { ...session.user, id: token.sub! } };
    },
  },
  providers: [
    Credentials({
      credentials: { password: { type: 'password' } },
      async authorize({ password }) {
        if (typeof password !== 'string' || !password) return null;
        const user = await prisma.user.findFirst();
        if (!user) {
          log.error('sign-in failed', { reason: 'owner setup incomplete' });
          return null;
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        // Never the password, never a hash: only whether the attempt succeeded.
        if (ok) log.info('sign-in succeeded', { email: user.email });
        else log.warn('sign-in failed', { reason: 'incorrect password' });
        return ok ? {
          id: user.id,
          email: user.email,
          name: user.displayName,
          sessionVersion: user.sessionVersion,
        } : null;
      },
    }),
  ],
});
