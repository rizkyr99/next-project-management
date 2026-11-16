/**
 * The app's canonical public URL, used for metadataBase (absolute OG/Twitter
 * URLs) and for links in emails. Order: explicit config, then the auth base
 * URL, then Vercel's production domain, then localhost.
 */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000');
  return raw.replace(/\/$/, '');
}

export const SITE_NAME = 'Tide';
export const SITE_DESCRIPTION =
  'Project management for small teams: workspaces, kanban boards, tasks, comments and real-time updates.';
