/**
 * The app's canonical public URL, used for metadataBase (absolute OG/Twitter
 * URLs) and for links in emails. Order: explicit config, then the auth base
 * URL, then Vercel's production domain, then localhost.
 */
export function siteUrl(): string {
  // `||`, not `??`: a blank value (FOO= in .env) must fall through too.
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : 'http://localhost:3000');
  return raw.replace(/\/$/, '');
}

export const SITE_NAME = 'Tide';
/** The one-line positioning (E4): who it's for and what makes it different. */
export const SITE_TAGLINE = 'Project management for studios and agencies';
export const SITE_DESCRIPTION =
  'Project management for small studios and agencies: one board for your team, and a place for each client to follow progress, comment and approve work. Clients join free.';
