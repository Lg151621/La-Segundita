import type { Localized } from './i18n';

export type StoreHours = { mondayFriday: Localized; saturday: Localized; sunday: Localized };
export const hourDays = ['mondayFriday', 'saturday', 'sunday'] as const;

// The three store-hours rows (label, hours) every hours display renders, in order.
export const hoursRows = (hours: StoreHours, labels: Record<(typeof hourDays)[number], string>) =>
  hourDays.map(day => ({ day, label: labels[day], value: hours[day] }));

// "9:00 AM – 3:00 PM", "10am - 6pm" → { opens: '09:00', closes: '15:00' }; anything else (placeholders, notes) → null.
const time = (h: string, m = '00', ap = '') => {
  let hour = Number(h) % 12; if (/p/i.test(ap)) hour += 12; if (!ap && Number(h) === 12) hour = 12;
  return `${String(hour).padStart(2, '0')}:${m}`;
};
export function parseHours(text: string): { opens: string; closes: string } | null {
  const m = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);
  return m && (m[3] || m[6]) ? { opens: time(m[1], m[2], m[3] || m[6]), closes: time(m[4], m[5], m[6] || m[3]) } : null;
}
export const isClosed = (text: string) => /^(closed|cerrado)\.?$/i.test(text.trim());
