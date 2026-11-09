/**
 * Catalog bridge (plan step E1, 8 Nov 2026; docs/discovery/END_TO_END_PLAN.md).
 *
 * Serves the demo catalog API's three reads (/api/merchants, /api/merchants/{id}, /api/areas) from
 * Supabase's public views. The website, the engine and the Consumer app then read Supabase IDs after a
 * setting change only. It sends GET requests with the public key: never the service-role key, never a write.
 */

/** One row of demo-seed/subcategory-map.json. */
export interface BridgeMapRow {
  demoSubcategoryId: string; demoLabel: string; demoCategoryId: string; demoCategoryLabel: string;
  supabase: { category: string; subcategory: string };
  discovery: { categoryId: string; subcategoryId: string } | null;
  status: 'mapped' | 'unmapped';
}

/** Presentation images for demo rows only, keyed by Supabase ID. Supabase has no public photos yet. */
export interface DemoMedia { merchants: ReadonlyMap<string, { heroImage?: string; logoUrl?: string }>; items: ReadonlyMap<string, string> }

export interface MerchantRow {
  id: string; trading_name: string; category_key: string | null; subcategory: string | null;
  branch_address: string | null; branch_latitude: number | null; branch_longitude: number | null;
  accepting_orders: boolean | null; busy_mode_until: string | null; closed_today: boolean | null;
  opens_today: string | null; closes_today: string | null;
}
export interface ItemRow { id: string; merchant_id: string; name: string; description: string | null; price_kes: number | null; sort: number | null }
export interface CatalogRows { merchants: MerchantRow[]; items: ItemRow[] }

export type BridgeFetch = (url: string, init: { method: 'GET'; headers: Record<string, string>; redirect: 'error'; signal: AbortSignal }) => Promise<Response>;

const MERCHANT_COLUMNS = 'id,trading_name,category_key,subcategory,branch_address,branch_latitude,branch_longitude,accepting_orders,busy_mode_until,closed_today,opens_today,closes_today';
const ITEM_COLUMNS = 'id,merchant_id,name,description,price_kes,sort';

export class BridgeError extends Error {
  constructor(readonly status: 400 | 404 | 503, message: string) { super(message); }
}
const malformed = (what: string): never => { throw new BridgeError(503, `Supabase returned a malformed ${what}`); };
const textOrNull = (value: unknown, what: string): string | null => value === null || value === undefined ? null : typeof value === 'string' ? value : malformed(what);
const numberOrNull = (value: unknown, what: string): number | null => value === null || value === undefined ? null : typeof value === 'number' && Number.isFinite(value) ? value : malformed(what);
const boolOrNull = (value: unknown, what: string): boolean | null => value === null || value === undefined ? null : typeof value === 'boolean' ? value : malformed(what);
const requiredText = (value: unknown, what: string): string => typeof value === 'string' && value.trim() ? value : malformed(what);
const record = (value: unknown, what: string): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : malformed(what);

function merchantRow(value: unknown): MerchantRow {
  const row = record(value, 'merchant');
  return { id: requiredText(row.id, 'merchant id'), trading_name: requiredText(row.trading_name, 'merchant name'),
    category_key: textOrNull(row.category_key, 'category key'), subcategory: textOrNull(row.subcategory, 'subcategory'),
    branch_address: textOrNull(row.branch_address, 'address'), branch_latitude: numberOrNull(row.branch_latitude, 'latitude'),
    branch_longitude: numberOrNull(row.branch_longitude, 'longitude'), accepting_orders: boolOrNull(row.accepting_orders, 'accepting_orders'),
    busy_mode_until: textOrNull(row.busy_mode_until, 'busy_mode_until'), closed_today: boolOrNull(row.closed_today, 'closed_today'),
    opens_today: textOrNull(row.opens_today, 'opens_today'), closes_today: textOrNull(row.closes_today, 'closes_today') };
}
function itemRow(value: unknown): ItemRow {
  const row = record(value, 'item');
  return { id: requiredText(row.id, 'item id'), merchant_id: requiredText(row.merchant_id, 'item merchant'), name: requiredText(row.name, 'item name'),
    description: textOrNull(row.description, 'item description'), price_kes: numberOrNull(row.price_kes, 'item price'), sort: numberOrNull(row.sort, 'item sort') };
}

/** Reads every row of the two public views, a page at a time (PostgREST caps each response). */
export class SupabaseCatalogReader {
  readonly #base: URL;
  constructor(url: string, private readonly key: string, private readonly fetcher: BridgeFetch = fetch, private readonly pageSize = 1000, private readonly timeoutMs = 10_000) {
    const base = new URL(url);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('SUPABASE_URL must be a plain http(s) origin');
    if (!key || /\s/.test(key)) throw new Error('SUPABASE_ANON_KEY is missing');
    this.#base = new URL('/rest/v1/', base);
  }
  async load(): Promise<CatalogRows> {
    const merchants = (await this.#all('merchant_public', MERCHANT_COLUMNS, 'id')).map(merchantRow);
    const items = (await this.#all('catalogue_public', ITEM_COLUMNS, 'merchant_id,sort,id')).map(itemRow);
    return { merchants, items };
  }
  async #all(view: string, columns: string, order: string): Promise<unknown[]> {
    const rows: unknown[] = [];
    for (let page = 0; page < 200; page++) {
      const url = new URL(view, this.#base);
      url.search = new URLSearchParams({ select: columns, order, limit: String(this.pageSize), offset: String(page * this.pageSize) }).toString();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        // Only the public key, as the apikey header. A bearer header would break publishable (non-JWT) keys.
        response = await this.fetcher(url.href, { method: 'GET', headers: { apikey: this.key, Accept: 'application/json' }, redirect: 'error', signal: controller.signal });
      } catch { throw new BridgeError(503, `Supabase is unreachable (${view})`); }
      finally { clearTimeout(timer); }
      if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new BridgeError(503, `Supabase answered ${response.status} for ${view}`); }
      const body: unknown = await response.json().catch(() => malformed(view));
      if (!Array.isArray(body)) return malformed(view);
      rows.push(...body);
      if (body.length < this.pageSize) return rows;
    }
    throw new BridgeError(503, `${view} is larger than the bridge reads`);
  }
}

/** Two-part addresses such as "Kilimani, Nairobi" name the area; anything else stays unknown. */
export function areaFromAddress(address: string | null): string | undefined {
  const parts = (address ?? '').split(',').map(part => part.trim());
  return parts.length === 2 && parts[0] && /^nairobi$/i.test(parts[1] ?? '') ? parts[0] : undefined;
}

const minutes = (time: string | null): number | undefined => {
  const match = time ? /^(\d{2}):(\d{2})/.exec(time) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
};
/** Open state in Nairobi time. Unknown hours stay unknown rather than defaulting to open. */
export function openState(row: MerchantRow, now: number): boolean | undefined {
  if (row.accepting_orders === false || row.closed_today === true) return false;
  if (row.busy_mode_until && Date.parse(row.busy_mode_until) > now) return false;
  const opens = minutes(row.opens_today); const closes = minutes(row.closes_today);
  if (opens === undefined || closes === undefined) return undefined;
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now).split(':').map(Number) as [number, number];
  const current = hour * 60 + minute;
  return closes > opens ? current >= opens && current < closes : current >= opens || current < closes;
}

export interface BridgeItem { id: string; merchantId: string; merchantName: string; name: string; description?: string; price?: number; currency?: string; image?: string }
export interface BridgeMerchant {
  id: string; name: string; categoryId?: string; category?: string; subcategoryId?: string; subcategory?: string;
  nairobiArea?: string; address?: string; latitude?: number; longitude?: number; isOpen?: boolean; heroImage?: string; logoUrl?: string;
  items: BridgeItem[];
}
export interface MerchantQuery { subcategory?: string; discoveryCategory?: string; search?: string; area?: string; limit: number; offset: number }

const LIST_ITEMS = 30;
const DETAIL_ITEMS = 200;

/** Shapes Supabase rows like the demo API, using the reviewed subcategory map for categories. */
export class CatalogBridge {
  readonly #byPair = new Map<string, BridgeMapRow>();
  #merchants: { merchant: BridgeMerchant; row: BridgeMapRow | undefined }[] = [];
  #byId = new Map<string, BridgeMerchant>();
  #loadedAt: number | undefined;
  constructor(map: readonly BridgeMapRow[], private readonly media: DemoMedia = { merchants: new Map(), items: new Map() }) {
    for (const row of map) this.#byPair.set(`${row.supabase.category}/${row.supabase.subcategory}`, row);
  }
  get loadedAt(): number | undefined { return this.#loadedAt; }
  get size(): { merchants: number; items: number } { return { merchants: this.#merchants.length, items: this.#merchants.reduce((total, entry) => total + entry.merchant.items.length, 0) }; }

  /** Replaces the served catalog in one step; a reader failure leaves the previous one in place. */
  replace(rows: CatalogRows, now: number = Date.now()): void {
    const items = new Map<string, ItemRow[]>();
    for (const item of rows.items) items.set(item.merchant_id, [...(items.get(item.merchant_id) ?? []), item]);
    const merchants = rows.merchants.map(row => {
      const map = row.category_key && row.subcategory ? this.#byPair.get(`${row.category_key}/${row.subcategory}`) : undefined;
      const area = areaFromAddress(row.branch_address);
      const open = openState(row, now);
      const media = this.media.merchants.get(row.id);
      const merchant: BridgeMerchant = {
        id: row.id, name: row.trading_name,
        ...(map ? { categoryId: map.demoCategoryId, category: map.demoCategoryLabel, subcategoryId: map.demoSubcategoryId, subcategory: map.demoLabel } : {}),
        ...(area ? { nairobiArea: area } : {}), ...(row.branch_address ? { address: row.branch_address } : {}),
        ...(row.branch_latitude !== null && row.branch_longitude !== null ? { latitude: row.branch_latitude, longitude: row.branch_longitude } : {}),
        ...(open !== undefined ? { isOpen: open } : {}),
        ...(media?.heroImage ? { heroImage: media.heroImage } : {}), ...(media?.logoUrl ? { logoUrl: media.logoUrl } : {}),
        items: (items.get(row.id) ?? []).sort((left, right) => (left.sort ?? 0) - (right.sort ?? 0) || left.id.localeCompare(right.id)).slice(0, DETAIL_ITEMS).map(item => {
          const image = this.media.items.get(item.id);
          return { id: item.id, merchantId: row.id, merchantName: row.trading_name, name: item.name,
            ...(item.description?.trim() ? { description: item.description } : {}),
            ...(item.price_kes !== null && Number.isInteger(item.price_kes) && item.price_kes > 0 ? { price: item.price_kes, currency: 'KES' } : {}),
            ...(image ? { image } : {}) };
        }),
      };
      return { merchant, row: map };
    }).sort((left, right) => left.merchant.name.localeCompare(right.merchant.name, 'en-KE', { sensitivity: 'base' }) || left.merchant.id.localeCompare(right.merchant.id));
    this.#merchants = merchants;
    this.#byId = new Map(merchants.map(entry => [entry.merchant.id, entry.merchant]));
    this.#loadedAt = now;
  }

  #ready(): void { if (this.#loadedAt === undefined) throw new BridgeError(503, 'The catalog has not loaded from Supabase yet'); }

  /**
   * Same selection rules as the demo API. A subcategory selects its demo source group. A Discovery category
   * (or "all") selects the union of its mapped groups only, so unmapped groups never leak into browsing.
   * Supabase has no ratings, delivery times or price levels, so every sort is by name.
   */
  merchants(query: MerchantQuery): { total: number; offset: number; limit: number; merchants: BridgeMerchant[] } {
    this.#ready();
    const search = query.search?.trim().toLocaleLowerCase('en-KE');
    const eligible = this.#merchants.filter(({ merchant, row }) => {
      if (!row || row.status !== 'mapped' || !row.discovery) return false;
      if (query.subcategory ? row.demoSubcategoryId !== query.subcategory
        : query.discoveryCategory && query.discoveryCategory !== 'all' && row.discovery.categoryId !== query.discoveryCategory) return false;
      if (query.area && query.area !== 'all' && merchant.nairobiArea !== query.area) return false;
      return !search || merchant.name.toLocaleLowerCase('en-KE').includes(search);
    });
    const page = eligible.slice(query.offset, query.offset + query.limit).map(({ merchant }) => ({ ...merchant, items: merchant.items.slice(0, LIST_ITEMS) }));
    return { total: eligible.length, offset: query.offset, limit: query.limit, merchants: page };
  }

  merchant(id: string): BridgeMerchant {
    this.#ready();
    return this.#byId.get(id) ?? (() => { throw new BridgeError(404, 'Merchant not found'); })();
  }

  areas(): { areas: string[] } {
    this.#ready();
    const areas = new Set(this.#merchants.flatMap(({ merchant, row }) => row?.status === 'mapped' && merchant.nairobiArea ? [merchant.nairobiArea] : []));
    return { areas: [...areas].sort((left, right) => left.localeCompare(right, 'en-KE')) };
  }
}

/** Parses the demo API's list parameters, with its defaults and limits. */
export function merchantQuery(params: Record<string, unknown>): MerchantQuery {
  const one = (key: string): string | undefined => {
    const value = params[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.length > 256) throw new BridgeError(400, `Invalid ${key}`);
    return value;
  };
  const integer = (key: string, fallback: number, minimum: number, maximum: number): number => {
    const value = one(key);
    if (value === undefined) return fallback;
    if (!/^\d{1,6}$/.test(value) || Number(value) < minimum || Number(value) > maximum) throw new BridgeError(400, `Invalid ${key}`);
    return Number(value);
  };
  const subcategory = one('subcategory'); const discoveryCategory = one('discoveryCategory'); const search = one('search'); const area = one('area');
  one('sort');
  return { ...(subcategory ? { subcategory } : {}), ...(discoveryCategory ? { discoveryCategory } : {}), ...(search?.trim() ? { search } : {}),
    ...(area ? { area } : {}), limit: integer('limit', 24, 1, 200), offset: integer('offset', 0, 0, 100_000) };
}

/**
 * Derrick NexG's category_config spells ten subcategory keys differently from the demo seed (checked against its
 * migrations on 8 Nov 2026; labels identical). Merchants onboarded through the merchant portal use the config
 * spelling, so both spellings select the same reviewed map row. Key: the seed's pair.
 * Keep equal to SUBCATEGORY_KEY_ALIASES in the website's src/providers/supabaseProvider.ts.
 */
export const PORTAL_SUBCATEGORY_SPELLINGS: Readonly<Record<string, string>> = {
  'airport_transfers/airport_drop-off': 'airport_dropoff',
  'airport_transfers/meet__greet': 'meet_greet',
  'vehicle_rentals/long-term_rental': 'long_term_rental',
  'restaurants_food/caf': 'cafe',
  'marketplace/home__living': 'home_living',
  'pharmacy/pharmacy': 'pharmacy_retail',
  'health/mental_health_therapy': 'mental_health',
  'tech_electronics/accessories': 'tech_accessories',
  'logistics_shipping/road_freight__trucking': 'road_freight',
  'logistics_shipping/warehousing__storage': 'warehousing',
};
const MAP_KEY = /^[a-z0-9_-]+$/;
const mapPair = (row: Pick<BridgeMapRow, 'supabase'>) => `${row.supabase.category}/${row.supabase.subcategory}`;

/** Checks demo-seed/subcategory-map.json row by row and adds the portal's spellings. A stale spelling is skipped. */
export function portalMapRows(source: unknown): BridgeMapRow[] {
  const rows = source && typeof source === 'object' ? (source as { subcategories?: unknown }).subcategories : undefined;
  if (!Array.isArray(rows)) throw new Error('Invalid subcategory map');
  const checked = rows.map((value): BridgeMapRow => {
    const row = (value ?? {}) as Partial<BridgeMapRow>;
    const discovery = row.discovery;
    const ok = typeof row.demoSubcategoryId === 'string' && typeof row.demoLabel === 'string' && typeof row.demoCategoryId === 'string'
      && typeof row.demoCategoryLabel === 'string' && !!row.supabase && typeof row.supabase.category === 'string' && typeof row.supabase.subcategory === 'string'
      && MAP_KEY.test(row.supabase.category) && MAP_KEY.test(row.supabase.subcategory)
      && (row.status === 'mapped' ? !!discovery && typeof discovery.categoryId === 'string' && typeof discovery.subcategoryId === 'string'
        : row.status === 'unmapped' && !discovery);
    if (!ok) throw new Error('Invalid subcategory map row');
    return { demoSubcategoryId: row.demoSubcategoryId!, demoLabel: row.demoLabel!, demoCategoryId: row.demoCategoryId!, demoCategoryLabel: row.demoCategoryLabel!,
      supabase: { category: row.supabase!.category, subcategory: row.supabase!.subcategory },
      discovery: discovery ? { categoryId: discovery.categoryId, subcategoryId: discovery.subcategoryId } : null, status: row.status! };
  });
  const pairs = new Set(checked.map(mapPair));
  if (pairs.size !== checked.length) throw new Error('Duplicate Supabase keys in the subcategory map');
  const spellings = Object.entries(PORTAL_SUBCATEGORY_SPELLINGS).flatMap(([pair, subcategory]) => {
    const row = checked.find(entry => mapPair(entry) === pair);
    const alias = row ? { ...row, supabase: { category: row.supabase.category, subcategory } } : undefined;
    return alias && MAP_KEY.test(subcategory) && !pairs.has(mapPair(alias)) ? [alias] : [];
  });
  return [...checked, ...spellings];
}

/** The demo IDs in the seed are fixed: merchant M0384 is c1…384 and item I12476 is f1…12476. */
const fixedId = (prefix: string, code: string, letter: 'M' | 'I'): string | undefined => {
  const match = new RegExp(`^${letter}(\\d{1,12})$`).exec(code);
  return match ? `${prefix}000000-0000-4000-8000-${match[1]!.padStart(12, '0')}` : undefined;
};
/** Builds the demo image overlay from the demo API snapshot (demo-seed/source/demo-api-snapshot.json). */
export function demoMediaFromSnapshot(snapshot: unknown): DemoMedia {
  const merchants = new Map<string, { heroImage?: string; logoUrl?: string }>();
  const items = new Map<string, string>();
  const https = (value: unknown): string | undefined => typeof value === 'string' && /^https:\/\/[^\s\\]+$/.test(value) ? value : undefined;
  const rows = record(snapshot, 'snapshot').merchants;
  if (!Array.isArray(rows)) return malformed('snapshot');
  for (const value of rows) {
    const merchant = record(value, 'snapshot merchant');
    const id = typeof merchant.id === 'string' ? fixedId('c1', merchant.id, 'M') : undefined;
    if (!id) continue;
    const heroImage = https(merchant.heroImage); const logoUrl = https(merchant.logoUrl);
    merchants.set(id, { ...(heroImage ? { heroImage } : {}), ...(logoUrl ? { logoUrl } : {}) });
    for (const raw of Array.isArray(merchant.items) ? merchant.items : []) {
      const item = record(raw, 'snapshot item');
      const itemId = typeof item.id === 'string' ? fixedId('f1', item.id, 'I') : undefined;
      const image = https(item.image);
      if (itemId && image) items.set(itemId, image);
    }
  }
  return { merchants, items };
}
