import { defineField, defineType } from 'sanity';
import { BellIcon } from '@sanity/icons/Bell';
import { requireEnglish } from './localeString';

// A short temporary notice shown in a slim bar above the site header (holiday hours, events, closures).
export const announcement = defineType({
  name: 'announcement', title: 'Announcement', type: 'document', icon: BellIcon,
  fields: [
    defineField({ name: 'message', title: 'Message', type: 'localeString', description: 'Keep it short, e.g. "Closed Thanksgiving Day — see you Friday!"', validation: requireEnglish }),
    defineField({ name: 'enabled', title: 'Show this announcement', type: 'boolean', initialValue: true }),
    defineField({ name: 'startsAt', title: 'Start showing on', type: 'datetime', description: 'Optional. Leave empty to show right away.' }),
    defineField({
      name: 'endsAt', title: 'Stop showing after', type: 'datetime', description: 'Optional. Leave empty to show until you turn it off.',
      validation: rule => rule.custom((end: string | undefined, context) => {
        const start = (context.parent as { startsAt?: string } | undefined)?.startsAt;
        return !end || !start || end > start ? true : 'The end must be after the start.';
      }),
    }),
  ],
  preview: {
    select: { title: 'message.en', enabled: 'enabled', startsAt: 'startsAt', endsAt: 'endsAt' },
    prepare: ({ title, enabled, startsAt, endsAt }) => {
      const day = (d?: string) => (d ? new Date(d).toLocaleDateString() : '');
      const window = startsAt || endsAt ? ` · ${day(startsAt) || 'now'} → ${day(endsAt) || 'until turned off'}` : '';
      return { title: title || 'Untitled announcement', subtitle: `${enabled === false ? 'Off' : 'On'}${window}` };
    },
  },
});
