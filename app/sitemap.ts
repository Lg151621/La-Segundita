import type { MetadataRoute } from 'next';
import { pagePath, type Page } from '@/lib/i18n';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';
const url = absoluteUrl;

export default function sitemap(): MetadataRoute.Sitemap {
  return (['home', 'story'] as Page[]).flatMap(page => (['en', 'es'] as const).map(lang => ({
    url: url(pagePath(page, lang)), changeFrequency: 'monthly' as const, priority: page === 'home' ? 1 : 0.8,
    alternates: { languages: { en: url(pagePath(page, 'en')), es: url(pagePath(page, 'es')) } },
  })));
}
