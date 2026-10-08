import { defineField, defineType } from 'sanity';
import { TagIcon } from '@sanity/icons/Tag';
import { requireEnglish } from './localeString';
import { studioLabel } from '../i18n';

// A piece featured on a thrift tag in the Fresh Finds section. Marketing only: no prices, stock, or sales.
export const freshFind = defineType({
  name: 'freshFind', title: 'Fresh Find', type: 'document', icon: TagIcon,
  fields: [
    defineField({ name: 'name', title: 'Item name', type: 'localeString', description: 'Example: Vintage Levi’s', validation: requireEnglish }),
    defineField({ name: 'image', title: 'Photo', type: 'photo', description: 'Optional. Without a photo, the tag shows a drawing based on the category.' }),
    defineField({ name: 'caption', title: 'Short caption', type: 'localeString', description: 'Optional. A few words shown under the name, e.g. "Size M · 90s wash".' }),
    defineField({
      name: 'category', title: 'Category', type: 'string', initialValue: 'jacket',
      options: { list: [{ title: 'Denim', value: 'denim' }, { title: 'Bags', value: 'bag' }, { title: 'Boots & shoes', value: 'boots' }, { title: 'Jackets & tops', value: 'jacket' }], layout: 'radio' },
      description: 'Picks the drawing shown when there is no photo.',
    }),
    defineField({ name: 'visible', title: 'Show on the website', type: 'boolean', initialValue: true, description: 'Turn off to hide this find without deleting it.' }),
    defineField({ name: 'order', title: 'Display order', type: 'number', initialValue: 10, description: 'Lower numbers appear first. The first four visible finds are shown.', validation: rule => rule.integer().min(0) }),
  ],
  orderings: [{ ...studioLabel('sort.display-order'), name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] }],
  preview: {
    select: { title: 'name.en', media: 'image', visible: 'visible', order: 'order' },
    prepare: ({ title, media, visible, order }) => ({ title: title || 'Untitled find', subtitle: `${visible === false ? 'Hidden' : 'Shown'} · order ${order ?? '–'}`, media }),
  },
});
