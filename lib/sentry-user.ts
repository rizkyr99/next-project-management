import * as Sentry from '@sentry/nextjs';

/**
 * Tags this request's errors with who hit them: the user ID only, never an
 * email or name. Sentry keeps a separate scope per request on the server,
 * so this doesn't leak into other users' events.
 */
export function tagSentryUser(user: { id: string } | null | undefined) {
  Sentry.setUser(user ? { id: user.id } : null);
}
