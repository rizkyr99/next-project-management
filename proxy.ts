import { NextRequest, NextResponse } from 'next/server';
import { auth } from './lib/auth';
import { headers } from 'next/headers';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { safeCallbackPath } from '@/lib/safe-redirect';
import { REPORTING_ENDPOINTS, STATIC_PAGES, createNonce, enforcedCsp, strictCsp } from '@/lib/csp';

// Better Auth endpoints that take credentials or send email: strict, per IP,
// against credential stuffing and sign-up spam. Everything else under
// /api/auth (session reads the client makes in the background, sign-out) gets
// a generous limit, so a busy office behind one IP isn't locked out.
const SENSITIVE_AUTH =
  /^\/api\/auth\/(sign-in|sign-up|forget-password|request-password-reset|reset-password|change-password|send-verification-email)(\/|$)/;

/** Public marketing pages (app/(marketing)). */
const MARKETING_PAGES = new Set(['/', '/pricing', '/privacy', '/terms']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit auth endpoints before any session check
  if (pathname.startsWith('/api/auth')) {
    const sensitive = SENSITIVE_AUTH.test(pathname);
    const opts = sensitive ? LIMITS.authSensitive : LIMITS.authGeneral;
    const ip = clientIp(request.headers);
    const result = await rateLimit(`${sensitive ? 'auth' : 'auth-general'}:${ip}`, opts);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
            'X-RateLimit-Limit': String(opts.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetAt),
          },
        },
      );
    }

    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Limit', String(opts.limit));
    res.headers.set('X-RateLimit-Remaining', String(result.remaining));
    res.headers.set('X-RateLimit-Reset', String(result.resetAt));
    return res;
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const isAuthPage =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register');

  // Invite links must open for logged-out people too: the page itself offers
  // sign-in / sign-up and carries them back via ?callbackURL. The share image
  // must be reachable by link-preview crawlers, which are never logged in.
  // Password reset and email-verification landing pages work whether or not
  // someone is signed in (links are often opened in another browser).
  const isPublicPage =
    pathname.startsWith('/invite/') ||
    // C4: a project's read-only share link, for clients without an account.
    pathname.startsWith('/share/') ||
    pathname.startsWith('/opengraph-image') ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/email-verified' ||
    MARKETING_PAGES.has(pathname);

  // `/` is the public landing page; signed-in people go straight to the app.
  if (pathname === '/' && session) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  if (isAuthPage && session) {
    const target = safeCallbackPath(request.nextUrl.searchParams.get('callbackURL'));
    return NextResponse.redirect(new URL(target, request.url));
  }

  // Server action calls (POSTs with a Next-Action header) are never
  // redirected: the browser expects an action response, not a login page
  // ("An unexpected response was received from the server"). Every action
  // checks the session itself and answers with a "session expired" message.
  const isServerAction = request.method === 'POST' && request.headers.has('next-action');

  if (!isAuthPage && !isPublicPage && !session && !isServerAction) {
    const login = new URL('/login', request.url);
    if (pathname !== '/') {
      login.searchParams.set('callbackURL', `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(login);
  }

  return withCsp(request);
}

/**
 * Lets the page through with the strict policy (Report-Only for now; see
 * lib/csp.ts). For dynamic pages, the nonce also goes on the request's CSP
 * header, which is where Next reads it to mark its own scripts.
 */
function withCsp(request: NextRequest) {
  // Both policies are set here, on page responses only, and not in
  // next.config.ts headers(): on Vercel those are also added to the incoming
  // request, and Next then read the nonce-less enforced policy and never
  // marked its scripts. Only HTML pages need a CSP; they all pass through here.
  if (process.env.NODE_ENV !== 'production') {
    // `next dev` builds the theme script differently, so the strict policy's
    // hash wouldn't match; just enforce the base policy.
    const res = NextResponse.next();
    res.headers.set('Content-Security-Policy', enforcedCsp());
    return res;
  }

  const nonce = STATIC_PAGES.has(request.nextUrl.pathname) ? undefined : createNonce();
  const enforced = enforcedCsp(nonce);
  const policy = strictCsp(nonce);
  // Next reads the nonce from the request's CSP header to mark its scripts.
  // Same value as the response header (on Vercel, the response's wins).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('content-security-policy', enforced);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', enforced);
  res.headers.set('Content-Security-Policy-Report-Only', policy);
  res.headers.set('Reporting-Endpoints', REPORTING_ENDPOINTS);
  return res;
}

export const config = {
  matcher: [
    // Pages (everything except API routes, Next internals and files).
    // /monitoring is Sentry's tunnel (next.config.ts tunnelRoute): it must
    // never be auth-gated, or logged-out visitors' errors are redirected to
    // /login and lost.
    '/((?!api|_next/static|_next/image|static|monitoring|.*\\.).*)',
    // Auth API, for rate limiting only. The page matcher above excludes /api,
    // which used to mean auth endpoints were never rate limited at all.
    '/api/auth/:path*',
  ],
};
