import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';
import { logger, loggerConfig } from '@/lib/logger';

const { auth } = NextAuth(authConfig);

const SECRET_AUTHENTICATED_CRON_PATHS = new Set([
  '/api/fx/sync',
  '/api/insights/monthly',
  '/api/recurring/sync',
])

const log = logger('http');

/**
 * One line per request that reaches the app, so `docker logs` shows traffic
 * rather than silence. Static assets never get here (see `config.matcher`), and
 * the noisiest remaining category — router prefetches the browser fires on hover
 * — drops to `debug` so an ordinary session stays readable. Turn the whole thing
 * off with PB_LOG_REQUESTS=0.
 *
 * Proxy runs before the response exists, so there is no status or duration to
 * report here; `outcome` records the routing decision this file made, and route
 * handlers and Server Actions log their own results.
 */
function logRequest(req: Request & { method: string }, pathname: string, outcome: string, authed: boolean) {
  if (!loggerConfig().requests) return;
  const isAction = req.headers.get('next-action') !== null;
  const isPrefetch = req.headers.get('next-router-prefetch') !== null;
  const isRsc = req.headers.get('rsc') !== null;
  const fields = {
    outcome,
    auth: authed ? 'session' : 'anon',
    kind: isAction ? 'action' : isPrefetch ? 'prefetch' : isRsc ? 'rsc' : 'document',
  };
  const message = `${req.method} ${pathname}`;
  if (isPrefetch) log.debug(message, fields);
  else log.info(message, fields);
}

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/auth')) {
    logRequest(req, pathname, 'allow:auth', isLoggedIn);
    return NextResponse.next();
  }
  if (SECRET_AUTHENTICATED_CRON_PATHS.has(pathname)) {
    // Token-authenticated scheduler traffic. The route handler logs the outcome.
    logRequest(req, pathname, 'allow:internal', isLoggedIn);
    return NextResponse.next();
  }
  if (!isLoggedIn && pathname !== '/login') {
    logRequest(req, pathname, 'redirect:/login', isLoggedIn);
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (isLoggedIn && pathname === '/login') {
    logRequest(req, pathname, 'redirect:/dashboard', isLoggedIn);
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  logRequest(req, pathname, 'allow', isLoggedIn);
  return NextResponse.next();
});

export const config = {
  // PWA assets (manifest + icons) must stay public so the install prompt works
  // from the login page and while logged out — same treatment as favicon.ico.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)'],
};
