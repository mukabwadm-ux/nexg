import type { SavedSetupHours } from '@/app/merchant/setup-hours-actions';
import type { DayHours } from './model';

export const emptyWeek = (): DayHours[] =>
  Array.from({ length: 7 }, (_, day) => ({ day, state: 'unspecified', intervals: [] }));

export function weekFromSaved(saved: Pick<SavedSetupHours, 'rows'>): DayHours[] {
  return emptyWeek().map((day) => {
    const row = saved.rows.find((entry) => entry.day === day.day);
    if (!row) return day;
    if (row.closed) return { ...day, state: 'closed' };
    return {
      ...day,
      state: 'open',
      intervals: [
        {
          start: (row.opens ?? '').slice(0, 5),
          end: (row.closes ?? '').slice(0, 5),
          nextDay: false,
        },
      ],
    };
  });
}
