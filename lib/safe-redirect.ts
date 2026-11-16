/**
 * Only allow same-origin relative redirects ("/invite/abc"), never
 * "//evil.com", "/\evil.com" or "https://evil.com". Used for ?callbackURL on
 * the auth pages so they can't be turned into an open redirect.
 */
export function safeCallbackPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }
  return value;
}
