/**
 * Only app-relative paths are followed ("/workspaces/…"), never another
 * origin, even though hrefs are built on the server.
 */
export function isSafeNotificationHref(href: string | null | undefined): href is string {
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//') && !href.includes('\\');
}
