import { defineField, defineType } from 'sanity';

// A photo with its description for screen readers. The site frames and crops it; the focal point (hotspot) is respected.
export const photo = defineType({
  name: 'photo', title: 'Photo', type: 'image', options: { hotspot: true },
  fields: [
    defineField({
      name: 'alt', title: 'Photo description', type: 'localeString',
      description: 'Describe what the photo shows for visitors using screen readers, e.g. "Our storefront on a sunny afternoon".',
      validation: rule => rule.custom((alt: { en?: string } | undefined, context) => {
        const hasImage = Boolean((context.parent as { asset?: unknown } | undefined)?.asset);
        return !hasImage || alt?.en?.trim() ? true : 'Add an English description for this photo.';
      }),
    }),
  ],
});
