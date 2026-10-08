import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';
export default function robots(): MetadataRoute.Robots {
  // Public pages are crawlable; the Sanity Studio and the webhook endpoint are not content.
  return { rules: { userAgent: '*', allow: '/', disallow: ['/studio/', '/api/'] }, sitemap: absoluteUrl('/sitemap.xml') };
}
