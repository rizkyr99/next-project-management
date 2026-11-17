// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Only production builds report. Local dev and E2E runs used to send every
  // trace and replay through the /monitoring tunnel; when Sentry was slow to
  // reach, those requests piled up and starved the browser's per-host
  // connection pool, stalling page loads (and polluting the real project).
  // CI's E2E runs a production build; NEXT_PUBLIC_SENTRY_DISABLED keeps it quiet.
  enabled: process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SENTRY_DISABLED,
  dsn: "https://09d2571a7c72c1fb4050b24656134159@o4511237520883712.ingest.de.sentry.io/4511249899257936",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
