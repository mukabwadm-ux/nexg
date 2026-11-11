/**
 * "This morning", "this afternoon", "this evening" or "tonight" for an hour
 * of the day (0–23), so copy like "What can we bring you …?" fits the time.
 *
 *   05:00–11:59  this morning
 *   12:00–16:59  this afternoon
 *   17:00–20:59  this evening
 *   21:00–04:59  tonight
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDay(hour: number): TimeOfDay {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export const TIME_OF_DAY_PHRASE: Record<TimeOfDay, string> = {
  morning: 'this morning',
  afternoon: 'this afternoon',
  evening: 'this evening',
  night: 'tonight',
};

/** The hour in Nairobi, for the server's first render before the device clock is known. */
export function nairobiHour(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Africa/Nairobi',
    }).format(now),
  );
}
