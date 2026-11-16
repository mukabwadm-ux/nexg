/**
 * Calendar-day helpers shared by the date range picker and the pages that
 * read its ?from=&to=. A plain module (no 'use client'), so server
 * components can call them too.
 *
 * Dates here are calendar days written as ISO strings (2026-11-13), never
 * Date objects: a day is the same day in every time zone, and the strings
 * go straight into a URL (?from=&to=) and into SQL date parameters.
 */
export interface DateRange {
  from: string;
  to: string;
}

export interface DateRangePreset {
  key: string;
  label: string;
  range: (today: string) => DateRange;
}

export const DAY = 86_400_000;

export function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
}

export function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(toUtc(iso));
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return fromUtc(target.getTime());
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** "Nov 13, 2026", the way the admin portal designs write a day. */
export function formatDay(iso: string, withYear = true): string {
  return new Date(toUtc(iso)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** "Nov 1 – Nov 13, 2026"; the year is written once when both ends share it. */
export function formatRange(range: DateRange): string {
  if (range.from === range.to) return formatDay(range.from);
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  return `${formatDay(range.from, !sameYear)} – ${formatDay(range.to)}`;
}

export const DEFAULT_RANGE_PRESETS: DateRangePreset[] = [
  { key: 'today', label: 'Today', range: (t) => ({ from: t, to: t }) },
  { key: '7d', label: 'Last 7 days', range: (t) => ({ from: addDays(t, -6), to: t }) },
  { key: '30d', label: 'Last 30 days', range: (t) => ({ from: addDays(t, -29), to: t }) },
  { key: 'month', label: 'This month', range: (t) => ({ from: monthStart(t), to: t }) },
  {
    key: 'last-month',
    label: 'Last month',
    range: (t) => {
      const from = monthStart(addMonths(monthStart(t), -1));
      return { from, to: addDays(monthStart(t), -1) };
    },
  },
  { key: '90d', label: 'Last 90 days', range: (t) => ({ from: addDays(t, -89), to: t }) },
  { key: 'year', label: 'This year', range: (t) => ({ from: `${t.slice(0, 4)}-01-01`, to: t }) },
];

/** Today's date in Nairobi as an ISO day. */
export function todayInNairobi(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}
