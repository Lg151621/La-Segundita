import { at, defineMigration, setIfMissing, unset } from 'sanity/migrate';

// Moves Store Settings from "Monday – Saturday / Sunday" to "Monday–Friday / Saturday / Sunday".
// The old Monday–Saturday value becomes Monday–Friday; Saturday gets the approved 9:00 AM – 3:00 PM unless already set.
// The old fields are no longer in the schema; running this also clears their leftover values from the document.
// It never overwrites the new fields (setIfMissing).
// Preview:  npx sanity migration run split-store-hours
// Apply:    npx sanity migration run split-store-hours --no-dry-run
export default defineMigration({
  title: 'Split store hours into Monday–Friday, Saturday, and Sunday',
  documentTypes: ['storeSettings'],
  migrate: {
    document(doc) {
      const { hoursWeekdays, hoursSunday } = doc as { hoursWeekdays?: unknown; hoursSunday?: unknown };
      return [
        ...(hoursWeekdays ? [at('mondayFridayHours', setIfMissing(hoursWeekdays))] : []),
        at('saturdayHours', setIfMissing({ _type: 'localeString', en: '9:00 AM – 3:00 PM' })),
        ...(hoursSunday ? [at('sundayHours', setIfMissing(hoursSunday))] : []),
        at('hoursWeekdays', unset()),
        at('hoursSunday', unset()),
      ];
    },
  },
});
