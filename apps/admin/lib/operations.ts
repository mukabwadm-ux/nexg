/**
 * The Operations dashboard, as the console shows it. The figures and rows
 * come from rpc_operations_overview and rpc_operations_list; this file
 * names things and turns times into the designs' words ("~ 18 min",
 * "Day 3 of 7", "Nov 18, 10:00").
 */
import type { ChipTone } from '@/components/portal/dash';

export type OpsKind =
  | 'food'
  | 'delivery'
  | 'stay'
  | 'experience'
  | 'transfer'
  | 'service'
  | 'incident'
  | 'dispute';
export type OpsBucket = 'ongoing' | 'pending' | 'completed' | 'cancelled';
/** The six category tabs, plus "incidents" behind Operations → Incidents & Disputes. */
export type OpsTab =
  | 'all'
  | 'food'
  | 'stays'
  | 'experiences'
  | 'transfers'
  | 'services'
  | 'incidents';

export interface OpsRow {
  kind: OpsKind;
  id: string;
  ref: string;
  /** "A. Wanjiku": initial and surname only. */
  customer: string | null;
  /** Merchant, property or partner. */
  party: string | null;
  amount_cents: number | null;
  status: string;
  status_label: string;
  tone: ChipTone;
  bucket: OpsBucket;
  starts_at: string | null;
  ends_at: string | null;
  eta_at: string | null;
  /** A whole day with no time (experience days). */
  all_day?: boolean;
  area: string | null;
  href: string | null;
}

export interface OpsKpi {
  value: number | null;
  delta: number | null;
  series: number[];
}

export interface OpsOverview {
  kpis: {
    orders: OpsKpi;
    bookings: OpsKpi;
    deliveries: OpsKpi;
    guests: OpsKpi;
    incidents: OpsKpi;
  };
  buckets: Record<OpsBucket, number>;
  areas: { id: string; name: string }[];
  statuses: { key: string; label: string }[];
  city: { id: string; name: string; lat: number | null; lng: number | null } | null;
  /** Only kinds that happen somewhere: incidents and disputes have no place on the map. */
  points: {
    kind: Exclude<OpsKind, 'incident' | 'dispute'>;
    lat: number;
    lng: number;
    label: string;
  }[];
}

export const KINDS: Record<OpsKind, { label: string; tone: ChipTone }> = {
  food: { label: 'Food', tone: 'amber' },
  delivery: { label: 'Delivery', tone: 'green' },
  stay: { label: 'Stay', tone: 'amber' },
  experience: { label: 'Experience', tone: 'amber' },
  transfer: { label: 'Transfer', tone: 'amber' },
  service: { label: 'Service', tone: 'amber' },
  incident: { label: 'Incident', tone: 'red' },
  dispute: { label: 'Dispute', tone: 'red' },
};

/** Which kinds each category tab shows. */
export const TAB_KINDS: Record<OpsTab, OpsKind[]> = {
  all: ['food', 'delivery', 'stay', 'experience', 'transfer', 'service'],
  food: ['food', 'delivery'],
  stays: ['stay'],
  experiences: ['experience'],
  transfers: ['transfer'],
  services: ['service'],
  incidents: ['incident', 'dispute'],
};

/** The category bar; "incidents" is reached from the sidebar, not shown here. */
export const TABS: { key: Exclude<OpsTab, 'incidents'>; label: string }[] = [
  { key: 'all', label: 'All Operations' },
  { key: 'food', label: 'Food Orders' },
  { key: 'stays', label: 'Stays' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'transfers', label: 'Transfers' },
  { key: 'services', label: 'Services' },
];

export const BUCKETS: { key: OpsBucket; label: string; noun: string }[] = [
  { key: 'ongoing', label: 'Ongoing', noun: 'ongoing operations' },
  { key: 'pending', label: 'Pending', noun: 'pending operations' },
  { key: 'completed', label: 'Completed', noun: 'completed operations' },
  { key: 'cancelled', label: 'Cancelled', noun: 'cancelled operations' },
];

export function isTab(v: string | null | undefined): v is OpsTab {
  return v != null && v in TAB_KINDS;
}

export function isBucket(v: string | null | undefined): v is OpsBucket {
  return v === 'ongoing' || v === 'pending' || v === 'completed' || v === 'cancelled';
}

const MIN = 60_000;
const DAY = 86_400_000;

/** Midnight UTC of the Nairobi calendar day containing `ms`. */
function nairobiDay(ms: number): number {
  const day = new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  return Date.parse(`${day}T00:00:00Z`);
}

function dayOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Africa/Nairobi',
  });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Nairobi',
  });
}

/**
 * The ETA / Check-in column. Orders and transfers count down to their
 * estimate; a stay in progress says which night it is; anything booked
 * for later says when.
 */
export function etaLabel(row: OpsRow, now = Date.now()): string {
  if (row.bucket === 'cancelled') return '—';
  if (row.kind === 'stay') {
    if (!row.starts_at) return '—';
    if (row.bucket === 'ongoing' && row.ends_at) {
      /* Calendar days in Nairobi, as a hotel counts them: arrival day is day 1. */
      const start = nairobiDay(Date.parse(row.starts_at));
      const nights = Math.max(1, Math.round((nairobiDay(Date.parse(row.ends_at)) - start) / DAY));
      const day = Math.min(nights, Math.max(1, Math.round((nairobiDay(now) - start) / DAY) + 1));
      return `Day ${day} of ${nights}`;
    }
    if (row.bucket === 'completed' && row.ends_at) return `Out ${clock(row.ends_at)}`;
    return `In ${clock(row.starts_at)}`;
  }
  if (row.kind === 'food' || row.kind === 'delivery' || row.kind === 'transfer') {
    if (row.bucket === 'completed') return row.ends_at ? clock(row.ends_at) : '—';
    if (!row.eta_at) return row.starts_at ? clock(row.starts_at) : '—';
    const mins = Math.round((Date.parse(row.eta_at) - now) / MIN);
    if (mins < 0) return `${-mins} min late`;
    return row.kind === 'transfer' ? `Arriving ~ ${mins} min` : `~ ${mins} min`;
  }
  if (!row.starts_at) return '—';
  return row.all_day ? dayOnly(row.starts_at) : clock(row.starts_at);
}

/** "KSh 2,340" as the designs write it. */
export function ksh(cents: number | null | undefined): string {
  if (cents == null) return '—';
  const v = cents / 100;
  return `KSh ${v.toLocaleString('en-KE', { maximumFractionDigits: Number.isInteger(v) ? 0 : 2 })}`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function kpi(raw: unknown): OpsKpi {
  const k = (raw ?? {}) as { value?: unknown; delta?: unknown; series?: unknown[] };
  return {
    value: k.value == null ? null : num(k.value),
    delta: k.delta == null ? null : num(k.delta),
    series: (k.series ?? []).map(num),
  };
}

/** The overview as the database sends it, numbers made numbers. */
export function parseOverview(data: unknown): OpsOverview {
  const o = (data ?? {}) as Record<string, unknown>;
  const k = (o.kpis ?? {}) as Record<string, unknown>;
  const b = (o.buckets ?? {}) as Record<string, unknown>;
  const c = o.city as OpsOverview['city'];
  return {
    kpis: {
      orders: kpi(k.orders),
      bookings: kpi(k.bookings),
      deliveries: kpi(k.deliveries),
      guests: kpi(k.guests),
      incidents: kpi(k.incidents),
    },
    buckets: {
      ongoing: num(b.ongoing),
      pending: num(b.pending),
      completed: num(b.completed),
      cancelled: num(b.cancelled),
    },
    areas: (o.areas as OpsOverview['areas']) ?? [],
    statuses: (o.statuses as OpsOverview['statuses']) ?? [],
    city: c
      ? { ...c, lat: c.lat == null ? null : num(c.lat), lng: c.lng == null ? null : num(c.lng) }
      : null,
    points: ((o.points as OpsOverview['points']) ?? []).map((p) => ({
      ...p,
      lat: num(p.lat),
      lng: num(p.lng),
    })),
  };
}

export function parseRows(data: unknown): { total: number; rows: OpsRow[] } {
  const d = (data ?? {}) as { total?: unknown; rows?: OpsRow[] };
  return {
    total: num(d.total),
    rows: (d.rows ?? []).map((r) => ({
      ...r,
      amount_cents: r.amount_cents == null ? null : num(r.amount_cents),
    })),
  };
}
