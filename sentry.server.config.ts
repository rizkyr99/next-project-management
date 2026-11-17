// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Only production builds report. Local dev and E2E runs used to send every
  // trace and replay through the /monitoring tunnel; when Sentry was slow to
  // reach, those requests piled up and starved the browser's per-host
  // connection pool, stalling page loads (and polluting the real project).
  enabled: process.env.NODE_ENV === 'production',
  dsn: "https://09d2571a7c72c1fb4050b24656134159@o4511237520883712.ingest.de.sentry.io/4511249899257936",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
