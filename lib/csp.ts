/**
 * Content Security Policy.
 *
 * Two policies are sent:
 * - `enforcedCsp()` (next.config.ts, every response): the long-standing
 *   policy, which still allows inline scripts.
 * - `strictCsp()` (proxy.ts, pages only), sent as Report-Only while we watch
 *   for violations in Sentry. Dynamic pages get a fresh nonce per request and
 *   `'strict-dynamic'`: only scripts Next marked with the nonce, and scripts
 *   those load, may run. Static pages are built once, so they carry no nonce;
 *   they keep `'unsafe-inline'`. They render no user content.
 *
 * Once Sentry stays quiet, the strict policy replaces the enforced one.
 */

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
const SENTRY_REPORT_URI = (() => {
  const env = process.env.VERCEL_ENV ?? (isDev ? 'development' : 'production');
  return (
    'https://o4511237520883712.ingest.de.sentry.io/api/4511249899257936/security/' +
    `?sentry_key=09d2571a7c72c1fb4050b24656134159&sentry_environment=${env}`
  );
})();

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

/** The policy enforced today. */
export function enforcedCsp() {
  return serialize({
    'default-src': ["'self'"],
    // Dev only: React's dev build and Turbopack's HMR use eval.
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), ...SOURCES.scripts],
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
 *
 * Not listed: the root 404 for an unknown URL (logged-in only; logged-out
 * visitors are sent to log in). It's static too, but its paths can't be known
 * here, and making it dynamic makes every page dynamic. Before enforcing,
 * either accept that it renders without scripts there (links still work) or
 * give it its own policy.
 */
export const STATIC_PAGES = new Set(['/', '/pricing', '/privacy', '/terms', '/forgot-password', '/create-workspace']);

/** A random nonce, base64. Works in the proxy's runtime (Web Crypto). */
export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
