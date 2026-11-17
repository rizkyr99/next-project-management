import { NextRequest, NextResponse } from 'next/server';
import { auth } from './lib/auth';
import { headers } from 'next/headers';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { safeCallbackPath } from '@/lib/safe-redirect';

// Better Auth endpoints that take credentials or send email: strict, per IP,
// against credential stuffing and sign-up spam. Everything else under
// /api/auth (session reads the client makes in the background, sign-out) gets
// a generous limit, so a busy office behind one IP isn't locked out.
const SENSITIVE_AUTH =
  /^\/api\/auth\/(sign-in|sign-up|forget-password|request-password-reset|reset-password|change-password|send-verification-email)(\/|$)/;

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
    pathname.startsWith('/opengraph-image') ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/email-verified';

  if (isAuthPage && session) {
    const target = safeCallbackPath(request.nextUrl.searchParams.get('callbackURL'));
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (!isAuthPage && !isPublicPage && !session) {
    const login = new URL('/login', request.url);
    if (pathname !== '/') {
      login.searchParams.set('callbackURL', `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Pages (everything except API routes, Next internals and files).
    '/((?!api|_next/static|_next/image|static|.*\\.).*)',
    // Auth API, for rate limiting only. The page matcher above excludes /api,
    // which used to mean auth endpoints were never rate limited at all.
    '/api/auth/:path*',
  ],
};
