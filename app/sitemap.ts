import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';
import { HELP_ARTICLES } from '@/features/help/articles';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/help`, changeFrequency: 'monthly', priority: 0.6 },
    ...HELP_ARTICLES.map((a) => ({ url: `${base}/help/${a.slug}`, changeFrequency: 'monthly' as const, priority: 0.5 })),
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
