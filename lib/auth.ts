import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authConfig } from '@/auth.config';
import { prisma } from '@/lib/prisma';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { password: { type: 'password' } },
      async authorize({ password }) {
        // prisma is stubbed until session 2; auth won't run until DB is live
        if (!prisma) return null;
        const user = await prisma.user.findFirst();
        if (!user) return null;
        const ok = await bcrypt.compare(password as string, user.passwordHash);
        return ok ? { id: user.id, email: user.email } : null;
      },
    }),
  ],
});
