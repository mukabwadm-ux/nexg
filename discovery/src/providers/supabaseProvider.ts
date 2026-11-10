/**
 * Supabase provider (plan step E2, 8 Nov 2026; docs/discovery/END_TO_END_PLAN.md).
 *
 * Reads Derrick NexG's Supabase from the browser: the public views merchant_public and catalogue_public,
 * over PostgREST, with GET requests and the public key only. It filters and pages on the server, so a
 * page reads its own merchants and their items, never the whole catalogue.
 *
 * Rows are shaped by the reviewed catalog bridge (./catalogBridge.ts: subcategory map, area, coordinates,
 * Nairobi open state, whole-shilling prices, demo photos for demo IDs) and then by the platform provider's
 * mapper. Every screen gets the shape it gets today, with Supabase IDs.
 *
 * A category (or everything) is read by whole platform categories, so a store with no subcategory, or with one
 * the reviewed map doesn't know yet, is still listed under its category. Live stores often have no subcategory
 * yet. A subcategory or option reads only its exact groups.
 */
import subcategoryMap from '../../demo-seed/subcategory-map.json';
import { CatalogBridge, areaFromAddress, type BridgeMapRow, type DemoMedia, type ItemRow, type MerchantRow } from './catalogBridge';
import { findCategory, findSubcategory } from '../data/taxonomy';
import type { CollectionResult, DiscoveryProvider, DiscoveryQuery, Merchant, MerchantResult, OfferingResult } from './DiscoveryProvider';
import { collectionDefinitions } from '../data/discoveryConfiguration';
import { pageOfferings, toMerchant } from './platformMerchantProvider';
import { ProviderReadError } from './readState';
import { SUPABASE_PROVIDER_VERSION, supabaseCapabilities, supabaseSettings } from './supabaseSettings';

/** The catalog bridge's columns. */
const MERCHANT_COLUMNS = 'id,trading_name,category_key,subcategory,branch_address,branch_latitude,branch_longitude,accepting_orders,busy_mode_until,closed_today,opens_today,closes_today,featured,closed_early_at';
/** Recommended, as on the platform: featured merchants first, then by name. Supabase has no ratings. */
const MERCHANT_ORDER = 'featured.desc.nullslast,trading_name.asc,id.asc';
const ITEM_COLUMNS = 'id,merchant_id,section_id,name,description,price_kes,sort';
/** Items per merchant: the catalog bridge's list and detail limits. */
const LIST_ITEMS = 30;
const DETAIL_ITEMS = 200;
/** L2 rails show at most 12 items per store. */
const COLLECTION_ITEMS = 12;
/** Stores on a category's last rail ("More stores"), as many as a type rail shows; View all lists the rest. */
const REST_MERCHANTS = 6;
/** Supabase's default cap on rows per PostgREST reply. */
const PAGE_ROWS = 1000;
/** Merchants per item read: 30 merchants × 30 items fit one reply, and the URL stays near 1 KB. */
const ITEM_BATCH = 30;
/** The platform adapter's limit for one complete inventory. */
const MAX_INVENTORY = 10_000;
/** The bridge's limit on a search or area value. */
const MAX_TEXT = 256;
const AREAS_TTL_MS = 5 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_MERCHANT = /^c1000000-0000-4000-8000-\d{12}$/;
const KEY = /^[a-z0-9_-]+$/;
const NO_MEDIA: DemoMedia = { merchants: new Map(), items: new Map() };

/**
 * Derrick NexG's category_config spells ten subcategory keys differently from the demo seed (checked
 * against its migrations on 8 Nov 2026, labels identical). Merchants onboarded through the console use
 * the config spelling, so both spellings select the same reviewed map row. Key: the seed's pair.
 */
export const SUBCATEGORY_KEY_ALIASES: Readonly<Record<string, string>> = {
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

const unavailable = () => new ProviderReadError({ kind: 'unavailable' });
const missing = () => new ProviderReadError({ kind: 'missing' });
const invalid = () => new ProviderReadError({ kind: 'invalid' });
const unsupported = () => new ProviderReadError({ kind: 'unsupported' });
const pairKey = (row: Pick<BridgeMapRow, 'supabase'>) => `${row.supabase.category}/${row.supabase.subcategory}`;

/** Checks the reviewed map and adds the config spellings. A stale alias is skipped (a test keeps them current). */
export function supabaseMapRows(source: unknown): BridgeMapRow[] {
  const rows = source && typeof source === 'object' ? (source as { subcategories?: unknown }).subcategories : undefined;
  if (!Array.isArray(rows)) throw new Error('Invalid subcategory map');
  const checked = rows.map((value): BridgeMapRow => {
    const row = (value ?? {}) as Partial<BridgeMapRow>;
    const discovery = row.discovery;
    const ok = typeof row.demoSubcategoryId === 'string' && typeof row.demoLabel === 'string' && typeof row.demoCategoryId === 'string' && typeof row.demoCategoryLabel === 'string'
      && !!row.supabase && typeof row.supabase.category === 'string' && typeof row.supabase.subcategory === 'string'
      && KEY.test(row.supabase.category) && KEY.test(row.supabase.subcategory)
      && (row.status === 'mapped' ? !!discovery && typeof discovery.categoryId === 'string' && typeof discovery.subcategoryId === 'string' : row.status === 'unmapped' && !discovery);
    if (!ok) throw new Error('Invalid subcategory map row');
    return {
      demoSubcategoryId: row.demoSubcategoryId!, demoLabel: row.demoLabel!, demoCategoryId: row.demoCategoryId!, demoCategoryLabel: row.demoCategoryLabel!,
      supabase: { category: row.supabase!.category, subcategory: row.supabase!.subcategory },
      discovery: discovery ? { categoryId: discovery.categoryId, subcategoryId: discovery.subcategoryId } : null,
      status: row.status!,
    };
  });
  const pairs = new Set(checked.map(pairKey));
  if (pairs.size !== checked.length) throw new Error('Duplicate Supabase keys in the subcategory map');
  const aliases = Object.entries(SUBCATEGORY_KEY_ALIASES).flatMap(([pair, subcategory]) => {
    const row = checked.find((entry) => pairKey(entry) === pair);
    const alias = row ? { ...row, supabase: { category: row.supabase.category, subcategory } } : undefined;
    return alias && KEY.test(subcategory) && !pairs.has(pairKey(alias)) ? [alias] : [];
  });
  return [...checked, ...aliases];
}

// The catalog bridge's row checks (catalogBridge.ts merchantRow and itemRow), plus UUID identities.
const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw unavailable();
  return value;
};
const finite = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw unavailable();
  return value;
};
const flag = (value: unknown): boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'boolean') throw unavailable();
  return value;
};
const required = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw unavailable();
  return value;
};
const uuid = (value: unknown): string => {
  if (typeof value !== 'string' || !UUID.test(value)) throw unavailable();
  return value.toLowerCase();
};
const fields = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable();
  return value as Record<string, unknown>;
};
/** The bridge's merchant row, plus the paid featured flag and the merchant console's "close early" time. */
type SupabaseMerchantRow = MerchantRow & { featured: boolean | null; closed_early_at: string | null };
function merchantRow(value: unknown): SupabaseMerchantRow {
  const row = fields(value);
  return {
    id: uuid(row.id), trading_name: required(row.trading_name), category_key: text(row.category_key), subcategory: text(row.subcategory),
    branch_address: text(row.branch_address), branch_latitude: finite(row.branch_latitude), branch_longitude: finite(row.branch_longitude),
    accepting_orders: flag(row.accepting_orders), busy_mode_until: text(row.busy_mode_until), closed_today: flag(row.closed_today),
    opens_today: text(row.opens_today), closes_today: text(row.closes_today), featured: flag(row.featured), closed_early_at: text(row.closed_early_at),
  };
}
const nairobiDate = (time: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(time);
/** A merchant that pressed "Close early" today is closed now, whatever its hours say (the bridge's openState doesn't read it). */
const closedEarly = (row: SupabaseMerchantRow, now: number) => {
  const closedAt = row.closed_early_at ? Date.parse(row.closed_early_at) : Number.NaN;
  return Number.isFinite(closedAt) && closedAt <= now && nairobiDate(closedAt) === nairobiDate(now);
};
/** A catalogue_public row; section_id points at the merchant's own catalogue_section. */
type SupabaseItemRow = ItemRow & { section_id: string | null };
function itemRow(value: unknown): SupabaseItemRow {
  const row = fields(value);
  return { id: uuid(row.id), merchant_id: uuid(row.merchant_id), section_id: row.section_id === null || row.section_id === undefined ? null : uuid(row.section_id),
    name: required(row.name), description: text(row.description), price_kes: finite(row.price_kes), sort: finite(row.sort) };
}
interface SectionRow { id: string; merchant_id: string; name: string; sort: number }
function sectionRow(value: unknown): SectionRow {
  const row = fields(value);
  return { id: uuid(row.id), merchant_id: uuid(row.merchant_id), name: (text(row.name) ?? '').trim(), sort: finite(row.sort) ?? 0 };
}

/** Content-Range, e.g. "0-23/57" or "*\/0", from a count=exact reply. */
function countFrom(header: string | null): number | undefined {
  const match = header ? /^(?:\d+-\d+|\*)\/(\d+)$/.exec(header.trim()) : null;
  return match ? Number(match[1]) : undefined;
}

/** ILIKE pattern for a literal search. Escapes \ % _; PostgREST reads * as %, so it becomes a one-character match. */
const likePattern = (search: string) => search.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '_');
/** A double-quoted value inside a PostgREST and()/or() tree: backslash and quote are escaped. */
const quoted = (value: string) => `"${value.replace(/[\\"]/g, '\\$&')}"`;
/** Search folding: case and accents ignored, so "cafe" finds "Café". */
export const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-KE');

/** ASCII punctuation. In a PostgreSQL regular expression, a backslash before it means the character itself. */
const PUNCTUATION = /[!-\/:-@\[-`{-~]/g;
/** Exactly the characters JavaScript's trim() removes, as areaFromAddress uses it; PostgreSQL's [[:space:]] differs by locale. */
const TRIMMED = `[${String.fromCharCode(9, 10, 11, 12, 13, 32, 0xa0, 0x1680, 0x2000)}-${String.fromCharCode(0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff)}]`;
/** Server-side twin of areaFromAddress: exactly "<area>, Nairobi", with spaces around the parts and any case of Nairobi. */
const areaPattern = (area: string) => {
  const literal = area.replace(PUNCTUATION, '\\$&');
  return `^${TRIMMED}*${literal}${TRIMMED}*,${TRIMMED}*[Nn][Aa][Ii][Rr][Oo][Bb][Ii]${TRIMMED}*$`;
};

/**
 * What a read covers. A category or "all" names whole platform categories (`categories`); a subcategory or option
 * names exact groups (`rows`) and no whole category. Search also matches labels: a category's name selects its
 * whole platform category (`labelCategories`), a subcategory's name its groups (`labelRows`).
 */
interface Scope {
  rows: readonly BridgeMapRow[];
  categories: readonly string[];
  search?: string;
  area?: string;
  labelRows?: readonly BridgeMapRow[];
  labelCategories?: readonly string[];
}

/** and(category_key.eq.X,subcategory.in.(a,b)) groups for the rows' Supabase keys, in a stable order. */
function keyGroups(rows: readonly BridgeMapRow[]): [string, string][] {
  const groups = new Map<string, Set<string>>();
  for (const row of rows) groups.set(row.supabase.category, (groups.get(row.supabase.category) ?? new Set<string>()).add(row.supabase.subcategory));
  return [...groups].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([category, subcategories]) => [category, [...subcategories].sort().join(',')]);
}
const groupTerm = ([category, list]: [string, string]) => `and(category_key.eq.${category},subcategory.in.(${list}))`;
const sortedKeys = (keys: readonly string[]) => [...new Set(keys)].sort();

/**
 * PostgREST filters for the scope's Supabase keys, search and area. Deterministic, so pages stay stable.
 * Search matches the merchant's name, or, as on the demo API, its category or subcategory name.
 */
function merchantFilters(scope: Scope): Record<string, string> {
  const whole = sortedKeys(scope.categories);
  const sorted = keyGroups(scope.rows);
  const [only] = sorted;
  const terms = whole.length ? [`category_key.in.(${whole.join(',')})`] : sorted.map(groupTerm);
  let params: Record<string, string> = whole.length ? { category_key: `in.(${whole.join(',')})` }
    : sorted.length === 1 && only ? { category_key: `eq.${only[0]}`, subcategory: `in.(${only[1]})` }
    : { or: `(${terms.join(',')})` };
  const labels = [...sortedKeys(scope.labelCategories ?? []).map((key) => `category_key.eq.${key}`), ...keyGroups(scope.labelRows ?? []).map(groupTerm)];
  if (scope.search && labels.length) {
    const name = `trading_name.ilike.${quoted(`*${likePattern(scope.search)}*`)}`;
    params = { and: `(or(${terms.join(',')}),or(${[name, ...labels].join(',')}))` };
  } else if (scope.search) params.trading_name = `ilike.*${likePattern(scope.search)}*`;
  if (scope.area) params.branch_address = `match.${areaPattern(scope.area)}`;
  return params;
}

/** The last rail on a category page: "All stores" when no type has a rail of its own, "More stores" after them. */
function restTitle(categoryId: string, afterTypes: boolean): string {
  const noun = categoryId === 'travel-tours' ? 'trips' : categoryId === 'experiences' ? 'experiences' : 'stores';
  return `${afterTypes ? 'More' : 'All'} ${noun}`;
}

/** Old links and the owner's test sheet use demo codes such as M0384; they open the same demo row by its UUID. */
function merchantUuid(id: string): string | undefined {
  if (UUID.test(id)) return id.toLowerCase();
  const demo = /^M(\d{1,12})$/.exec(id);
  return demo ? `c1000000-0000-4000-8000-${demo[1]!.padStart(12, '0')}` : undefined;
}

/** Supabase has no ratings, delivery times or price levels, and no seeded hours: other sorts and Open now are refused. */
function requireSupported(query: Pick<DiscoveryQuery, 'openNow' | 'sort'>): void {
  if (query.openNow || (query.sort && query.sort !== 'recommended')) throw unsupported();
}

function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener('abort', abort); reject(error); },
    );
  });
}

export type SupabaseFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface SupabaseProviderOptions {
  /** VITE_SUPABASE_URL: the project URL. */
  url: unknown;
  /** VITE_SUPABASE_ANON_KEY: the public anon or publishable key. */
  anonKey: unknown;
  fetch?: SupabaseFetch;
  now?: () => number;
  /** Demo photos, loaded only when a reply holds demo rows. */
  media?: () => Promise<DemoMedia>;
  /** The reviewed subcategory map; demo-seed/subcategory-map.json by default. */
  map?: unknown;
  timeoutMs?: number;
}

export class SupabaseDiscoveryProvider implements DiscoveryProvider {
  readonly version = SUPABASE_PROVIDER_VERSION;
  readonly capabilities = supabaseCapabilities;
  readonly #rest: URL;
  readonly #key: string;
  readonly #fetch: SupabaseFetch;
  readonly #now: () => number;
  readonly #rows: BridgeMapRow[];
  /** Mapped rows whose Discovery category is on screen (hidden categories, such as Play, are left out). */
  readonly #visible: BridgeMapRow[];
  readonly #mediaSource: (() => Promise<DemoMedia>) | undefined;
  readonly #timeoutMs: number;
  #media: Promise<DemoMedia> | undefined;
  #areas: { at: number; value: Promise<string[]> } | undefined;

  constructor(options: SupabaseProviderOptions) {
    const settings = supabaseSettings(options.url, options.anonKey);
    this.#rest = new URL('/rest/v1/', settings.origin);
    this.#key = settings.anonKey;
    // Called through a wrapper: a bare window.fetch throws "Illegal invocation" when called as a method.
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#now = options.now ?? Date.now;
    this.#rows = supabaseMapRows(options.map ?? subcategoryMap);
    this.#visible = this.#rows.filter((row) => row.status === 'mapped' && !!row.discovery && !!findCategory(row.discovery.categoryId));
    this.#mediaSource = options.media;
    this.#timeoutMs = options.timeoutMs ?? 12_000;
  }

  async getMerchants(query: DiscoveryQuery, signal?: AbortSignal): Promise<MerchantResult & { total: number; hasMore: boolean }> {
    requireSupported(query);
    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.min(48, Math.max(1, query.limit ?? 24));
    const scope = this.#scope(query);
    if (typeof scope === 'string') return { merchants: [], total: 0, offset, hasMore: false, mapping: scope === 'unmapped' ? 'unmapped' : 'mapped' };
    const { rows, total } = await this.#read('merchant_public', {
      select: MERCHANT_COLUMNS, ...merchantFilters(scope), order: MERCHANT_ORDER, limit: String(limit), offset: String(offset),
    }, true, signal);
    const page = rows.map(merchantRow);
    // A shorter page than the count allows means the server capped the reply; paging on would skip merchants.
    if (total === undefined || page.length !== Math.max(0, Math.min(limit, total - offset)) || new Set(page.map((row) => row.id)).size !== page.length) throw unavailable();
    const merchants = await this.#hydrate(page, LIST_ITEMS, query, signal);
    return { merchants, total, offset, hasMore: offset + limit < total, mapping: 'mapped' };
  }

  getExperienceOfferings(query: DiscoveryQuery, signal?: AbortSignal): Promise<OfferingResult> { return this.#offerings('experiences', query, signal); }
  getTourOfferings(query: DiscoveryQuery, signal?: AbortSignal): Promise<OfferingResult> { return this.#offerings('travel-tours', query, signal); }

  /**
   * The platform's collection rules (readCollections), from one read of the category instead of two requests per
   * subcategory: each request costs a gateway round trip and a CORS pre-flight. Items are read only for the
   * merchants shown, and rails show at most COLLECTION_ITEMS per store.
   */
  async getCollections(categoryId: string, query: Pick<DiscoveryQuery, 'area' | 'search' | 'sort' | 'openNow'> = {}, signal?: AbortSignal): Promise<CollectionResult> {
    requireSupported(query);
    const definitions = collectionDefinitions(categoryId);
    if (!definitions.length) return { collections: [], partial: false };
    const scope = this.#scope({ ...query, categoryId });
    if (typeof scope === 'string') return { collections: [], partial: false };
    const rows = (await this.#readAll('merchant_public', { select: MERCHANT_COLUMNS, ...merchantFilters(scope), order: MERCHANT_ORDER }, signal)).map(merchantRow);
    const byPair = new Map(this.#rows.map((row) => [pairKey(row), row.demoSubcategoryId]));
    const demoSubcategory = (row: MerchantRow) => byPair.get(`${row.category_key}/${row.subcategory}`);
    const signatures = new Set<string>();
    const chosen = definitions.flatMap((definition) => {
      const sources = findSubcategory(categoryId, definition.subcategoryId)?.sourceIds ?? [];
      const members = rows.filter((row) => sources.includes(demoSubcategory(row) ?? ''));
      if (members.length < definition.minimumDistinctMerchants) return [];
      const shown = members.slice(0, Math.min(48, definition.maximumMerchants));
      const signature = shown.map((row) => row.id).sort().join('|');
      if (signatures.has(signature)) return [];
      signatures.add(signature);
      return [{ definition, shown }];
    });
    if (categoryId !== 'restaurants-food' && categoryId !== 'travel-tours') chosen.splice(4);
    // Stores no rail above holds (no subcategory, one the map doesn't know, or a type too small for a rail of its own)
    // get the last rail, so everyone listed in the category can be found from its page. Its View all is the category.
    const covered = new Set(chosen.flatMap(({ definition }) => findSubcategory(categoryId, definition.subcategoryId)?.sourceIds ?? []));
    const rest = rows.filter((row) => !covered.has(demoSubcategory(row) ?? '')).slice(0, REST_MERCHANTS);
    const unique = [...new Map([...chosen.flatMap(({ shown }) => shown), ...rest].map((row) => [row.id, row])).values()];
    const merchants = new Map((await this.#hydrate(unique, COLLECTION_ITEMS, { categoryId }, signal)).map((merchant) => [merchant.id, merchant]));
    const collections: CollectionResult['collections'] = chosen.map(({ definition, shown }) => ({ id: definition.id, title: definition.title, subcategoryId: definition.subcategoryId, merchants: shown.map((row) => merchants.get(row.id)!) }));
    if (rest.length) {
      collections.push({ id: `${categoryId}:collection:rest`, title: restTitle(categoryId, chosen.length > 0),
        viewAllQuery: { categoryId, ...(query.area ? { area: query.area } : {}) }, merchants: rest.map((row) => merchants.get(row.id)!) });
    }
    return { collections, partial: false };
  }

  async getMerchant(id: string, signal?: AbortSignal): Promise<Merchant> {
    const merchantId = merchantUuid(id);
    if (!merchantId) throw missing();
    const { rows } = await this.#read('merchant_public', { select: MERCHANT_COLUMNS, id: `eq.${merchantId}`, limit: '1' }, false, signal);
    if (!rows.length) throw missing();
    const row = merchantRow(rows[0]);
    if (row.id !== merchantId || rows.length > 1) throw unavailable();
    const [merchant] = await this.#hydrate([row], DETAIL_ITEMS, undefined, signal, true);
    if (!merchant) throw unavailable();
    return merchant;
  }

  getAreas(signal?: AbortSignal): Promise<string[]> {
    const now = this.#now();
    if (!this.#areas || now - this.#areas.at > AREAS_TTL_MS) {
      const value = this.#readAreas();
      this.#areas = { at: now, value };
      value.catch(() => { if (this.#areas?.value === value) this.#areas = undefined; });
    }
    // Two screens ask at once; they share one read. An aborted caller stops waiting, not the read.
    return untilAborted(this.#areas.value, signal).then((areas) => [...areas]);
  }

  /**
   * A subcategory or option selects its demo groups. A category, or everything, selects the whole platform
   * categories its mapped groups come from, so stores with no subcategory, or an unmapped one, are listed there.
   * Platform categories with no Discovery category (Financial Services, Logistics & Shipping, Something else)
   * stay off customer screens.
   */
  #scope(query: DiscoveryQuery): Scope | 'unmapped' | 'empty' {
    const category = findCategory(query.categoryId);
    if (query.categoryId && !category) throw invalid();
    const subcategory = findSubcategory(query.categoryId, query.subcategoryId);
    if (query.subcategoryId && !subcategory) throw invalid();
    const option = subcategory?.options.find((entry) => entry.id === query.optionId);
    if (query.optionId && !option) throw invalid();
    const search = query.search?.trim();
    if ((search?.length ?? 0) > MAX_TEXT || (query.area?.length ?? 0) > MAX_TEXT) throw invalid();
    const area = query.area && query.area !== 'all' ? query.area : undefined;
    // areaFromAddress never yields an area with a comma or outer spaces, so no merchant can match one.
    if (area !== undefined && (area !== area.trim() || area.includes(','))) return 'empty';
    const sourceIds = option?.sourceIds ?? subcategory?.sourceIds;
    if (sourceIds && !sourceIds.length) return 'unmapped';
    const rows = this.#visible.filter((row) => sourceIds ? sourceIds.includes(row.demoSubcategoryId) : !category || row.discovery!.categoryId === category.id);
    if (!rows.length) return 'unmapped';
    const categories = sourceIds ? [] : sortedKeys(rows.map((row) => row.supabase.category));
    // The demo API's search also matched category and subcategory names. A category's name matches its whole
    // platform category (stores without a subcategory too); a subcategory's name matches that subcategory's groups.
    const term = search ? fold(search) : '';
    const matches = (labels: (string | undefined)[]) => labels.some((label) => label && fold(label).includes(term));
    const labelCategories = new Set<string>();
    const labelRows: BridgeMapRow[] = [];
    if (term) for (const row of rows) {
      const inCategory = matches([row.demoCategoryLabel, findCategory(row.discovery?.categoryId)?.label]);
      if (inCategory && categories.includes(row.supabase.category)) labelCategories.add(row.supabase.category);
      else if (inCategory || matches([row.demoLabel, findSubcategory(row.discovery?.categoryId, row.discovery?.subcategoryId)?.label])) labelRows.push(row);
    }
    return { rows, categories, ...(search ? { search } : {}), ...(area ? { area } : {}),
      ...(labelRows.length ? { labelRows } : {}), ...(labelCategories.size ? { labelCategories: [...labelCategories] } : {}) };
  }

  /** Offerings need the complete scoped inventory, as on the platform: search covers item and host names. */
  async #offerings(categoryId: 'experiences' | 'travel-tours', query: DiscoveryQuery, signal?: AbortSignal): Promise<OfferingResult> {
    if (query.categoryId && query.categoryId !== categoryId) throw invalid();
    requireSupported(query);
    const selection = { ...query, categoryId, search: undefined };
    const scope = this.#scope(selection);
    if (typeof scope === 'string') return pageOfferings([], query, scope === 'unmapped' ? 'unmapped' : 'mapped');
    const rows = (await this.#readAll('merchant_public', { select: MERCHANT_COLUMNS, ...merchantFilters(scope), order: MERCHANT_ORDER }, signal)).map(merchantRow);
    if (new Set(rows.map((row) => row.id)).size !== rows.length) throw unavailable();
    return pageOfferings(await this.#hydrate(rows, LIST_ITEMS, selection, signal), query, 'mapped');
  }

  async #readAreas(): Promise<string[]> {
    // Every listed store's area, the same stores the "all" listing shows.
    const scope = { rows: [], categories: sortedKeys(this.#visible.map((row) => row.supabase.category)) };
    const rows = await this.#readAll('merchant_public', { select: 'id,branch_address', ...merchantFilters(scope), order: 'id.asc' });
    const areas = new Set<string>();
    for (const value of rows) {
      const area = areaFromAddress(text(fields(value).branch_address));
      if (area) areas.add(area);
    }
    return [...areas].sort((left, right) => left.localeCompare(right, 'en-KE'));
  }

  /** Items for the merchants, then the bridge's shaping, then the platform's. Keeps the server's merchant order. */
  async #hydrate(rows: readonly SupabaseMerchantRow[], perMerchant: number, selection: DiscoveryQuery | undefined, signal?: AbortSignal, sections = false): Promise<Merchant[]> {
    if (!rows.length) return [];
    const media = rows.some((row) => DEMO_MERCHANT.test(row.id)) ? this.#loadMedia() : Promise.resolve(NO_MEDIA);
    const ids = rows.map((row) => row.id);
    const batches: string[][] = [];
    for (let index = 0; index < ids.length; index += ITEM_BATCH) batches.push(ids.slice(index, index + ITEM_BATCH));
    const items = (await Promise.all(batches.map((batch) => this.#itemBatch(batch, perMerchant, signal)))).flat();
    const now = this.#now();
    const bridge = new CatalogBridge(this.#rows, await media);
    bridge.replace({ merchants: [...rows], items }, now);
    const merchants = rows.map((row) => {
      const merchant = bridge.merchant(row.id);
      // The platform mapper reads featured placements from the badges, as the demo API sent them.
      const shaped = toMerchant({ ...merchant, badges: row.featured ? ['Featured'] : [], items: merchant.items.slice(0, perMerchant) }, selection);
      return closedEarly(row, now) ? { ...shaped, isOpen: false } : shaped;
    });
    if (!sections) return merchants;
    const sectionOf = new Map(items.map((item) => [item.id, item.section_id]));
    return Promise.all(merchants.map((merchant) => this.#withSections(merchant, sectionOf, signal)));
  }

  /**
   * Storefronts get the merchant's own section names when its items fall into two or more named sections,
   * in the merchant's section order. One catch-all section ("Products", "Menu", as in the demo seed) says
   * nothing about grouping, so those stores keep the keyword sections (src/data/catalogSections.ts).
   */
  async #withSections(merchant: Merchant, sectionOf: ReadonlyMap<string, string | null>, signal?: AbortSignal): Promise<Merchant> {
    const ids = [...new Set(merchant.items.flatMap((item) => { const id = sectionOf.get(item.id); return id ? [id] : []; }))];
    if (ids.length < 2) return merchant;
    let sections: Map<string, SectionRow>;
    try {
      const { rows } = await this.#read('catalogue_section', { select: 'id,merchant_id,name,sort', id: `in.(${ids.join(',')})`, limit: String(ids.length) }, false, signal);
      sections = new Map(rows.map(sectionRow).filter((row) => row.merchant_id === merchant.id && row.name).map((row) => [row.id, row]));
    } catch (error) {
      if (signal?.aborted) throw error;
      // Section names are presentation only: without them the keyword sections still group the store.
      return merchant;
    }
    if (new Set([...sections.values()].map((section) => section.name)).size < 2) return merchant;
    const placed = merchant.items.map((item, index) => ({ item, index, section: sections.get(sectionOf.get(item.id) ?? '') }));
    placed.sort((left, right) => Number(!left.section) - Number(!right.section)
      || (left.section?.sort ?? 0) - (right.section?.sort ?? 0)
      || (left.section?.id ?? '').localeCompare(right.section?.id ?? '')
      || left.index - right.index);
    return { ...merchant, items: placed.map(({ item, section }) => (section ? { ...item, section: section.name } : item)) };
  }

  /** One read per batch. If the reply was cut short, the merchants past the cut are read one at a time. */
  async #itemBatch(ids: readonly string[], perMerchant: number, signal?: AbortSignal): Promise<SupabaseItemRow[]> {
    // A full page, capped per store afterwards: asking for perMerchant × stores would cut the reply short whenever one
    // store has more items than the cap, and the fallback would then re-read stores one at a time.
    const { items, total } = await this.#readItems(ids, ids.length === 1 ? perMerchant : PAGE_ROWS, signal);
    if (ids.length === 1 || items.length >= total) return items;
    // Replies are ordered by merchant UUID, so every merchant before the last one in the reply is complete.
    const last = items.at(-1)?.merchant_id;
    const received = new Map<string, number>();
    for (const item of items) received.set(item.merchant_id, (received.get(item.merchant_id) ?? 0) + 1);
    const pending = ids.filter((id) => last === undefined || id > last || (id === last && (received.get(id) ?? 0) < perMerchant));
    const kept = items.filter((item) => !pending.includes(item.merchant_id));
    // All at once: sequential waves cost a round trip (and a CORS pre-flight) each.
    const rest = await Promise.all(pending.map((id) => this.#readItems([id], perMerchant, signal)));
    return [...kept, ...rest.flatMap((read) => read.items)];
  }

  async #readItems(ids: readonly string[], limit: number, signal?: AbortSignal): Promise<{ items: SupabaseItemRow[]; total: number }> {
    const { rows, total } = await this.#read('catalogue_public', {
      select: ITEM_COLUMNS, merchant_id: ids.length === 1 ? `eq.${ids[0]}` : `in.(${ids.join(',')})`,
      order: 'merchant_id.asc,sort.asc.nullsfirst,id.asc', limit: String(limit),
    }, true, signal);
    const wanted = new Set(ids);
    const items = rows.map(itemRow);
    if (total === undefined || items.some((item) => !wanted.has(item.merchant_id)) || new Set(items.map((item) => item.id)).size !== items.length) throw unavailable();
    return { items, total };
  }

  /** Every row of a filtered view, a page at a time, following the count rather than the page size (servers may cap replies lower). */
  async #readAll(view: 'merchant_public', params: Record<string, string>, signal?: AbortSignal): Promise<unknown[]> {
    const rows: unknown[] = [];
    for (let page = 0; page < 100; page += 1) {
      const read = await this.#read(view, { ...params, limit: String(PAGE_ROWS), offset: String(rows.length) }, true, signal);
      if (read.total === undefined || read.total > MAX_INVENTORY) throw unavailable();
      rows.push(...read.rows);
      if (rows.length >= read.total) return rows;
      if (!read.rows.length) throw unavailable();
    }
    throw unavailable();
  }

  #loadMedia(): Promise<DemoMedia> {
    const source = this.#mediaSource;
    if (!source) return Promise.resolve(NO_MEDIA);
    // Photos are presentation only: a failed load shows placeholders, and the next read tries again.
    return this.#media ??= source().catch(() => { this.#media = undefined; return NO_MEDIA; });
  }

  async #read(view: 'merchant_public' | 'catalogue_public' | 'catalogue_section', params: Record<string, string>, count: boolean, signal?: AbortSignal): Promise<{ rows: unknown[]; total?: number }> {
    if (signal?.aborted) throw signal.reason;
    const url = new URL(view, this.#rest);
    url.search = new URLSearchParams(params).toString();
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      // Only the public key, as the apikey header: a bearer header would break publishable (non-JWT) keys.
      const response = await this.#fetch(url.href, {
        method: 'GET', headers: { apikey: this.#key, Accept: 'application/json', ...(count ? { Prefer: 'count=exact' } : {}) },
        redirect: 'error', credentials: 'omit', signal: controller.signal,
      });
      const total = count ? countFrom(response.headers.get('Content-Range')) : undefined;
      // PostgREST answers 416 for an offset past the end; that is an empty page.
      if (response.status === 416 && total !== undefined) { await response.body?.cancel().catch(() => {}); return { rows: [], total }; }
      if (!response.ok || (count && total === undefined)) { await response.body?.cancel().catch(() => {}); throw unavailable(); }
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw unavailable();
      return total === undefined ? { rows } : { rows, total };
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      throw error instanceof ProviderReadError ? error : unavailable();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}
