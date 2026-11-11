import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    sessionVersion?: number;
  }

  interface Session {
    user: DefaultSession['user'] & { id: string };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sessionVersion?: number;
  }
}
