import type { ChipTone } from '@/components/portal/dash';

/**
 * Merchants → Catalogues: the shapes rpc_merchant_catalogue_* return. A
 * catalogue has no status of its own in the database; `state` is worked out
 * there (see the migration) and named here.
 */

export type CatalogueState = 'published' | 'under_review' | 'not_live' | 'hidden';

export const CATALOGUE_STATES: { key: CatalogueState; label: string; tone: ChipTone }[] = [
  { key: 'published', label: 'Published', tone: 'green' },
  { key: 'under_review', label: 'Under Review', tone: 'amber' },
  { key: 'not_live', label: 'Not live', tone: 'grey' },
  { key: 'hidden', label: 'Hidden', tone: 'grey' },
];

export function isCatalogueState(value: unknown): value is CatalogueState {
  return CATALOGUE_STATES.some((s) => s.key === value);
}

export function catalogueChip(state: string): { label: string; tone: ChipTone } {
  return (
    CATALOGUE_STATES.find((s) => s.key === state) ?? {
      label: state.replace(/_/g, ' '),
      tone: 'grey',
    }
  );
}

export type CataloguePane = 'catalogue' | 'products' | 'categories' | 'modifiers';

export function isCataloguePane(value: unknown): value is CataloguePane {
  return (
    value === 'catalogue' || value === 'products' || value === 'categories' || value === 'modifiers'
  );
}

export interface CatalogueRow {
  merchant_id: string;
  name: string;
  category_key: string;
  category_label: string;
  photo_path: string | null;
  area: string | null;
  merchant_status: string;
  items: number;
  available: number;
  sections: number;
  needs_fix: number;
  pending_edits: number;
  open_flags: number;
  open_photo_tasks: number;
  updated_at: string | null;
  state: string;
}

export interface CatalogueOverview {
  kpis: {
    active: number | null;
    items: number | null;
    pending_review: number | null;
    needs_action: number | null;
    last_sync: string | null;
  };
  total: number;
  statuses: Record<CatalogueState, number>;
  categories: { key: string; label: string }[];
}

export interface CatalogueItem {
  id: string;
  name: string;
  section: string | null;
  price_kes: number | null;
  available: boolean;
  highlighted: boolean;
  photo_path: string | null;
}

export interface CatalogueDetail {
  merchant: CatalogueRow;
  can_edit: boolean;
  modifiers: number;
  sections: { id: string; name: string; items: number; available: number }[];
  items: CatalogueItem[];
  modifier_groups: { name: string; required: boolean; options: number }[];
  pending_edits: {
    id: string;
    kind: string;
    item: string | null;
    /** The price asked for, for a price change; null otherwise or when the payload has none. */
    price_kes: number | null;
    created_at: string;
  }[];
  price_flags: {
    id: string;
    item: string | null;
    app_price_kes: number | null;
    observed_price_kes: number | null;
    drift_pct: number | null;
  }[];
  photo_tasks: number;
  imports: {
    source: string;
    status: string | null;
    items_found: number | null;
    created_at: string;
  }[];
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function row(raw: unknown): CatalogueRow {
  const r = obj(raw);
  return {
    merchant_id: str(r.merchant_id) ?? '',
    name: str(r.name) ?? 'Unnamed merchant',
    category_key: str(r.category_key) ?? 'other',
    category_label: str(r.category_label) ?? 'Other',
    photo_path: str(r.photo_path),
    area: str(r.area),
    merchant_status: str(r.merchant_status) ?? '',
    items: num(r.items) ?? 0,
    available: num(r.available) ?? 0,
    sections: num(r.sections) ?? 0,
    needs_fix: num(r.needs_fix) ?? 0,
    pending_edits: num(r.pending_edits) ?? 0,
    open_flags: num(r.open_flags) ?? 0,
    open_photo_tasks: num(r.open_photo_tasks) ?? 0,
    updated_at: str(r.updated_at),
    state: str(r.state) ?? 'hidden',
  };
}

export function parseCatalogueOverview(data: unknown): CatalogueOverview {
  const o = obj(data);
  const k = obj(o.kpis);
  const s = obj(o.statuses);
  return {
    kpis: {
      active: num(k.active),
      items: num(k.items),
      pending_review: num(k.pending_review),
      needs_action: num(k.needs_action),
      last_sync: str(k.last_sync),
    },
    total: num(o.total) ?? 0,
    statuses: {
      published: num(s.published) ?? 0,
      under_review: num(s.under_review) ?? 0,
      not_live: num(s.not_live) ?? 0,
      hidden: num(s.hidden) ?? 0,
    },
    categories: arr(o.categories)
      .map((c) => ({ key: str(obj(c).key) ?? '', label: str(obj(c).label) ?? '' }))
      .filter((c) => c.key),
  };
}

export function parseCatalogueList(data: unknown): { total: number; rows: CatalogueRow[] } {
  const o = obj(data);
  return { total: num(o.total) ?? 0, rows: arr(o.rows).map(row) };
}

export function parseCatalogueDetail(data: unknown): CatalogueDetail | null {
  const d = obj(data);
  if (!d.merchant) return null;
  return {
    merchant: row(d.merchant),
    can_edit: d.can_edit === true,
    modifiers: num(d.modifiers) ?? 0,
    sections: arr(d.sections).map((raw) => {
      const s = obj(raw);
      return {
        id: str(s.id) ?? '',
        name: str(s.name) ?? 'Section',
        items: num(s.items) ?? 0,
        available: num(s.available) ?? 0,
      };
    }),
    items: arr(d.items).map((raw) => {
      const i = obj(raw);
      return {
        id: str(i.id) ?? '',
        name: str(i.name) ?? 'Item',
        section: str(i.section),
        price_kes: num(i.price_kes),
        available: i.available === true,
        highlighted: i.highlighted === true,
        photo_path: str(i.photo_path),
      };
    }),
    modifier_groups: arr(d.modifier_groups).map((raw) => {
      const g = obj(raw);
      return {
        name: str(g.name) ?? 'Choice',
        required: g.required === true,
        options: num(g.options) ?? 0,
      };
    }),
    pending_edits: arr(d.pending_edits).map((raw) => {
      const e = obj(raw);
      return {
        id: str(e.id) ?? '',
        kind: str(e.kind) ?? 'change',
        item: str(e.item),
        price_kes: num(obj(e.payload).price_kes),
        created_at: str(e.created_at) ?? '',
      };
    }),
    price_flags: arr(d.price_flags).map((raw) => {
      const f = obj(raw);
      return {
        id: str(f.id) ?? '',
        item: str(f.item),
        app_price_kes: num(f.app_price_kes),
        observed_price_kes: num(f.observed_price_kes),
        drift_pct: num(f.drift_pct),
      };
    }),
    photo_tasks: num(d.photo_tasks) ?? 0,
    imports: arr(d.imports).map((raw) => {
      const i = obj(raw);
      return {
        source: str(i.source) ?? 'file',
        status: str(i.status),
        items_found: num(i.items_found),
        created_at: str(i.created_at) ?? '',
      };
    }),
  };
}

/** Where the public site lives, for "Preview Catalogue". */
export function publicSiteOrigin(): string {
  if (process.env.NEXT_PUBLIC_WEB_ORIGIN) return process.env.NEXT_PUBLIC_WEB_ORIGIN;
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://nexgapp.com';
}

/** "Today, 10:24 AM", "Yesterday, 18:02", "Nov 12, 09:15", in Nairobi. */
export function syncLabel(iso: string | null, now = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  }).format(at);
  if (day(at) === day(now)) return `Today, ${time}`;
  if (day(at) === day(new Date(now.getTime() - 86_400_000))) return `Yesterday, ${time}`;
  return `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Africa/Nairobi' }).format(at)}, ${time}`;
}
