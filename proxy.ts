import { NextRequest, NextResponse } from 'next/server';
import { auth } from './lib/auth';
import { headers } from 'next/headers';
import { rateLimit } from '@/lib/rate-limit';

// 20 requests per minute per IP on auth endpoints — prevents credential stuffing
const AUTH_LIMIT = { limit: 20, windowMs: 60_000 };

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit auth endpoints before any session check
  if (pathname.startsWith('/api/auth')) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const result = rateLimit(`auth:${ip}`, AUTH_LIMIT);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Limit': String(AUTH_LIMIT.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetAt),
          },
        },
      );
    }

    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Limit', String(AUTH_LIMIT.limit));
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

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (!isAuthPage && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|static|.*\\.).*)'],
};
