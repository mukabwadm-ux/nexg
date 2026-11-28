/**
 * Categories & Commissions (System > Configuration): what the
 * rpc_category_commission_* functions answer (20270345000100), read
 * defensively, and the pure helpers the screen and its tests share.
 */

export const FULFILMENT = [
  { key: 'delivery', label: 'Delivery' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'dine_in', label: 'Dine-in' },
  { key: 'booking', label: 'Booking' },
  { key: 'ticketing', label: 'Ticketing' },
  { key: 'transport', label: 'Transport' },
  { key: 'digital', label: 'Digital' },
] as const;
export type Fulfilment = (typeof FULFILMENT)[number]['key'];

export type VatTreatment = 'inclusive' | 'exclusive';
export type Approval = 'two_person' | 'single';

export const APPROVAL_LABEL: Record<Approval, string> = {
  two_person: 'Requires a second approver',
  single: 'One approver (Finance)',
};

export interface RateVersion {
  id: string;
  pct: number;
  nexg_delivery_pct: number | null;
  vat_treatment: VatTreatment;
  starts_on: string;
  ends_on: string | null;
}

export interface PendingRate extends RateVersion {
  reason: string;
  requested_by: string | null;
  requested_at: string;
  mine: boolean;
}

export interface CategoryRow {
  category: string;
  label: string;
  icon: string | null;
  description: string | null;
  is_active: boolean;
  subcategories: { id: string; name: string }[];
  rate_group: string | null;
  band_min_pct: number | null;
  band_max_pct: number | null;
  fulfilment_methods: Fulfilment[];
  approval: Approval;
  merchant_overrides: boolean;
  rate: RateVersion | null;
  next_rate: RateVersion | null;
  pending: PendingRate | null;
  merchants: number;
  overrides: number;
}

export interface Overview {
  today: string;
  categories: CategoryRow[];
  overrides_in_force: number;
  presets: {
    own_delivery_pct: number | null;
    nexg_delivery_pct: number | null;
    standard_pct: number | null;
    vat_pct: number;
  };
  can_edit: boolean;
  can_decide: boolean;
  can_add: boolean;
}

export interface HistoryRow {
  id: number;
  category: string;
  label: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  actor: string | null;
  at: string;
}

export interface OverrideRow {
  merchant_id: string;
  merchant: string;
  category: string;
  category_label: string | null;
  own_riders: boolean;
  term_id: string | null;
  own_delivery_pct: number | null;
  nexg_delivery_pct: number | null;
  starts_on: string | null;
  ends_on: string | null;
  status: 'pending' | 'scheduled' | 'in_force';
  reason: string | null;
  category_pct: number | null;
  charged_pct: number | null;
  overrides_allowed: boolean;
}

/* ─────────────────────────────────────────────────────────── reading */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function parseRateVersion(v: unknown): RateVersion | null {
  if (!isObj(v) || !str(v.id)) return null;
  return {
    id: str(v.id)!,
    pct: num(v.pct) ?? 0,
    nexg_delivery_pct: num(v.nexg_delivery_pct),
    vat_treatment: v.vat_treatment === 'exclusive' ? 'exclusive' : 'inclusive',
    starts_on: str(v.starts_on) ?? '',
    ends_on: str(v.ends_on),
  };
}

const FULFILMENT_KEYS = new Set<string>(FULFILMENT.map((f) => f.key));

export function parseCategory(v: unknown): CategoryRow | null {
  if (!isObj(v) || !str(v.category)) return null;
  const pending = parseRateVersion(v.pending);
  const p = isObj(v.pending) ? v.pending : {};
  return {
    category: str(v.category)!,
    label: str(v.label) ?? str(v.category)!,
    icon: str(v.icon),
    description: str(v.description),
    is_active: v.is_active === true,
    subcategories: arr(v.subcategories)
      .filter(isObj)
      .map((s) => ({ id: str(s.id) ?? '', name: str(s.name) ?? str(s.id) ?? '' }))
      .filter((s) => s.id),
    rate_group: str(v.rate_group),
    band_min_pct: num(v.band_min_pct),
    band_max_pct: num(v.band_max_pct),
    fulfilment_methods: arr(v.fulfilment_methods).filter(
      (m): m is Fulfilment => typeof m === 'string' && FULFILMENT_KEYS.has(m),
    ),
    approval: v.approval === 'single' ? 'single' : 'two_person',
    merchant_overrides: v.merchant_overrides !== false,
    rate: parseRateVersion(v.rate),
    next_rate: parseRateVersion(v.next_rate),
    pending: pending
      ? {
          ...pending,
          reason: str(p.reason) ?? '',
          requested_by: str(p.requested_by),
          requested_at: str(p.requested_at) ?? '',
          mine: p.mine === true,
        }
      : null,
    merchants: num(v.merchants) ?? 0,
    overrides: num(v.overrides) ?? 0,
  };
}

export function parseOverview(data: unknown): Overview | null {
  if (!isObj(data)) return null;
  const presets = isObj(data.presets) ? data.presets : {};
  return {
    today: str(data.today) ?? new Date().toISOString().slice(0, 10),
    categories: arr(data.categories)
      .map(parseCategory)
      .filter((c): c is CategoryRow => c !== null),
    overrides_in_force: num(data.overrides_in_force) ?? 0,
    presets: {
      own_delivery_pct: num(presets.own_delivery_pct),
      nexg_delivery_pct: num(presets.nexg_delivery_pct),
      standard_pct: num(presets.standard_pct),
      vat_pct: num(presets.vat_pct) ?? 16,
    },
    can_edit: data.can_edit === true,
    can_decide: data.can_decide === true,
    can_add: data.can_add === true,
  };
}

export function parseHistory(data: unknown): HistoryRow[] {
  return arr(data)
    .filter(isObj)
    .map((r) => ({
      id: num(r.id) ?? 0,
      category: str(r.category) ?? '',
      label: str(r.label) ?? str(r.category) ?? '',
      action: str(r.action) ?? '',
      before: isObj(r.before) ? r.before : null,
      after: isObj(r.after) ? r.after : null,
      reason: str(r.reason),
      actor: str(r.actor),
      at: str(r.at) ?? '',
    }));
}

export function parseOverrides(data: unknown): OverrideRow[] {
  return arr(data)
    .filter(isObj)
    .filter((r) => str(r.merchant_id))
    .map((r) => ({
      merchant_id: str(r.merchant_id)!,
      merchant: str(r.merchant) ?? 'Merchant',
      category: str(r.category) ?? '',
      category_label: str(r.category_label),
      own_riders: r.own_riders === true,
      term_id: str(r.term_id),
      own_delivery_pct: num(r.own_delivery_pct),
      nexg_delivery_pct: num(r.nexg_delivery_pct),
      starts_on: str(r.starts_on),
      ends_on: str(r.ends_on),
      status:
        r.status === 'pending' ? 'pending' : r.status === 'scheduled' ? 'scheduled' : 'in_force',
      reason: str(r.reason),
      category_pct: num(r.category_pct),
      charged_pct: num(r.charged_pct),
      overrides_allowed: r.overrides_allowed !== false,
    }));
}

/* ─────────────────────────────────────────────────────────── figures */

export function pct(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(digits)}%`;
}

/** "12–15%", or null when the rate card has no band for it. */
export function band(row: Pick<CategoryRow, 'band_min_pct' | 'band_max_pct'>): string | null {
  const { band_min_pct: lo, band_max_pct: hi } = row;
  if (lo === null && hi === null) return null;
  const f = (n: number | null) => (n === null ? '…' : String(Number(n)));
  return `${f(lo)}–${f(hi)}%`;
}

/** The own-delivery rate a merchant in this category is charged today, before any agreed rate. */
export function chargedToday(row: CategoryRow, presets: Overview['presets']): number | null {
  return row.rate ? row.rate.pct : presets.own_delivery_pct;
}

/** Outside its band: the rate is below the band's lowest or above its highest. */
export function outsideBand(
  rate: number | null,
  row: Pick<CategoryRow, 'band_min_pct' | 'band_max_pct'>,
): boolean {
  if (rate === null) return false;
  return (
    (row.band_min_pct !== null && rate < row.band_min_pct) ||
    (row.band_max_pct !== null && rate > row.band_max_pct)
  );
}

/** The plain average of today's own-delivery rate over the active categories. */
export function averageRate(rows: CategoryRow[], presets: Overview['presets']): number | null {
  const rates = rows
    .filter((r) => r.is_active)
    .map((r) => chargedToday(r, presets))
    .filter((n): n is number => n !== null);
  if (rates.length === 0) return null;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

/** VAT-exclusive rates are charged with VAT on top, as fn_merchant_commission does. */
export function chargedWithVat(rate: number, vat: VatTreatment, vatPct: number): number {
  return vat === 'exclusive' ? Math.round(rate * (100 + vatPct)) / 100 : rate;
}

/** A rate typed in a field: 0–100, two decimals at most; blank is null. */
export function parsePct(raw: string): { ok: true; value: number | null } | { ok: false } {
  const text = raw.trim().replace(/%$/, '').trim();
  if (text === '') return { ok: true, value: null };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return { ok: false };
  const value = Number(text);
  return value >= 0 && value <= 100 ? { ok: true, value } : { ok: false };
}

/** One step of the commission stepper, kept to two decimals and inside 0–100. */
export function stepPct(raw: string, delta: number): string {
  const current = Number(raw.replace(/%$/, '').trim());
  const base = Number.isFinite(current) ? current : 0;
  const next = Math.min(100, Math.max(0, Math.round((base + delta) * 100) / 100));
  return next.toFixed(2);
}

/* ─────────────────────────────────────────────────────── change history */

const FIELD_LABEL: Record<string, string> = {
  pct: 'Commission',
  nexg_delivery_pct: 'NexG-delivery rate',
  vat_treatment: 'VAT',
  starts_on: 'From',
  ends_on: 'To',
  status: 'Status',
  label: 'Name',
  is_active: 'Active',
  band_min_pct: 'Band from',
  band_max_pct: 'Band to',
  fulfilment_methods: 'Fulfilment',
  approval: 'Approval',
  merchant_overrides: 'Merchant overrides',
};

export const ACTION_LABEL: Record<string, string> = {
  rate_requested: 'Rate change asked for',
  rate_approved: 'Rate approved',
  rate_rejected: 'Rate rejected',
  rate_withdrawn: 'Rate request withdrawn',
  settings_changed: 'Settings changed',
  created: 'Category added',
};

function show(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (field === 'pct' || field === 'nexg_delivery_pct' || field.startsWith('band_')) {
    const n = num(value);
    return n === null ? '—' : `${Number(n)}%`;
  }
  if (field === 'fulfilment_methods') {
    const list = arr(value).map((m) => FULFILMENT.find((f) => f.key === m)?.label ?? String(m));
    return list.length ? list.join(', ') : 'none';
  }
  if (field === 'approval') return APPROVAL_LABEL[value as Approval] ?? String(value);
  if (field === 'vat_treatment') return value === 'exclusive' ? 'VAT exclusive' : 'VAT inclusive';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  return String(value);
}

/** Each field that changed, its old and its new value, in words. */
export function changes(row: Pick<HistoryRow, 'before' | 'after'>): {
  field: string;
  before: string;
  after: string;
}[] {
  const keys = new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})]);
  return [...keys]
    .filter((k) => FIELD_LABEL[k])
    .map((k) => ({
      field: FIELD_LABEL[k]!,
      before: row.before ? show(k, row.before[k]) : '—',
      after: row.after ? show(k, row.after[k]) : '—',
    }))
    .filter((c) => c.before !== c.after || !row.before);
}

/* ─────────────────────────────────────────────────────── import / export */

export const CSV_HEADER = [
  'code',
  'name',
  'active',
  'band_min_pct',
  'band_max_pct',
  'commission_pct',
  'nexg_delivery_pct',
  'vat_treatment',
  'fulfilment',
  'approval',
  'merchant_overrides',
  'effective_from',
  'effective_to',
] as const;

export function exportRows(rows: CategoryRow[]): (string | number | null)[][] {
  return [
    [...CSV_HEADER],
    ...rows.map((r) => [
      r.category,
      r.label,
      r.is_active ? 'yes' : 'no',
      r.band_min_pct,
      r.band_max_pct,
      r.rate?.pct ?? null,
      r.rate?.nexg_delivery_pct ?? null,
      r.rate?.vat_treatment ?? 'inclusive',
      r.fulfilment_methods.join(' '),
      r.approval,
      r.merchant_overrides ? 'yes' : 'no',
      r.rate?.starts_on ?? null,
      r.rate?.ends_on ?? null,
    ]),
  ];
}

/** Splits CSV text into rows of cells: quotes, doubled quotes, CRLF and a BOM. */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** What one imported row asks to change, for rpc_category_commission_save. */
export interface ImportChange {
  category: string;
  label: string;
  payload: Record<string, unknown>;
  /** Plain words for the preview: "Commission 15% → 14%". */
  summary: string[];
}

const yes = (v: string) => /^(yes|y|true|1|on|active)$/i.test(v.trim());
const no = (v: string) => /^(no|n|false|0|off|inactive)$/i.test(v.trim());

/**
 * Compares an uploaded file with the categories as they are, and keeps only
 * what changes. Unknown codes and bad values are errors, not guesses; a new
 * rate starts on `startsOn` unless its row gives a later effective_from.
 */
export function planImport(
  text: string,
  rows: CategoryRow[],
  startsOn: string,
): { changes: ImportChange[]; errors: string[] } {
  const table = readCsv(text);
  const errors: string[] = [];
  const out: ImportChange[] = [];
  if (table.length === 0) return { changes: [], errors: ['The file is empty.'] };
  const head = table[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  if (col('code') < 0) return { changes: [], errors: ['The file needs a "code" column.'] };
  const byCode = new Map(rows.map((r) => [r.category, r]));

  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (name: string) => {
      const c = col(name);
      return c < 0 ? null : (cells[c] ?? '').trim();
    };
    const code = get('code') ?? '';
    const row = byCode.get(code);
    if (!row) {
      errors.push(`Line ${line}: no category with the code "${code}". Add it first.`);
      return;
    }
    const payload: Record<string, unknown> = {};
    const summary: string[] = [];

    const name = get('name');
    if (name && name !== row.label) {
      payload.label = name;
      summary.push(`Name "${row.label}" → "${name}"`);
    }
    const active = get('active');
    if (active) {
      if (!yes(active) && !no(active)) errors.push(`Line ${line}: active is yes or no.`);
      else if (yes(active) !== row.is_active) {
        payload.is_active = yes(active);
        summary.push(yes(active) ? 'Switched on' : 'Switched off');
      }
    }
    for (const key of ['band_min_pct', 'band_max_pct'] as const) {
      const raw = get(key);
      if (raw === null) continue;
      const p = parsePct(raw);
      if (!p.ok) {
        errors.push(`Line ${line}: ${key} is a percentage from 0 to 100.`);
        continue;
      }
      if (p.value !== row[key]) {
        payload[key] = p.value;
        summary.push(
          `${key === 'band_min_pct' ? 'Band from' : 'Band to'} ${pct(row[key], 0)} → ${pct(p.value, 0)}`,
        );
      }
    }
    const fulfil = get('fulfilment');
    if (fulfil !== null) {
      const list = fulfil.split(/[\s;|]+/).filter(Boolean);
      const bad = list.filter((m) => !FULFILMENT_KEYS.has(m));
      if (bad.length) errors.push(`Line ${line}: unknown fulfilment ${bad.join(', ')}.`);
      else if ([...list].sort().join(' ') !== [...row.fulfilment_methods].sort().join(' ')) {
        payload.fulfilment_methods = list;
        summary.push(`Fulfilment → ${list.join(', ') || 'none'}`);
      }
    }
    const approval = get('approval');
    if (approval) {
      if (approval !== 'two_person' && approval !== 'single') {
        errors.push(`Line ${line}: approval is two_person or single.`);
      } else if (approval !== row.approval) {
        payload.approval = approval;
        summary.push(`Approval → ${APPROVAL_LABEL[approval]}`);
      }
    }
    const overrides = get('merchant_overrides');
    if (overrides) {
      if (!yes(overrides) && !no(overrides))
        errors.push(`Line ${line}: merchant_overrides is yes or no.`);
      else if (yes(overrides) !== row.merchant_overrides) {
        payload.merchant_overrides = yes(overrides);
        summary.push(`Merchant overrides ${yes(overrides) ? 'on' : 'off'}`);
      }
    }

    const rawRate = get('commission_pct');
    const rawNexg = get('nexg_delivery_pct');
    const rawVat = get('vat_treatment');
    const rate = rawRate === null ? { ok: true as const, value: null } : parsePct(rawRate);
    const nexg = rawNexg === null ? { ok: true as const, value: null } : parsePct(rawNexg);
    if (!rate.ok || !nexg.ok) {
      errors.push(`Line ${line}: a rate is a percentage from 0 to 100, two decimals at most.`);
    } else if (rawVat && rawVat !== 'inclusive' && rawVat !== 'exclusive') {
      errors.push(`Line ${line}: vat_treatment is inclusive or exclusive.`);
    } else if (rate.value !== null) {
      const vat = (rawVat || row.rate?.vat_treatment || 'inclusive') as VatTreatment;
      const nexgValue = rawNexg === null ? (row.rate?.nexg_delivery_pct ?? null) : nexg.value;
      const differs =
        rate.value !== (row.rate?.pct ?? null) ||
        nexgValue !== (row.rate?.nexg_delivery_pct ?? null) ||
        vat !== (row.rate?.vat_treatment ?? 'inclusive');
      if (differs) {
        const from = get('effective_from');
        const to = get('effective_to');
        const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) && from > startsOn ? from : startsOn;
        if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))
          errors.push(`Line ${line}: effective_to is YYYY-MM-DD.`);
        else {
          payload.rate = {
            pct: rate.value,
            nexg_delivery_pct: nexgValue,
            vat_treatment: vat,
            starts_on: start,
            ends_on: to || null,
          };
          summary.push(
            `Commission ${pct(row.rate?.pct ?? null)} → ${pct(rate.value)} from ${start}`,
          );
        }
      }
    }

    if (Object.keys(payload).length > 0) {
      out.push({ category: code, label: row.label, payload, summary });
    }
  });
  return { changes: out, errors };
}
