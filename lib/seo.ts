import type { Metadata } from 'next';
import { copy, pagePath, t, type Lang, type Page } from './i18n';
import { isProvided, store } from './store';

export function pageMetadata(page: Page, lang: Lang): Metadata {
  const m = copy[lang].meta;
  const title = { absolute: page === 'home' ? m.homeTitle : `${m.storyTitle} | La Segundita` };
  const description = page === 'home' ? m.homeDescription : m.storyDescription;
  const shareTitle = page === 'home' ? m.homeTitle : `${m.storyTitle} | La Segundita`;
  // Share cards live in public/og/ (1200×630). Replace them freely; keep the file names.
  const image = { url: `/og/share-${lang}.png`, width: 1200, height: 630, alt: `La Segundita — ${copy[lang].hero.title.join(' ')}` };
  return {
    metadataBase: new URL(store.siteUrl),
    title, description,
    alternates: { canonical: pagePath(page, lang), languages: { en: pagePath(page, 'en'), es: pagePath(page, 'es'), 'x-default': pagePath(page, 'en') } },
    openGraph: { type: 'website', siteName: 'La Segundita', title: shareTitle, description, url: pagePath(page, lang), locale: lang === 'es' ? 'es_US' : 'en_US', alternateLocale: lang === 'es' ? 'en_US' : 'es_US', images: [image] },
    twitter: { card: 'summary_large_image', title: shareTitle, description, images: [image] },
    icons: { icon: '/favicon.svg' },
  };
}

// Structured data lists only approved facts; address, phone, hours and social profiles join automatically once they are real.
export function businessJsonLd(lang: Lang) {
  const address = t(store.address, lang), phone = t(store.phone, lang);
  const socials = Object.values(store.socials).filter(Boolean);
  return {
    '@context': 'https://schema.org', '@type': 'ClothingStore',
    name: 'La Segundita', description: copy[lang].meta.homeDescription, url: new URL(pagePath('home', lang), store.siteUrl).href,
    slogan: copy[lang].hero.title.join(' '), inLanguage: lang,
    ...(isProvided(address) && { address }),
    ...(isProvided(phone) && { telephone: phone }),
    ...(socials.length && { sameAs: socials }),
  };
}
