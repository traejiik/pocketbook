import type { NextAuthConfig } from 'next-auth';

// Edge-safe config — no Node.js-only dependencies (bcryptjs, Prisma).
// Used by middleware to validate the JWT without touching the database.
export const authConfig = {
  session: { strategy: 'jwt' },
  providers: [],
  pages: { signIn: '/login' },
} satisfies NextAuthConfig;
