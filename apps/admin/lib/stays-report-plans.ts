/*
 * Scheduled and saved Stays reports (20270332000200_stays_report_schedules):
 * the shapes rpc_console_stays_report_plans returns, the period presets a
 * saved report keeps, and the dates each preset means on a given day.
 * Server- and client-safe.
 */

export const SAVED_PERIODS = [
  { value: 'this_month', label: 'This month to date' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'custom', label: 'Fixed dates' },
] as const;

export type SavedPeriod = (typeof SAVED_PERIODS)[number]['value'];

export const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly, Monday 05:00 (the week before)' },
  { value: 'monthly', label: 'Monthly, the 1st at 05:00 (the month before)' },
] as const;

export interface PlanPerson {
  id: string;
  name: string;
  email?: string;
  active?: boolean;
}

export interface ScheduleRow {
  id: string;
  report: string;
  city_id: string | null;
  city_name: string | null;
  frequency: 'weekly' | 'monthly';
  active: boolean;
  next_run_at: string;
  last_sent_at: string | null;
  last_error: string | null;
  created_at: string;
  created_by_name: string | null;
  can_change: boolean;
  recipients: PlanPerson[];
}

export interface SavedRow {
  id: string;
  name: string;
  report: string;
  city_id: string | null;
  city_name: string | null;
  period: SavedPeriod;
  from_date: string | null;
  to_date: string | null;
  shared: boolean;
  owner_name: string | null;
  mine: boolean;
  can_change: boolean;
}

export interface Plans {
  schedules: ScheduleRow[];
  saved: SavedRow[];
  recipients: PlanPerson[];
}

/** The reader's output, with missing parts as empty lists. */
export function plansFrom(data: unknown): Plans {
  const o = (data && typeof data === 'object' ? data : {}) as Partial<Plans>;
  return {
    schedules: Array.isArray(o.schedules) ? o.schedules : [],
    saved: Array.isArray(o.saved) ? o.saved : [],
    recipients: Array.isArray(o.recipients) ? o.recipients : [],
  };
}

const shift = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The dates a saved report covers on `today` (YYYY-MM-DD, Nairobi). */
export function savedPeriodDates(
  period: string,
  today: string,
  from?: string | null,
  to?: string | null,
): { from: string; to: string } {
  switch (period) {
    case 'last_month': {
      const firstThis = `${today.slice(0, 7)}-01`;
      const lastPrev = shift(firstThis, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
    case 'last_7':
      return { from: shift(today, -6), to: today };
    case 'last_30':
      return { from: shift(today, -29), to: today };
    case 'custom':
      if (from && to) return { from, to };
      return { from: `${today.slice(0, 7)}-01`, to: today };
    default:
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

export function savedPeriodLabel(row: Pick<SavedRow, 'period' | 'from_date' | 'to_date'>): string {
  if (row.period === 'custom' && row.from_date && row.to_date)
    return `${row.from_date} to ${row.to_date}`;
  return SAVED_PERIODS.find((p) => p.value === row.period)?.label ?? row.period;
}
