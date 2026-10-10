/**
 * The plain pieces the Hours board needs on both sides.
 *
 * Here, and not beside the form that uses them, because a
 * server page maps over `DAYS` and formats with `hhmm`. An
 * export of a `'use client'` module is a client reference, not
 * a value — the page compiles and then 500s with "Attempted to
 * call map() from the server".
 *
 * This is the third time that trap has been walked into in this
 * codebase. TypeScript cannot see it; only loading the page
 * can.
 */

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface HoursRow {
  id: string;
  branch_id: string | null;
  day_of_week: number;
  service: string;
  opens: string | null;
  closes: string | null;
  closed: boolean;
}

/** `07:00:00` to `07:00`, which is what the grid prints. */
export function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

export function slotLabel(r: HoursRow | undefined): string {
  if (!r) return '—';
  if (r.closed) return 'Closed';
  return `${hhmm(r.opens).replace(':00', '')}–${hhmm(r.closes).replace(':00', '')}`;
}
