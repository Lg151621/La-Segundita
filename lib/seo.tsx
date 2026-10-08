import type { Metadata } from 'next';
import { copy, pagePath, t, type Lang, type Page } from './i18n';
import { isProvided } from './store';
import { getSiteContent, type SiteContent } from './content';
import { isClosed, parseHours } from './hours';
import { absoluteUrl, cityLabel, parseAddress, siteUrl } from './site';

// Titles, descriptions, canonical/hreflang, and share cards. Location comes from the Store Settings address in Sanity.
export async function pageMetadata(page: Page, lang: Lang): Promise<Metadata> {
  const { settings } = await getSiteContent();
  const m = copy[lang].meta, place = cityLabel(t(settings.address, lang));
  const title = page === 'home' ? m.homeTitle(place) : m.storyTitle;
  const description = page === 'home' ? m.homeDescription(place) : m.storyDescription(place);
  // Share cards live in public/og/ (1200×630). Replace them freely; keep the file names.
  const image = { url: `/og/share-${lang}.png`, width: 1200, height: 630, alt: `La Segundita — ${copy[lang].hero.title.join(' ')}` };
  return {
    metadataBase: new URL(siteUrl),
    title: { absolute: title }, description,
    alternates: { canonical: pagePath(page, lang), languages: { en: pagePath(page, 'en'), es: pagePath(page, 'es'), 'x-default': pagePath(page, 'en') } },
    openGraph: { type: 'website', siteName: 'La Segundita', title, description, url: pagePath(page, lang), locale: lang === 'es' ? 'es_US' : 'en_US', alternateLocale: lang === 'es' ? 'en_US' : 'es_US', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    icons: { icon: '/favicon.svg' },
  };
}

const businessId = absoluteUrl('/#business');
const days = { mondayFriday: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], saturday: ['Saturday'], sunday: ['Sunday'] } as const;

// The one business entity, built only from approved facts. Address, phone, hours, map, and social profiles
// join automatically once they are real values in Store Settings; nothing is guessed.
function business(lang: Lang, content: SiteContent) {
  const { settings, photos } = content;
  const addressText = t(settings.address, lang), phone = t(settings.phone, lang);
  const address = parseAddress(addressText);
  const socials = Object.values(settings.socials).filter(Boolean);
  // Hours only from values that read as real times; closed days open and close at 00:00, per Google's guidance.
  const openingHours = (Object.keys(days) as (keyof typeof days)[]).flatMap(key => {
    const text = t(settings.hours[key], 'en');
    const times = isClosed(text) ? { opens: '00:00', closes: '00:00' } : parseHours(text);
    return times ? [{ '@type': 'OpeningHoursSpecification', dayOfWeek: [...days[key]], ...times }] : [];
  });
  const storefront = photos.storefront.src;
  return {
    '@type': 'ClothingStore', '@id': businessId,
    name: 'La Segundita', description: copy[lang].meta.homeDescription(cityLabel(addressText)),
    url: absoluteUrl('/'),
    image: storefront ? (u => (u.searchParams.set('w', '1200'), u.searchParams.set('auto', 'format'), u.href))(new URL(storefront, siteUrl)) : absoluteUrl(`/og/share-${lang}.png`),
    slogan: copy[lang].hero.title.join(' '),
    ...(address
      ? { address: { '@type': 'PostalAddress', ...address, ...(address.postalCode && /^\d{5}/.test(address.postalCode) && { addressCountry: 'US' }) } }
      : isProvided(addressText) && { address: addressText }),
    ...(isProvided(phone) && { telephone: phone }),
    ...(settings.directions && { hasMap: settings.directions }),
    ...(socials.length && { sameAs: socials }),
    ...(openingHours.length && { openingHoursSpecification: openingHours }),
  };
}

export function structuredData(page: Page, lang: Lang, content: SiteContent) {
  const url = absoluteUrl(pagePath(page, lang));
  const graph: object[] = [business(lang, content)];
  if (page === 'home') graph.unshift({ '@type': 'WebSite', '@id': absoluteUrl('/#website'), url: absoluteUrl('/'), name: 'La Segundita', inLanguage: ['en', 'es'], publisher: { '@id': businessId } });
  else graph.unshift({ '@type': 'AboutPage', '@id': `${url}#page`, url, name: copy[lang].meta.storyTitle, inLanguage: lang, about: { '@id': businessId } });
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}/>;
}
