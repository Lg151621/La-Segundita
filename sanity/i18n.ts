import { defineLocaleResourceBundle } from 'sanity';

// Studio labels we define ourselves, as a translation bundle like Sanity's built-in ones.
// Every custom menu, sort, and sidebar label must carry an i18n key: Sanity reuses the same components for its built-in
// (translated) items and ours, and mixing keyed and un-keyed items makes those components' hooks change shape between
// renders ("The final argument passed to useMemo changed size between renders").
export const studioNamespace = 'la-segundita';

const resources = {
  'structure.title': 'La Segundita',
  'structure.store-settings': 'Store Settings',
  'structure.featured-photos': 'Featured Photos',
  'structure.fresh-finds': 'Fresh Finds',
  'structure.social-features': 'Social Features',
  'structure.announcements': 'Announcements',
  'sort.display-order': 'Display order',
} as const;
export type StudioLabelKey = keyof typeof resources;

export const studioLocaleBundle = defineLocaleResourceBundle({ locale: 'en-US', namespace: studioNamespace, resources });

// Title text plus its i18n key, for structure builders' .title()/.i18n() and schema orderings.
export const studioLabel = (key: StudioLabelKey) => ({ title: resources[key], i18n: { title: { key, ns: studioNamespace } } });
