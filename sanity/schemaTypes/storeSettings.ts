import { defineField, defineType, type UrlRule } from 'sanity';
import { PinIcon } from '@sanity/icons/Pin';

const https = (rule: UrlRule) => rule.uri({ scheme: ['https'] });

// One document: the single source of truth for store information used across the whole site.
export const storeSettings = defineType({
  name: 'storeSettings', title: 'Store Settings', type: 'document', icon: PinIcon,
  fieldsets: [
    { name: 'contact', title: 'Address & phone' },
    { name: 'hours', title: 'Store hours' },
    { name: 'social', title: 'Social media links', description: 'Paste the full link to each profile. Empty links show a "coming soon" note on the site.' },
  ],
  fields: [
    defineField({ name: 'address', title: 'Store address', type: 'string', fieldset: 'contact', description: 'Shown in the Visit section, the footer, and search results. Example: 123 Main St, Phoenix, AZ 85001', validation: rule => rule.max(140) }),
    defineField({ name: 'phone', title: 'Phone number', type: 'string', fieldset: 'contact', description: 'Example: (602) 555-0123. The "Call Us" button dials this number.', validation: rule => rule.max(30).custom(v => !v || v.replace(/\D/g, '').length >= 7 ? true : 'Enter a full phone number.') }),
    defineField({ name: 'directionsUrl', title: 'Google Maps link', type: 'url', fieldset: 'contact', description: 'Open your store in Google Maps, choose Share, and paste the link. Used by the "Get Directions" buttons.', validation: https }),
    defineField({ name: 'mondayFridayHours', title: 'Monday–Friday Hours', type: 'localeString', fieldset: 'hours', description: 'Example: 10:00 AM – 6:00 PM' }),
    defineField({ name: 'saturdayHours', title: 'Saturday Hours', type: 'localeString', fieldset: 'hours', description: 'Example: 9:00 AM – 3:00 PM', initialValue: { en: '9:00 AM – 3:00 PM' } }),
    defineField({ name: 'sundayHours', title: 'Sunday Hours', type: 'localeString', fieldset: 'hours', description: 'Example: Closed (Spanish: Cerrado)', initialValue: { en: 'Closed', es: 'Cerrado' } }),
    defineField({ name: 'instagram', title: 'Instagram', type: 'url', fieldset: 'social', validation: https }),
    defineField({ name: 'tiktok', title: 'TikTok', type: 'url', fieldset: 'social', validation: https }),
    defineField({ name: 'depop', title: 'Depop', type: 'url', fieldset: 'social', validation: https }),
    defineField({ name: 'poshmark', title: 'Poshmark', type: 'url', fieldset: 'social', validation: https }),
  ],
  preview: { prepare: () => ({ title: 'Store Settings' }) },
});
