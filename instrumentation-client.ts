// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
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

  // Session Replay is lazy-loaded below instead of bundled: it's most of
  // Sentry's client weight and was in the critical path of every page.
  integrations: [],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

// Load Replay from Sentry's CDN once the browser is idle (CSP allows
// browser.sentry-cdn.com in next.config.ts). The sample rates above still
// apply once it's added.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  const loadReplay = () =>
    Sentry.lazyLoadIntegration('replayIntegration')
      // Explicit privacy settings: /privacy promises that typed text and page
      // content are masked in recordings (these are also Sentry's defaults).
      .then((replayIntegration) =>
        Sentry.addIntegration(replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })),
      )
      .catch(() => {
        // Blocked or offline: errors are still reported, just without replay.
      });
  if ('requestIdleCallback' in window) window.requestIdleCallback(loadReplay, { timeout: 5000 });
  else setTimeout(loadReplay, 3000);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
