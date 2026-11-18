/**
 * Content Security Policy. Both policies are set by proxy.ts on page
 * responses (not next.config.ts; see the note there).
 *
 * - `enforcedCsp(nonce?)`: enforced. On dynamic pages it carries a fresh
 *   nonce per request plus the theme script's hash, so inline scripts must
 *   have one or the other. On static pages (built once, no nonce) inline
 *   scripts are allowed; those pages render no user content.
 * - `strictCsp(nonce?)`: Report-Only while we watch Sentry for violations.
 *   Adds `'strict-dynamic'` (no host allowlist), `form-action` and
 *   `upgrade-insecure-requests`. Once quiet, it replaces the enforced one.
 */

import { sentryEnvironment } from './sentry-options';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * next-themes' inline script, which sets the theme class before first paint.
 * It's rendered from the root layout, which can't read the nonce without
 * making every page dynamic, so it's allowed by hash. e2e/csp.spec.ts checks
 * this against the script actually on the page, and prints the new value if
 * a next-themes upgrade changes it.
 */
export const THEME_SCRIPT_HASH = "'sha256-n46vPwSWuMC0W703pBofImv82Z26xo4LXymv0E9caPk='";

/** Sentry's CSP report endpoint, from the public DSN. */
const SENTRY_REPORT_URI =
  'https://o4511237520883712.ingest.de.sentry.io/api/4511249899257936/security/' +
  `?sentry_key=09d2571a7c72c1fb4050b24656134159&sentry_environment=${sentryEnvironment}`;

/** Origins the app talks to, shared by both policies. */
const SOURCES = {
  // Stripe.js; Sentry Replay, lazy-loaded from Sentry's CDN.
  scripts: ['https://js.stripe.com', 'https://browser.sentry-cdn.com'],
  images: ["'self'", 'blob:', 'data:', 'https://lh3.googleusercontent.com'],
  frames: ['https://js.stripe.com', 'https://hooks.stripe.com'],
  // Sentry goes through the same-origin /monitoring tunnel; Speed Insights
  // through /_vercel. Calls' STUN/TURN traffic isn't covered by CSP.
  connect: ["'self'", 'https://api.stripe.com'],
};

function serialize(directives: Record<string, string[]>) {
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(' '))
    .join('; ');
}

/**
 * The policy enforced today. With a nonce (dynamic pages), inline scripts
 * need the nonce or the theme hash: browsers ignore 'unsafe-inline' once a
 * nonce is present (it stays for very old browsers). The nonce has to be in
 * this policy, not only the strict one: on Vercel, the response's CSP header
 * is also what the page render sees, and Next takes the nonce from there.
 */
export function enforcedCsp(nonce?: string) {
  return serialize({
    'default-src': ["'self'"],
    // Dev only: React's dev build and Turbopack's HMR use eval.
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(nonce ? [`'nonce-${nonce}'`, THEME_SCRIPT_HASH] : []),
      ...(isDev ? ["'unsafe-eval'"] : []),
      ...SOURCES.scripts,
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': SOURCES.images,
    'font-src': ["'self'"],
    'frame-src': SOURCES.frames,
    'connect-src': SOURCES.connect,
    // Sentry Replay compresses in a Web Worker built from a blob: URL.
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'self'"],
  });
}

/** The stricter policy, sent as Report-Only. Without a nonce: static pages. */
export function strictCsp(nonce?: string) {
  const scripts = nonce
    ? [`'nonce-${nonce}'`, "'strict-dynamic'", THEME_SCRIPT_HASH]
    : ["'self'", "'unsafe-inline'", ...SOURCES.scripts];
  return serialize({
    'default-src': ["'self'"],
    'script-src': [...scripts, ...(isDev ? ["'unsafe-eval'"] : [])],
    // Inline styles stay: Radix and next/font set them, and style injection
    // can't run code.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': SOURCES.images,
    'font-src': ["'self'"],
    'frame-src': SOURCES.frames,
    'connect-src': SOURCES.connect,
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
    ...(isDev ? {} : { 'upgrade-insecure-requests': [] }),
    'report-uri': [SENTRY_REPORT_URI],
    'report-to': ['csp'],
  });
}

/** Pairs with `report-to csp` in the strict policy. */
export const REPORTING_ENDPOINTS = `csp="${SENTRY_REPORT_URI}"`;

/**
 * Pages Next builds as static HTML (○ in `next build`), so they never carry
 * a nonce. Keep in sync with the build output; e2e/csp.spec.ts visits each.
 * A static page missing here gets a nonce policy its scripts can't satisfy:
 * the HTML shows, but nothing on it runs.
 *
 * Known case: the root 404 for an unknown URL (logged-in only; logged-out
 * visitors are sent to log in). It's static, its paths can't be listed, and
 * making it dynamic makes every page dynamic. It's plain HTML with a link
 * home, so it still works without scripts.
 */
export const STATIC_PAGES = new Set(['/', '/pricing', '/privacy', '/terms', '/forgot-password', '/create-workspace']);

/** A random nonce, base64. Works in the proxy's runtime (Web Crypto). */
export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
