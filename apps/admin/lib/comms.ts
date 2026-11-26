/**
 * Communications & Automations (20270331000100): labels, the module's pages,
 * what each provider needs before it can send, and the small rules the pages
 * share. Pure, so the pages, the export route and the tests read the same
 * rules.
 */

import { hrefWith, type Period } from './portal';

export {
  asMaybe,
  asNumber,
  asObject,
  ago,
  delta,
  isMissingFunction,
  n,
  pct,
  shareOf,
  when,
  dayOnly,
  clockOnly,
} from './riders-module';

export type Channel = 'email' | 'sms' | 'whatsapp' | 'in_app';
export type Audience = 'guests' | 'hosts' | 'riders' | 'merchants' | 'property_managers';

export const CHANNELS: Channel[] = ['email', 'sms', 'whatsapp', 'in_app'];
export const AUDIENCES: Audience[] = [
  'guests',
  'hosts',
  'riders',
  'merchants',
  'property_managers',
];

export const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  in_app: 'Push & in-app',
  console: 'Console',
};

export const AUDIENCE_LABEL: Record<string, string> = {
  guests: 'Guests / Customers',
  hosts: 'Hosts',
  riders: 'Riders',
  merchants: 'Merchants',
  property_managers: 'Property Managers',
  staff: 'Staff',
  all: 'All Users',
  other: 'Other',
};

/** The short tag in a table row. */
export const AUDIENCE_TAG: Record<string, string> = {
  guests: 'Guest',
  hosts: 'Host',
  riders: 'Rider',
  merchants: 'Merchant',
  property_managers: 'Property Manager',
  staff: 'Staff',
  all: 'All Users',
  other: 'System',
};

export const CATEGORY_LABEL: Record<string, string> = {
  bookings_stays: 'Bookings & Stays',
  orders_delivery: 'Orders & Delivery',
  payments_payouts: 'Payments & Payouts',
  account_verification: 'Account & Verification',
  subscriptions: 'Subscriptions',
  reminders: 'Reminders & Follow-ups',
  promotions: 'Promotions & Marketing',
  reviews: 'Reviews & Feedback',
  support: 'Support & Incidents',
  system: 'System & Security',
};

export const LOG_STATUS_LABEL: Record<string, string> = {
  sent: 'Delivered',
  queued: 'In Progress',
  failed: 'Failed',
  skipped: 'Skipped',
};

export const QUEUE_STATUS_LABEL: Record<string, string> = {
  sent: 'Sent',
  waiting: 'Queued',
  retrying: 'Retrying',
  failed: 'Failed',
};

export const TEMPLATE_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  draft: 'Draft',
  inactive: 'Inactive',
};

export const SCHEDULE_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const CONSENT_SOURCE_LABEL: Record<string, string> = {
  app_onboarding: 'App Onboarding',
  account_settings: 'Account Settings',
  checkout: 'Checkout / Booking',
  marketing_campaign: 'Marketing Campaign',
  unsubscribe_link: 'Opt-out link',
  web: 'Website',
  support: 'Support',
  staff: 'Recorded by staff',
  import: 'Import',
  other: 'Other',
  account: 'Account Settings',
  none: 'Never asked',
};

export const SUPPRESSION_REASON_LABEL: Record<string, string> = {
  opted_out: 'Opted out',
  bounced: 'Bounced',
  complaint: 'Complaint',
  invalid: 'Invalid address',
  staff: 'Added by staff',
  legal: 'Legal / data request',
};

export const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const WEEKDAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—';
  return map[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/* ──────────────────────────────────────────────────────────── the pages */

export interface CommsPage {
  key: string;
  label: string;
  /** The shorter tab-strip name, as the designs draw it. */
  tab: string;
  href: string;
}

export const COMMS_PAGES: CommsPage[] = [
  { key: 'overview', label: 'Overview', tab: 'Overview', href: '/communications' },
  { key: 'email', label: 'Email Configuration', tab: 'Email', href: '/communications/email' },
  { key: 'sms', label: 'SMS Configuration', tab: 'SMS', href: '/communications/sms' },
  { key: 'push', label: 'Push Notifications', tab: 'Push', href: '/communications/push' },
  {
    key: 'whatsapp',
    label: 'WhatsApp Configuration',
    tab: 'WhatsApp',
    href: '/communications/whatsapp',
  },
  {
    key: 'templates',
    label: 'Message Templates',
    tab: 'Templates',
    href: '/communications/templates',
  },
  {
    key: 'workflows',
    label: 'Automated Workflows',
    tab: 'Workflows',
    href: '/communications/workflows',
  },
  {
    key: 'scheduled',
    label: 'Scheduled Messages',
    tab: 'Scheduled',
    href: '/communications/scheduled',
  },
  {
    key: 'bulk',
    label: 'Manual & Bulk Messaging',
    tab: 'Bulk Messaging',
    href: '/communications/bulk',
  },
  { key: 'queue', label: 'Message Queue', tab: 'Queue', href: '/communications/queue' },
  { key: 'logs', label: 'Delivery Logs', tab: 'Logs', href: '/communications/logs' },
  {
    key: 'analytics',
    label: 'Analytics & Reports',
    tab: 'Analytics',
    href: '/communications/analytics',
  },
  {
    key: 'consent',
    label: 'Preferences & Consent',
    tab: 'Consent',
    href: '/communications/consent',
  },
];

/** A link inside the module that keeps the period. */
export function commsHref(
  path: string,
  period: Period,
  params: Record<string, string | null | undefined> = {},
): string {
  return hrefWith(path, { from: period.from, to: period.to, ...params });
}

/* ──────────────────────────────────────────────────────────── providers */

export type ChannelState = 'connected' | 'not_connected' | 'unknown' | 'not_installed';

export interface ChannelStatus {
  status: ChannelState;
  provider?: string | null;
  detail?: Record<string, unknown>;
  reported_at?: string | null;
  last_sent_at?: string | null;
  last_config_error?: string | null;
}

export const PROVIDER_LABEL: Record<string, string> = {
  resend: 'Resend',
  africastalking: "Africa's Talking",
  twilio: 'Twilio',
  meta: 'Meta WhatsApp Cloud API',
  whatsapp: 'Meta WhatsApp Cloud API',
  vapid: 'Web Push (VAPID)',
  nexg: 'NexG bell',
};

/**
 * What the owner must add before a channel can send. Names of secrets only;
 * they go in Supabase Edge Function secrets (Dashboard > Edge Functions >
 * Secrets), never in the repository.
 */
export const PROVIDER_NEEDS: Record<string, { secrets: string[]; where: string }> = {
  resend: {
    secrets: ['RESEND_API_KEY', 'EMAIL_FROM'],
    where: 'Supabase > Edge Functions > Secrets (notify-dispatch)',
  },
  africastalking: {
    secrets: ['AT_API_KEY', 'AT_USERNAME', 'AT_SENDER_ID'],
    where: 'Supabase > Edge Functions > Secrets (notify-dispatch)',
  },
  twilio: {
    secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'],
    where: 'Supabase > Edge Functions > Secrets (notify-dispatch)',
  },
  meta: {
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    where: 'Supabase > Edge Functions > Secrets (notify-dispatch and whatsapp-webhook)',
  },
  vapid: {
    secrets: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'PUSH_DISPATCH_SECRET'],
    where: 'Supabase > Edge Functions > Secrets (push-dispatch)',
  },
  native: {
    secrets: ['FCM service account', 'APNs key', 'D8_DELIVERY_ENABLED'],
    where: 'Supabase > Edge Functions > Secrets (native-push-dispatch) and the Vault pair',
  },
};

export const STATE_LABEL: Record<ChannelState, string> = {
  connected: 'Connected',
  not_connected: 'Not connected',
  unknown: 'Not checked yet',
  not_installed: 'Not installed',
};

export function asStatus(value: unknown): ChannelStatus {
  const o = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const s = o.status;
  return {
    ...(o as object),
    status: s === 'connected' || s === 'not_connected' || s === 'not_installed' ? s : 'unknown',
  } as ChannelStatus;
}

/** Whether a given provider is the one a channel is using right now. */
export function providerState(channel: ChannelStatus, provider: string): ChannelState {
  if (channel.status !== 'connected') return channel.status;
  if (!channel.provider) return 'connected';
  return channel.provider === provider ? 'connected' : 'not_connected';
}

/* ──────────────────────────────────────────────────────────── the words */

/** Rough SMS parts: 160 GSM characters, 153 per part once split; 70/67 with emoji or accents. */
export function smsParts(text: string): { chars: number; parts: number } {
  const chars = [...text].length;
  // eslint-disable-next-line no-control-regex
  const gsm = /^[\x0A\x0D\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]*$/.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  if (chars === 0) return { chars, parts: 0 };
  return { chars, parts: chars <= single ? 1 : Math.ceil(chars / multi) };
}

/** {{first_name}} and friends filled the way the database fills them, for previews. */
export function renderPreview(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '')
    .replace(/\n{3,}/g, '\n\n');
}

export const SAMPLE_VARS = { first_name: 'John', name: 'John Mutai', city: 'Nairobi' };

/** "DL-1A2B3C" from a log row's id, as the database writes it. */
export const logRef = (id: string) => `DL-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

/** Seconds as "1.3 sec", minutes past a minute. */
export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds.toLocaleString('en-KE', { maximumFractionDigits: 1 })} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toLocaleString('en-KE', { maximumFractionDigits: 1 })} hrs`;
}

/** The next run of a recurring rule, in words: "Every Mon, 9:00 AM". */
export function scheduleWords(s: {
  kind: string;
  frequency?: string | null;
  weekday?: number | null;
  monthday?: number | null;
  time_of_day?: string | null;
  next_run_at?: string | null;
}): string {
  const t = s.time_of_day ? clock12(s.time_of_day) : '';
  if (s.kind === 'one_time') return 'Once';
  if (s.frequency === 'daily') return `Every day, ${t}`;
  if (s.frequency === 'weekly') return `Every ${WEEKDAY_LABEL[(s.weekday ?? 1) - 1]}, ${t}`;
  if (s.frequency === 'monthly') return `${ordinal(s.monthday ?? 1)} of month, ${t}`;
  return '—';
}

export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function ordinal(day: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  return `${day}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Days of a calendar month laid out Monday first, with the days around it. */
export function monthGrid(monthIso: string): { day: string; inMonth: boolean }[] {
  const [y, m] = monthIso.slice(0, 7).split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(y, m - 1, 1 - lead));
  const cells: { day: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    cells.push({ day: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === m - 1 });
  }
  return cells.slice(0, cells[35]!.inMonth ? 42 : 35);
}

/** A Nairobi calendar day for an instant. */
export function nairobiDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function oneOfOr<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function pageNumber(value: string | undefined): number {
  const p = Number(value);
  return Number.isInteger(p) && p > 0 && p < 100_000 ? p : 1;
}

/* ──────────────────────────────────────────────────────────── the figures */

export interface Kpis {
  total: number;
  sent: number;
  queued: number;
  failed: number;
  skipped: number;
  retried: number;
  recipients: number;
}

export function kpisOf(value: unknown): Kpis {
  const o = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const num = (k: string) => {
    const v = Number(o[k]);
    return Number.isFinite(v) ? v : 0;
  };
  return {
    total: num('total'),
    sent: num('sent'),
    queued: num('queued'),
    failed: num('failed'),
    skipped: num('skipped'),
    retried: num('retried'),
    recipients: num('recipients'),
  };
}

/** "92.1%" of a whole; a dash when there is nothing to divide by. */
export function rate(part: number, whole: number, digits = 1): string {
  if (!whole) return '—';
  return `${((100 * part) / whole).toLocaleString('en-KE', { maximumFractionDigits: digits })}%`;
}

export interface TrendPoint {
  at: string;
  sent: number;
  failed: number;
  queued: number;
  total: number;
  email: number;
  sms: number;
  whatsapp: number;
  in_app: number;
}

export function trendOf(value: unknown): TrendPoint[] {
  return (Array.isArray(value) ? value : []).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const v = (k: string) => Number(o[k]) || 0;
    return {
      at: String(o.at ?? ''),
      sent: v('sent'),
      failed: v('failed'),
      queued: v('queued'),
      total: v('total'),
      email: v('email'),
      sms: v('sms'),
      whatsapp: v('whatsapp'),
      in_app: v('in_app'),
    };
  });
}

export function rowsOf<T>(value: unknown): T[] {
  return (Array.isArray(value) ? value : []) as T[];
}

export function countsOf(value: unknown): Record<string, number> {
  const o =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v) || 0]));
}

export interface LogRow {
  id: string;
  ref: string;
  channel: string;
  recipient: string;
  template: string;
  audience: string;
  status: string;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  campaign_ref: string | null;
  subject: string | null;
  attempts: number;
  outbox_status: string | null;
  provider: string | null;
  seconds: number | null;
  resendable: boolean;
}

/** What a logged message was, in words: its subject, else its template turned into a phrase. */
export function messageName(row: {
  subject?: string | null;
  template: string;
  campaign_ref?: string | null;
}): string {
  if (row.subject) return row.subject;
  const t = row.template
    .replace(/^bell_/, '')
    .replace(/^comms\./, '')
    .replace(/^app_[a-z]+\./, '')
    .replace(/[._]/g, ' ')
    .trim();
  if (row.campaign_ref && /^CMP-/i.test(t)) return `Campaign ${row.campaign_ref}`;
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : row.template;
}

/** A cell a spreadsheet will not run as a formula: =, +, - or @ first gets a quote mark. */
export function csvSafe(
  cell: string | number | null | undefined,
): string | number | null | undefined {
  if (typeof cell !== 'string') return cell;
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}
