// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { config as zodConfig } from "zod";
import { sharedSentryOptions } from "./lib/sentry-options";

// Zod v4 checks whether it may compile validators with `new Function`. Our
// CSP forbids eval, so that check is a violation on every page with a form
// (and Zod falls back anyway). Skip the check. Runs before any schema loads.
zodConfig({ jitless: true });

Sentry.init({
  ...sharedSentryOptions,
  // Session Replay is lazy-loaded below instead of bundled: it's most of
  // Sentry's client weight and was in the critical path of every page.
  integrations: [],
  // 10% of sessions are recorded, and every session with an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Load Replay from Sentry's CDN once the browser is idle (CSP allows
// browser.sentry-cdn.com in next.config.ts). The sample rates above still
// apply once it's added.
if (typeof window !== 'undefined' && sharedSentryOptions.enabled) {
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
