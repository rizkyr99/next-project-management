/**
 * Settings shared by the three Sentry configs (client, server, edge).
 *
 * The release is set by the Sentry build plugin from VERCEL_GIT_COMMIT_SHA,
 * matching the uploaded source maps, so it isn't set here.
 */
export const SENTRY_DSN =
  'https://09d2571a7c72c1fb4050b24656134159@o4511237520883712.ingest.de.sentry.io/4511249899257936';

/**
 * Only production builds report. Local dev and E2E runs used to send every
 * trace and replay through the /monitoring tunnel; when Sentry was slow to
 * reach, those requests piled up and starved the browser's per-host
 * connection pool, stalling page loads (and polluting the real project).
 * CI's E2E runs a production build; NEXT_PUBLIC_SENTRY_DISABLED keeps it quiet.
 */
export const sentryEnabled = process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SENTRY_DISABLED;

/**
 * "production", "preview" or "development" on Vercel; "local" for a
 * production build run elsewhere. Alerts filter on "production". The
 * NEXT_PUBLIC_ copy is Vercel's system variable for the browser.
 */
export const sentryEnvironment = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? 'local';

export const sharedSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: sentryEnabled,
  environment: sentryEnvironment,
  tracesSampleRate: 1,
  enableLogs: true,
  // Off: it would attach request cookies (including the session token),
  // headers and IP addresses. Events carry the user's ID instead
  // (lib/sentry-user.ts), never their email.
  sendDefaultPii: false,
};
