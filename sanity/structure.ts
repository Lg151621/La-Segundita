import type { StructureResolver } from 'sanity/structure';
import { studioLabel, type StudioLabelKey } from './i18n';

// The Studio sidebar, in the order owners use it. Singletons open directly instead of listing documents.
export const structure: StructureResolver = S => {
  const title = (key: StudioLabelKey) => studioLabel(key).title;
  const i18n = (key: StudioLabelKey) => studioLabel(key).i18n;
  const singleton = (type: string, key: StudioLabelKey) =>
    S.listItem().title(title(key)).i18n(i18n(key)).id(type).schemaType(type)
      .child(S.document().schemaType(type).documentId(type).title(title(key)).i18n(i18n(key)));
  const typeList = (type: string, key: StudioLabelKey) => S.documentTypeListItem(type).title(title(key)).i18n(i18n(key));

  return S.list().title(title('structure.title')).i18n(i18n('structure.title')).items([
    singleton('storeSettings', 'structure.store-settings'),
    singleton('featuredPhotos', 'structure.featured-photos'),
    S.divider(),
    typeList('freshFind', 'structure.fresh-finds'),
    typeList('socialFeature', 'structure.social-features'),
    typeList('announcement', 'structure.announcements'),
  ]);
};
