import { cache } from 'react';
import type { Localized } from './i18n';
import type { StoreHours } from './hours';
import { store } from './store';
import { sanityFetch } from '@/sanity/lib/client';
import { siteContentQuery } from '@/sanity/lib/queries';
import { photoPosition, photoUrl, type SanityPhoto } from '@/sanity/lib/image';

// The content the site renders: Sanity's published values where they exist, the built-in placeholders (lib/store.ts) everywhere else.
export type PhotoSource = { src: string; alt?: Localized; position?: string };
export type Socials = { instagram: string; tiktok: string; depop: string; poshmark: string };
export type SiteContent = {
  settings: { address: Localized; phone: Localized; phoneHref: string; directions: string; hours: StoreHours; socials: Socials };
  photos: Record<'storefront' | 'inside' | 'welcome' | 'team' | 'momPortrait' | 'auntPortrait', PhotoSource>;
  welcomeCaption: Localized | null;
  finds: { name: Localized; caption: Localized | null; type: string; photo: PhotoSource }[];
  socialFeatures: { label: Localized; url: string; type: string; photo: PhotoSource }[];
  announcement: Localized | null;
};

type Text = { en?: string; es?: string } | null | undefined;
type RawContent = {
  settings: { address?: string; phone?: string; directionsUrl?: string; mondayFridayHours?: Text; saturdayHours?: Text; sundayHours?: Text } & Partial<Socials> | null;
  photos: { storefront?: SanityPhoto; inside?: SanityPhoto; welcome?: SanityPhoto; welcomeCaption?: Text; momPortrait?: SanityPhoto; auntPortrait?: SanityPhoto; team?: SanityPhoto } | null;
  findCount?: number;
  finds: { name: Text; caption?: Text; category?: string; image?: SanityPhoto }[] | null;
  socialFeatureCount?: number;
  socialFeatures: { label: Text; url?: string; image?: SanityPhoto }[] | null;
  announcements: { message: Text; startsAt?: string; endsAt?: string }[] | null;
};

const text = (value: Text): Localized | null => (value?.en?.trim() ? { en: value.en.trim(), es: value.es?.trim() || undefined } : null);
const plain = (value: string | undefined, fallback: Localized): Localized => value?.trim() || fallback;
const photo = (value: SanityPhoto | undefined, fallbackSrc = ''): PhotoSource => {
  const src = photoUrl(value);
  return src ? { src, alt: text(value?.alt) ?? undefined, position: photoPosition(value) } : { src: fallbackSrc };
};
const placeholderTypes = ['jacket', 'bag', 'interior'];

export const getSiteContent = cache(async (): Promise<SiteContent> => {
  const raw = await sanityFetch<RawContent>(siteContentQuery);
  const s = raw?.settings, p = raw?.photos;
  const phone = s?.phone?.trim();
  const now = new Date().toISOString();
  const active = raw?.announcements?.find(a => (!a.startsAt || a.startsAt <= now) && (!a.endsAt || a.endsAt > now));
  return {
    settings: {
      address: plain(s?.address, store.address),
      phone: plain(phone, store.phone),
      phoneHref: phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : store.phoneHref,
      directions: s?.directionsUrl || store.directions,
      hours: {
        mondayFriday: text(s?.mondayFridayHours) ?? store.hours.mondayFriday,
        saturday: text(s?.saturdayHours) ?? store.hours.saturday,
        sunday: text(s?.sundayHours) ?? store.hours.sunday,
      },
      socials: {
        instagram: s?.instagram || store.socials.instagram, tiktok: s?.tiktok || store.socials.tiktok,
        depop: s?.depop || store.socials.depop, poshmark: s?.poshmark || store.socials.poshmark,
      },
    },
    photos: {
      storefront: photo(p?.storefront, store.photos.storefront), inside: photo(p?.inside, store.photos.inside),
      welcome: photo(p?.welcome, store.photos.welcome), team: photo(p?.team, store.photos.team),
      momPortrait: photo(p?.momPortrait, store.owners.mom.portrait), auntPortrait: photo(p?.auntPortrait, store.owners.aunt.portrait),
    },
    welcomeCaption: text(p?.welcomeCaption),
    // Built-in samples only until the owners create their first item; after that, hidden items simply disappear.
    finds: raw?.findCount
      ? (raw.finds ?? []).map(f => ({ name: text(f.name)!, caption: text(f.caption), type: f.category || 'jacket', photo: photo(f.image) }))
      : store.finds.map(f => ({ name: f.name, caption: null, type: f.type, photo: { src: f.image } })),
    socialFeatures: raw?.socialFeatureCount
      ? (raw.socialFeatures ?? []).map((f, i) => ({ label: text(f.label)!, url: f.url || '', type: placeholderTypes[i % 3], photo: photo(f.image) }))
      : store.socialPhotos.map(f => ({ label: f.label, url: '', type: f.type, photo: { src: f.image } })),
    announcement: text(active?.message),
  };
});

