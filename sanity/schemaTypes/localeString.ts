import { defineField, defineType, type Rule } from 'sanity';

// Text in English with an optional Spanish version. The Spanish site falls back to English when Spanish is empty.
const localeFields = (type: 'string' | 'text', max: number) => [
  defineField({ name: 'en', title: 'English', type, ...(type === 'text' && { rows: 2 }), validation: rule => rule.max(max) }),
  defineField({ name: 'es', title: 'Spanish (Español)', type, ...(type === 'text' && { rows: 2 }), description: 'Optional. Leave empty to show the English text on the Spanish site.', validation: rule => rule.max(max) }),
];

export const localeString = defineType({ name: 'localeString', title: 'Text', type: 'object', options: { columns: 2 }, fields: localeFields('string', 120) });
export const localeText = defineType({ name: 'localeText', title: 'Text', type: 'object', fields: localeFields('text', 220) });

// Use on a localeString/localeText field that must have English text.
export const requireEnglish = (rule: Rule) => rule.custom((value?: { en?: string }) => (value?.en?.trim() ? true : 'Add the English text.'));
