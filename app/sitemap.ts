import type { MetadataRoute } from 'next';
import { langs, pagePath, type Page } from '@/lib/i18n';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';

// Public pages only (the Studio and API routes are never listed), with the same canonical URLs the pages declare.
// Entries carry just the URL and its language alternates (incl. x-default, matching each page's hreflang tags).
// No changeFrequency/priority/lastModified: Google ignores the first two, and Next.js writes them after the
// <xhtml:link> alternates, which breaks the sitemaps.org schema's required element order.
const pages: Page[] = ['home', 'story'];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.flatMap(page => langs.map(lang => ({
    url: absoluteUrl(pagePath(page, lang)),
    alternates: { languages: { en: absoluteUrl(pagePath(page, 'en')), es: absoluteUrl(pagePath(page, 'es')), 'x-default': absoluteUrl(pagePath(page, 'en')) } },
  })));
}
