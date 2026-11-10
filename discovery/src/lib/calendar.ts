/** Local calendar dates as "YYYY-MM-DD" keys. Keys sort as text, so comparisons need no Date objects. */
export interface DateRange { from?: string; to?: string }
export type PickerMode = 'single' | 'range';

const pad = (value: number) => String(value).padStart(2, '0');
export const toKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export function fromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1);
}
export const addDays = (key: string, days: number) => { const date = fromKey(key); date.setDate(date.getDate() + days); return toKey(date); };
export function addMonths(view: { year: number; month: number }, months: number) {
  const date = new Date(view.year, view.month + months, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}
/** Same day of the month in another month, clamped to that month's length. */
export function shiftMonth(key: string, months: number): string {
  const date = fromKey(key);
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), last));
  return toKey(target);
}

/** Six Monday-first weeks covering the month, as day keys. */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = toKey(new Date(year, month, 1 - offset));
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)));
}

/** First click starts a range, the second ends it. A click before the start, or after a finished range, starts again. */
export function selectDay(range: DateRange, key: string, mode: PickerMode): DateRange {
  if (mode === 'single') return { from: key };
  if (!range.from || range.to || key < range.from) return { from: key };
  return { from: range.from, to: key };
}

export const nightsBetween = (from: string, to: string) => Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / 86_400_000);

const short = new Intl.DateTimeFormat('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
export const shortDate = (key: string) => short.format(fromKey(key));
export const longDate = (key: string) => new Intl.DateTimeFormat('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fromKey(key));
export const monthTitle = (view: { year: number; month: number }) => new Intl.DateTimeFormat('en-KE', { month: 'long', year: 'numeric' }).format(new Date(view.year, view.month, 1));

/** "Fri, 14 Nov" or "Fri, 14 Nov → Mon, 17 Nov · 3 days". Empty when nothing is chosen. */
export function describeRange(range: DateRange, mode: PickerMode): string {
  if (!range.from) return '';
  if (mode === 'single' || !range.to) return shortDate(range.from);
  const days = nightsBetween(range.from, range.to);
  return `${shortDate(range.from)} → ${shortDate(range.to)} · ${days} ${days === 1 ? 'day' : 'days'}`;
}
