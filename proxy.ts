import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

const SECRET_AUTHENTICATED_CRON_PATHS = new Set([
  '/api/fx/sync',
  '/api/insights/monthly',
  '/api/recurring/sync',
])

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/auth')) return NextResponse.next();
  if (SECRET_AUTHENTICATED_CRON_PATHS.has(pathname)) return NextResponse.next();
  if (!isLoggedIn && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (isLoggedIn && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
});

export const config = {
  // PWA assets (manifest + icons) must stay public so the install prompt works
  // from the login page and while logged out — same treatment as favicon.ico.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)'],
};
