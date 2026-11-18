/**
 * Shared vocabulary for the console pages built in the admin portal design
 * (Company, Finance): the period in the address bar, how money, sizes,
 * quantities and dates are written, tones for pills, initials and CSV.
 * Pure functions, so pages and their tests read the same rules.
 */

/* ─────────────────────────────────────────────────────────── the period */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function todayInNairobi(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

export interface Period {
  from: string;
  to: string;
}

function validDay(value: string | undefined): value is string {
  if (!value || !ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * The period a page shows: ?from=&to= when both are real days in order and
 * not in the future, otherwise this month so far (the designs open on
 * "Nov 1 – Nov 13").
 */
export function periodFrom(
  params: { from?: string; to?: string } | undefined,
  today = todayInNairobi(),
): Period {
  const fallback = { from: `${today.slice(0, 7)}-01`, to: today };
  const from = params?.from;
  const to = params?.to;
  if (!validDay(from) || !validDay(to)) return fallback;
  if (from > to) return fallback;
  return { from, to: to > today ? today : to };
}

/**
 * Like periodFrom, but opening on the last 30 days (today included), as the
 * Operations and Merchant Performance designs do.
 */
export function periodLast30(
  params: { from?: string; to?: string } | undefined,
  today = todayInNairobi(),
): Period {
  const from = params?.from;
  const to = params?.to;
  if (validDay(from) && validDay(to) && from <= to) return periodFrom(params, today);
  const start = new Date(Date.parse(`${today}T12:00:00Z`) - 29 * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to: today };
}

/** The same period's query string, to carry it across tabs and links. */
export function periodQuery(period: Period, today = todayInNairobi()): string {
  const fallback = periodFrom(undefined, today);
  return period.from === fallback.from && period.to === fallback.to
    ? ''
    : `from=${period.from}&to=${period.to}`;
}

/** Start and end of the period as instants, Nairobi midnights, end exclusive. */
export function periodBounds(period: Period): { start: string; end: string } {
  const start = new Date(`${period.from}T00:00:00+03:00`);
  const end = new Date(new Date(`${period.to}T00:00:00+03:00`).getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Builds `/path?tab=x&from=…` without empty parts. */
export function hrefWith(path: string, params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/* ─────────────────────────────────────────────────────────────── numbers */

/** KES from cents, whole shillings: "KES 1,080,000". */
export function kes(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `KES ${Math.round(cents / 100).toLocaleString('en-KE')}`;
}

/** Shillings, short, for the middle of a ring: "1.24M", "48.6K", "950". */
export function kesShort(cents: number): string {
  const n = cents / 100;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString('en-KE');
}

/** Shillings without the prefix, for table columns headed "(KES)". */
export function shillings(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return Math.round(cents / 100).toLocaleString('en-KE');
}

const PLURAL_UNITS: Record<string, string> = {
  box: 'boxes',
  pack: 'packs',
  ream: 'reams',
  pair: 'pairs',
  set: 'sets',
  roll: 'rolls',
};

/** A quantity with its unit, dropping .00: "24", "200 L", "25 reams". */
export function quantity(value: number | string | null | undefined, unit?: string | null): string {
  if (value == null) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  const text = n.toLocaleString('en-KE', { maximumFractionDigits: 2 });
  if (!unit || unit === 'pcs') return text;
  return `${text} ${n !== 1 && PLURAL_UNITS[unit] ? PLURAL_UNITS[unit] : unit}`;
}

/** Bytes for people: "3.2 MB", "248 KB", "1.1 GB". */
export function bytes(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = value / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')} ${units[i]}`;
}

/** Percentage change, or null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return ((now - before) / before) * 100;
}

/* ───────────────────────────────────────────────────────────────── dates */

/** "Nov 13, 2026, 17:24" in Nairobi time. */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Nairobi',
  });
}

/** "Nov 13, 2026" for an instant or a calendar day. */
export function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const value = ISO_DAY.test(iso) ? new Date(`${iso}T12:00:00+03:00`) : new Date(iso);
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  });
}

/** Whole days from today to a calendar day; negative when it has passed. */
export function daysUntil(isoDay: string, today = todayInNairobi()): number {
  return Math.round(
    (new Date(`${isoDay}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

/* ─────────────────────────────────────────────────────────────── tones */

export type Tone = 'gold' | 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'grey' | 'ink';

/* ─────────────────────────────────────────────────────────────── people */

/** Initials for an avatar: "Jotham Mutai" → "JM". */
export function initials(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/[[\]]/g, '').trim();
  if (!clean) return '—';
  const words = clean.split(/[\s@._-]+/).filter((p) => /^\p{L}/u.test(p));
  if (words.length === 0) return clean.slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/* ──────────────────────────────────────────────────────────────── export */

/** Rows as CSV text, quoted where needed; the first row is the header. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell == null ? '' : String(cell);
          return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    )
    .join('\r\n');
}
