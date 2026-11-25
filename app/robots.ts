import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/** Public marketing pages only; the app itself is private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/pricing', '/privacy', '/terms'],
      disallow: ['/workspaces', '/settings', '/notifications', '/invites', '/invite/', '/share/', '/home', '/api/'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
