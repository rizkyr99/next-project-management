const INTERNAL_ORIGIN = 'http://internal.invalid';

/**
 * Only allow same-origin relative redirects ("/invite/abc"). The value is
 * parsed the way browsers and `new URL()` will, so tricks like "//evil.com",
 * "/\evil.com" or "/\t/evil.com" (the URL parser strips tabs and newlines,
 * which turns it into "//evil.com") all fall back. Used for ?callbackURL on the
 * auth pages so they can't become an open redirect.
 *
 * Repeated query params arrive as arrays; the first value is used.
 */
export function safeCallbackPath(
  value: string | string[] | null | undefined,
  fallback = '/',
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || !candidate.startsWith('/')) return fallback;
  // Control characters and backslashes have no place in our paths, and
  // parsers treat them inconsistently.
  if (/[\u0000-\u001F\u007F\\]/.test(candidate)) return fallback;
  try {
    const url = new URL(candidate, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith('//') ? fallback : path;
  } catch {
    return fallback;
  }
}
