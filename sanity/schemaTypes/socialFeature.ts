import { defineField, defineType } from 'sanity';
import { HeartIcon } from '@sanity/icons/Heart';
import { requireEnglish } from './localeString';
import { studioLabel } from '../i18n';

// A taped photo card in the "Follow the Finds" section, optionally linking to a post.
export const socialFeature = defineType({
  name: 'socialFeature', title: 'Social Feature', type: 'document', icon: HeartIcon,
  fields: [
    defineField({ name: 'label', title: 'Card label', type: 'localeString', description: 'Written under the photo, e.g. Thrift hauls, Hidden gems, Behind the scenes.', validation: requireEnglish }),
    defineField({ name: 'image', title: 'Photo', type: 'photo', description: 'Square photos work best.' }),
    defineField({ name: 'url', title: 'Link', type: 'url', description: 'Optional. The post or video this card opens, e.g. an Instagram or TikTok link.', validation: rule => rule.uri({ scheme: ['https'] }) }),
    defineField({ name: 'visible', title: 'Show on the website', type: 'boolean', initialValue: true }),
    defineField({ name: 'order', title: 'Display order', type: 'number', initialValue: 10, description: 'Lower numbers appear first. The first three visible cards are shown.', validation: rule => rule.integer().min(0) }),
  ],
  orderings: [{ ...studioLabel('sort.display-order'), name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] }],
  preview: {
    select: { title: 'label.en', media: 'image', visible: 'visible' },
    prepare: ({ title, media, visible }) => ({ title: title || 'Untitled card', subtitle: visible === false ? 'Hidden' : 'Shown', media }),
  },
});
