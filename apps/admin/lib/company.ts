/**
 * Shared vocabulary for the Company pages: the period in the address bar,
 * how money, sizes and quantities are written, what kind of file a file
 * is, and the labels and tones of every status. Pure functions, so the
 * pages and their tests read the same rules.
 */

export type CompanyLevel = 'full' | 'limited' | 'view';

/** What the signed-in person may do in Company, from their module level. */
export function companyAccess(level: string | null | undefined, isSuperAdmin = false) {
  const full = isSuperAdmin || level === 'full';
  const write = full || level === 'limited';
  return { canWrite: write, canApprove: full };
}

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

/* ───────────────────────────────────────────────────────────────── files */

export type FileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'image' | 'text' | 'archive' | 'other';

export const FILE_KINDS: { key: FileKind; label: string }[] = [
  { key: 'pdf', label: 'PDF' },
  { key: 'doc', label: 'Documents' },
  { key: 'sheet', label: 'Spreadsheets' },
  { key: 'slides', label: 'Presentations' },
  { key: 'image', label: 'Images' },
  { key: 'text', label: 'Text & CSV' },
  { key: 'archive', label: 'Archives' },
  { key: 'other', label: 'Other' },
];

/** What kind of file this is, by type first and the name's extension second. */
export function fileKind(mime: string | null | undefined, name = ''): FileKind {
  const m = (mime ?? '').toLowerCase();
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.includes('spreadsheet') || m.includes('ms-excel') || ['xlsx', 'xls', 'ods'].includes(ext))
    return ext === 'csv' ? 'text' : 'sheet';
  if (
    m.includes('presentation') ||
    m.includes('powerpoint') ||
    ['pptx', 'ppt', 'odp'].includes(ext)
  )
    return 'slides';
  if (m.includes('word') || m.includes('opendocument.text') || m === 'application/rtf')
    return 'doc';
  if (['docx', 'doc', 'odt', 'rtf'].includes(ext)) return 'doc';
  if (m === 'text/csv' || m === 'text/plain' || ['csv', 'txt'].includes(ext)) return 'text';
  if (m.includes('zip') || ext === 'zip') return 'archive';
  return 'other';
}

/** The short badge on a file row: PDF, XLSX, DOCX. */
export function fileBadge(name: string, mime?: string | null): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : '';
  if (ext && ext.length <= 5) return ext;
  const kind = fileKind(mime, name);
  return kind === 'other' ? 'FILE' : kind.toUpperCase();
}

/** Types the company-files bucket accepts; kept in step with the migration. */
export const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
  'text/csv',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'application/zip',
  'application/x-zip-compressed',
] as const;

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * The project's file storage allowance, which every bucket shares: 1 GB on
 * the Supabase Free plan NexG is on (checked 2026-11-16). Pro includes
 * 100 GB; change this when the plan changes.
 */
export const STORAGE_ALLOWANCE_BYTES = 1024 ** 3;

/** Why an upload would be refused, before it is tried; null when fine. */
export function uploadProblem(file: { name: string; type: string; size: number }): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is over 50 MB.`;
  if (!(ACCEPTED_FILE_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} is not a type Company files keeps (PDF, Office, images, CSV, text or ZIP).`;
  }
  return null;
}

/** A storage key for an upload: the uploader's folder, a random folder, a safe name. */
export function storageKey(userId: string, name: string, random: string): string {
  const safe =
    name
      .normalize('NFKD')
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(-120) || 'file';
  return `${userId}/${random}/${safe}`;
}

/* ─────────────────────────────────────────────────────────────── statuses */

export type Tone = 'gold' | 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'grey' | 'ink';

export const STOCK_STATUS: Record<string, { label: string; tone: Tone }> = {
  in_stock: { label: 'In stock', tone: 'green' },
  low_stock: { label: 'Low stock', tone: 'amber' },
  out_of_stock: { label: 'Out of stock', tone: 'red' },
};

export const ASSET_STATUS: Record<string, { label: string; tone: Tone }> = {
  available: { label: 'Available', tone: 'green' },
  in_use: { label: 'In use', tone: 'blue' },
  maintenance: { label: 'Maintenance', tone: 'amber' },
  retired: { label: 'Retired', tone: 'grey' },
  lost: { label: 'Lost', tone: 'red' },
};

export const ASSET_CONDITION: Record<string, { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 'green' },
  good: { label: 'Good', tone: 'green' },
  fair: { label: 'Fair', tone: 'amber' },
  poor: { label: 'Poor', tone: 'red' },
  broken: { label: 'Broken', tone: 'red' },
};

export const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  submitted: { label: 'Awaiting approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  rejected: { label: 'Turned down', tone: 'red' },
  ordered: { label: 'Ordered', tone: 'purple' },
  received: { label: 'Received', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  issued: { label: 'Issued', tone: 'purple' },
  partially_received: { label: 'Part received', tone: 'amber' },
  received: { label: 'Received', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const VENDOR_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  on_hold: { label: 'On hold', tone: 'amber' },
  archived: { label: 'Archived', tone: 'grey' },
};

export const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'grey' },
  normal: { label: 'Normal', tone: 'blue' },
  high: { label: 'High', tone: 'amber' },
  urgent: { label: 'Urgent', tone: 'red' },
};

export const DEPARTMENTS: Record<string, string> = {
  operations: 'Operations',
  finance: 'Finance',
  technology: 'Technology',
  marketing: 'Marketing',
  people: 'People',
  support: 'Customer support',
  riders: 'Riders',
  office: 'Office',
  other: 'Other',
};

export const VENDOR_CATEGORIES: Record<string, string> = {
  it_electronics: 'IT & electronics',
  furniture: 'Furniture',
  office_supplies: 'Office supplies',
  rider_gear: 'Rider gear',
  fuel_energy: 'Fuel & energy',
  printing: 'Printing',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  professional_services: 'Professional services',
  logistics: 'Logistics',
  food_beverage: 'Food & beverage',
  other: 'Other',
};

export const PAYMENT_TERMS: Record<string, string> = {
  prepaid: 'Paid in advance',
  on_delivery: 'On delivery',
  net_7: '7 days',
  net_15: '15 days',
  net_30: '30 days',
  net_60: '60 days',
};

export const LOCATION_KINDS: Record<string, string> = {
  office: 'Office',
  warehouse: 'Warehouse',
  store: 'Store',
  hub: 'Rider hub',
  other: 'Other',
};

export const UNITS = ['pcs', 'box', 'pack', 'ream', 'pair', 'set', 'roll', 'L', 'kg', 'm'] as const;

export const CATEGORY_ICONS = [
  'laptop',
  'armchair',
  'printer',
  'hard-hat',
  'fuel',
  'paperclip',
  'package',
  'bike',
  'car',
  'wrench',
  'shield',
  'spray-can',
  'coffee',
  'plug',
  'smartphone',
  'router',
  'box',
  'shirt',
  'book',
] as const;

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

/** How much to order to get a line back above its reorder level. */
export function suggestedOrder(quantityOnHand: number, reorderLevel: number): number {
  if (reorderLevel <= 0) return quantityOnHand <= 0 ? 1 : 0;
  const target = reorderLevel * 2;
  return Math.max(0, Math.ceil(target - quantityOnHand));
}
