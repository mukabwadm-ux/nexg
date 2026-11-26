/**
 * The Stays module screens (20270329000100): the shapes the readers return
 * and how their figures are written. Pure, so the pages, the export route
 * and the tests read the same rules. Number and period helpers are the
 * Riders module's, re-exported so the two modules never drift apart.
 */

import { hrefWith, type Period } from './portal';

export {
  asMaybe,
  asNumber,
  asObject,
  delta,
  isMissingFunction,
  kesCompact,
  n,
  oneOf,
  pageOf,
  paged,
  pct,
  plainDelta,
  ppDelta,
  shareOf,
  when,
  dayOnly,
} from './riders-module';

export const PAGE_SIZE = 8;

/** One stay as console_stays_rows returns it (plus the list's extras). */
export interface StayRow {
  stay_id: string;
  ref: string;
  status: string;
  bucket?: string;
  source: string;
  host_id: string;
  host_name: string;
  property_id: string | null;
  property_name: string | null;
  area: string | null;
  unit_id: string | null;
  unit_label: string | null;
  bedrooms: number | null;
  guest_name: string;
  guest_phone: string | null;
  party: number;
  check_in: string;
  check_out: string;
  nights: number;
  rate_kes: number | null;
  value_kes: number | null;
  commission_kes: number | null;
  host_share_kes: number | null;
  paid: boolean;
  checked_in_at: string | null;
  checked_out_at: string | null;
  created_at: string;
  refunded_kes: number | null;
  property_manager_id: string | null;
  payment_reference: string | null;
  rating: number | null;
  review_text: string | null;
  concierge_kes?: number;
  concierge_orders?: number;
  concierge_categories?: string[];
}

/** /stays/… with the period and the city kept. */
export function staysHref(
  path: string,
  period: Period,
  city: string | null,
  params: Record<string, string | null | undefined> = {},
): string {
  return hrefWith(path, { from: period.from, to: period.to, city, ...params });
}

/** A uuid or nothing: the city picker and the selected row come from the address bar. */
export function uuidOrNull(value: string | undefined | null): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

/** Whole shillings written in full: "KES 48,000"; a dash when unknown. */
export function kesFull(shillings: number | null | undefined): string {
  if (shillings == null) return '—';
  return `KES ${Math.round(shillings).toLocaleString('en-KE')}`;
}

/** "Jan 28, 2025". */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'Africa/Nairobi',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "2:05 PM" in Nairobi. */
export function clock(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'Africa/Nairobi',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Minutes after midnight as "2:18 PM". */
export function minuteClock(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Jan" for a month's first day. */
export function monthShort(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
  });
}

/* ───────────────────────────────────────────────────────────── labels */

export const RESERVATION_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  checked_in: 'Checked-in',
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STAY_STATUS_LABEL: Record<string, string> = {
  booked: 'Confirmed',
  in_stay: 'Checked-in',
  departed: 'Checked-out',
  cancelled: 'Cancelled',
  held: 'Hold',
  blocked: 'Blocked',
};

export const SOURCE_LABEL: Record<string, string> = {
  nexg: 'NexG',
  entered: 'Direct',
  walk_in: 'Walk-in',
  airbnb: 'Airbnb',
  booking_com: 'Booking.com',
  ical: 'Calendar sync',
  pms: 'PMS',
};

export const HOST_BUCKET_LABEL: Record<string, string> = {
  verified: 'Verified',
  pending: 'Pending',
  sent_back: 'Sent back',
  flagged: 'Paused',
  rejected: 'Declined',
};

export const HOST_KIND_LABEL: Record<string, string> = {
  single_unit: 'Host',
  multi_unit: 'Host (several units)',
  property_manager: 'Property Manager',
};

export const UNIT_BUCKET_LABEL: Record<string, string> = {
  occupied: 'Occupied',
  available: 'Available',
  setting_up: 'Setting up',
  inactive: 'Inactive',
};

export const CASE_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  mediation: 'Mediation',
  resolved: 'Resolved',
  closed: 'Closed',
  invalid: 'Not valid',
};

export const CASE_CATEGORY_LABEL: Record<string, string> = {
  property: 'Property / stay issue',
  check_in_out: 'Check-in / check-out',
  payment: 'Payment & billing',
  conduct: 'Host / guest conduct',
  refund: 'Refunds & cancellations',
  cleanliness: 'Cleanliness',
  maintenance: 'Maintenance',
  noise: 'Noise',
  access: 'Access / keys',
  damage: 'Damage',
  no_show: 'No-show',
  other: 'Other',
};

export const LEAD_STATUS_LABEL: Record<string, string> = {
  captured: 'New lead',
  qualified: 'Qualified',
  onboarding: 'Onboarding',
  verification: 'Verification',
  activated: 'Activated',
  lost: 'Lost',
};

export const LEAD_SOURCE_LABEL: Record<string, string> = {
  property_manager: 'Property Managers',
  referral: 'Referrals (Hosts)',
  walk_in: 'Walk-ins / Fliers',
  digital: 'Digital Campaigns',
  agent: 'Agents / Sales Team',
  other: 'Other',
};

export const LEAD_KIND_LABEL: Record<string, string> = {
  host: 'Host',
  property_manager: 'Property Manager',
  partner: 'Partner',
};

export const CAMPAIGN_OBJECTIVE_LABEL: Record<string, string> = {
  host_onboarding: 'Onboard new hosts',
  bookings: 'Drive bookings',
  building_partners: 'Sign up building partners',
  referrals: 'Grow via referrals',
  app_downloads: 'App downloads',
  other: 'Other',
};

export const CAMPAIGN_CHANNEL_LABEL: Record<string, string> = {
  social_ads: 'Social Ads',
  google_ads: 'Google Ads',
  direct: 'Direct / Field',
  in_app: 'In-app',
  qr: 'QR codes',
  email: 'Email',
  sms: 'SMS',
  other: 'Other',
};

export const PLACEMENT_LABEL: Record<string, string> = {
  counter: 'Counter / Reception',
  fridge: 'Fridge',
  door: 'Door',
  welcome_book: 'Welcome book',
  bedside: 'Bedside',
  lobby: 'Lobby / Common area',
  pool: 'Pool',
  other: 'Other',
};

export const ORDER_CATEGORY_LABEL: Record<string, string> = {
  food: 'Food & Restaurants',
  restaurant: 'Food & Restaurants',
  restaurants: 'Food & Restaurants',
  groceries: 'Shopping & Groceries',
  grocery: 'Shopping & Groceries',
  supermarket: 'Shopping & Groceries',
  pharmacy: 'Pharmacy',
  experiences: 'Experiences',
  transport: 'Transport',
  other: 'Other Services',
};

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—';
  return map[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

/** Occupancy of a share of nights, or a dash when nothing was there to fill. */
export function occupancyText(pctValue: number | null | undefined): string {
  return pctValue == null
    ? '—'
    : `${pctValue.toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`;
}

/** The rules Finance & Commissions explains: what NexG keeps of one booking. */
export function unitEconomics(
  avgBooking: number | null,
  rules: { commission_pct: number; vat_pct: number; pm_share_pct: number },
): { commission: number; pmShare: number; net: number } | null {
  if (avgBooking == null) return null;
  const commission = (avgBooking * rules.commission_pct) / 100;
  const exVat = commission / (1 + rules.vat_pct / 100);
  const pmShare = (exVat * rules.pm_share_pct) / 100;
  return {
    commission: Math.round(commission),
    pmShare: Math.round(pmShare),
    net: Math.round(commission - pmShare),
  };
}

/** The reports the Reports screen offers, and what each export holds. */
export const REPORTS = [
  { key: 'bookings', title: 'Bookings Report', blurb: 'All stays bookings, status and trends' },
  { key: 'revenue', title: 'Revenue Report', blurb: 'Booking value, commission and net revenue' },
  {
    key: 'occupancy',
    title: 'Occupancy Report',
    blurb: 'Occupancy, ADR, RevPAR and length of stay',
  },
  { key: 'hosts', title: 'Host Report', blurb: 'Host status, units and verification' },
  {
    key: 'managers',
    title: 'Property Manager Report',
    blurb: 'Buildings, units and the partner share',
  },
  {
    key: 'units',
    title: 'Building & Units Report',
    blurb: 'Units, occupancy and revenue by property',
  },
  { key: 'guests', title: 'Guest Report', blurb: 'Guests, stays and spending' },
  { key: 'concierge', title: 'Concierge & Services Report', blurb: 'Guest orders during stays' },
  { key: 'reviews', title: 'Reviews & Ratings Report', blurb: 'Ratings and review text' },
  { key: 'cases', title: 'Incidents & Disputes Report', blurb: 'Cases, status and resolution' },
] as const;

export type ReportKey = (typeof REPORTS)[number]['key'];

/** One page of rows already filtered on the server page. */
export function pageSlice<T>(rows: T[], page: number, size: number): T[] {
  return rows.slice((page - 1) * size, page * size);
}

/** The distinct, sorted, non-empty values of one field, for a filter's options. */
export function optionsFrom<T>(rows: T[], pick: (row: T) => string | null | undefined) {
  return [...new Set(rows.map(pick).filter((v): v is string => !!v))]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }));
}

/** A filter's value from the address bar: null for "all" or nothing. */
export function filterOf(value: string | undefined): string | null {
  return value && value !== 'all' ? value.slice(0, 160) : null;
}

/** The most rows a screen reads at once when it filters on the page. */
export const FILTER_WINDOW = 500;
