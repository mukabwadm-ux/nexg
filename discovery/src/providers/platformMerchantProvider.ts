import { categories, findCategory, findSubcategory } from '../data/taxonomy';
import { collectionDefinitions } from '../data/discoveryConfiguration';
import type { CatalogItem, CatalogModifierGroup, CatalogModifierOption, CollectionResult, DiscoveryProvider, DiscoveryQuery, Merchant, MerchantResult, OfferingResult } from './DiscoveryProvider';

type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid catalog response');
  return value as JsonRecord;
}
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;
const finiteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function toModifierGroups(value: unknown): CatalogModifierGroup[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const groups: CatalogModifierGroup[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const group = entry as JsonRecord;
    const id = text(group.id);
    const name = text(group.name);
    const minSelections = finiteNumber(group.minSelections);
    const maxSelections = finiteNumber(group.maxSelections);
    if (!id || !name || typeof group.required !== 'boolean'
      || !Number.isInteger(minSelections) || !Number.isInteger(maxSelections)
      || minSelections! < 0 || maxSelections! < minSelections!) continue;
    if (!Array.isArray(group.options)) continue;
    const options: CatalogModifierOption[] = [];
    for (const optionEntry of group.options) {
      if (!optionEntry || typeof optionEntry !== 'object' || Array.isArray(optionEntry)) continue;
      const option = optionEntry as JsonRecord;
      const optionId = text(option.id);
      const optionName = text(option.name);
      const priceDelta = finiteNumber(option.priceDelta);
      const currency = text(option.currency);
      if (!optionId || !optionName || priceDelta === undefined || priceDelta < 0 || !currency) continue;
      options.push({
        id: optionId,
        name: optionName,
        description: text(option.description),
        image: text(option.image),
        priceDelta,
        currency,
        isAvailable: typeof option.isAvailable === 'boolean' ? option.isAvailable : undefined,
      });
    }
    if (maxSelections! > options.length || minSelections! > options.length || !options.length) continue;
    groups.push({ id, name, required: group.required, minSelections: minSelections!, maxSelections: maxSelections!, options });
  }
  return groups.length ? groups : undefined;
}

/** Demo-API-shaped JSON to the screen shape. The Supabase provider shapes its rows the same way. */
export function toMerchant(value: unknown, selection?: DiscoveryQuery): Merchant {
  const source = record(value);
  const id = text(source.id);
  const name = text(source.name);
  if (!id || !name || !Array.isArray(source.items)) throw new Error('Invalid merchant identity');
  const categoryId = text(source.categoryId);
  const subcategoryId = text(source.subcategoryId);
  const category = findCategory(selection?.categoryId) ?? categories.find((entry) => categoryId && entry.sourceIds.includes(categoryId));
  const subcategory = findSubcategory(selection?.categoryId, selection?.subcategoryId) ?? category?.subcategories.find((entry) => subcategoryId && entry.sourceIds.includes(subcategoryId));
  const items: CatalogItem[] = source.items.map((value) => {
    const item = record(value);
    const itemId = text(item.id);
    const merchantId = text(item.merchantId);
    const itemName = text(item.name);
    if (!itemId || merchantId !== id || !itemName) throw new Error('Catalog item identity mismatch');
    return {
      id: itemId,
      merchantId,
      merchantName: name,
      name: itemName,
      description: text(item.description),
      // The platform mapper uses zero for missing/invalid prices; provenance cannot distinguish free items.
      price: typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0 ? item.price : undefined,
      currency: text(item.currency),
      image: text(item.image),
      modifierGroups: toModifierGroups(item.modifierGroups),
      // The current source mapper defaults commerce mode and availability. They cannot enable a transaction.
      isAvailable: item.isAvailable === false ? false : undefined,
    };
  });
  return {
    id, name, slug: text(source.slug), categoryId, subcategoryId,
    category: category?.label,
    subcategory: subcategory?.label,
    isFeatured: Array.isArray(source.badges) && source.badges.includes('Featured'),
    rating: finiteNumber(source.rating),
    ratingCount: finiteNumber(source.ratingCount),
    deliveryTimeMin: finiteNumber(source.deliveryTimeMin),
    deliveryTimeMax: finiteNumber(source.deliveryTimeMax),
    priceLevel: finiteNumber(source.priceLevel),
    isOpen: typeof source.isOpen === 'boolean' ? source.isOpen : undefined,
    latitude: finiteNumber(source.latitude),
    longitude: finiteNumber(source.longitude),
    area: text(source.nairobiArea),
    address: text(source.address),
    workflow: text(source.workflow),
    heroImage: text(source.heroImage),
    logoUrl: text(source.logoUrl),
    items,
  };
}

async function readJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(new Error('Catalog request timed out')), 12_000);
  try {
    const response = await fetch(path, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Catalog unavailable (${response.status})`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

/** Read the full bounded group before union/ranking so filters, total and pages agree. */
async function readGroup(params: Record<string, string>, selection: DiscoveryQuery, signal?: AbortSignal): Promise<Merchant[]> {
  const merchants: Merchant[] = [];
  let offset = 0;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ ...params, sort: selection.sort ?? 'recommended', limit: '200', offset: String(offset) });
    const result = record(await readJson(`/api/merchants?${query}`, signal));
    if (!Array.isArray(result.merchants) || typeof result.total !== 'number' || !Number.isInteger(result.total) || result.total < 0) throw new Error('Invalid catalog page');
    const rows = result.merchants.map((value) => toMerchant(value, selection));
    merchants.push(...rows);
    offset += rows.length;
    if (offset >= result.total) return merchants;
    if (!rows.length) throw new Error('Incomplete catalog page');
  }
  throw new Error('Catalog exceeds the V1 adapter limit');
}

/** Shared complete inventory for merchant and offering pagination. */
async function getMerchantInventory(selection: DiscoveryQuery, signal?: AbortSignal): Promise<Pick<MerchantResult, 'merchants' | 'mapping'>> {
  const category = findCategory(selection.categoryId);
  const subcategory = findSubcategory(selection.categoryId, selection.subcategoryId);
  if (selection.categoryId && !category) throw new Error('Unknown discovery category');
  if (selection.subcategoryId && !subcategory) throw new Error('Unknown discovery subcategory');
  const option = subcategory?.options.find((entry) => entry.id === selection.optionId);
  if (selection.optionId && !option) throw new Error('Unknown category option');
  const sourceIds = option?.sourceIds ?? subcategory?.sourceIds;
  if (sourceIds && !sourceIds.length) return { merchants: [], mapping: 'unmapped' };
  const shared: Record<string, string> = {};
  if (selection.search?.trim()) shared.search = selection.search.trim();
  if (selection.area) shared.area = selection.area;
  const groups: Record<string, string>[] = sourceIds
    ? sourceIds.map((id) => ({ ...shared, subcategory: id }))
    : [{ ...shared, discoveryCategory: category?.id ?? 'all' }];
  const sourceGroups = await Promise.all(groups.map((group) => readGroup(group, selection, signal)));
  const unique = new Map<string, Merchant>();
  for (const merchant of sourceGroups.flat()) if (!unique.has(merchant.id)) unique.set(merchant.id, merchant);
  const eligible = [...unique.values()].filter((merchant) => !selection.openNow || merchant.isOpen === true);
  const sort = selection.sort ?? 'recommended';
  const nameOrder = (left: Merchant, right: Merchant) => left.name.localeCompare(right.name, 'en-KE', { sensitivity: 'base' }) || left.id.localeCompare(right.id);
  const descending = (left?: number, right?: number) => (right ?? Number.NEGATIVE_INFINITY) - (left ?? Number.NEGATIVE_INFINITY);
  const ascending = (left?: number, right?: number) => (left ?? Number.POSITIVE_INFINITY) - (right ?? Number.POSITIVE_INFINITY);
  const bySourceSort = [...eligible];
  const sorted = sourceGroups.length === 1 ? bySourceSort : bySourceSort.sort((left, right) => {
    switch (sort) {
      case 'rating': return descending(left.rating, right.rating) || descending(left.ratingCount, right.ratingCount) || nameOrder(left, right);
      case 'delivery': return ascending(left.deliveryTimeMin, right.deliveryTimeMin) || descending(left.rating, right.rating) || nameOrder(left, right);
      case 'price_low': return ascending(left.priceLevel, right.priceLevel) || descending(left.rating, right.rating) || nameOrder(left, right);
      case 'price_high': return descending(left.priceLevel, right.priceLevel) || descending(left.rating, right.rating) || nameOrder(left, right);
      case 'recommended':
      default: return Number(right.isFeatured === true) - Number(left.isFeatured === true) || descending(left.rating, right.rating) || nameOrder(left, right);
    }
  });
  return { merchants: sorted, mapping: 'mapped' };
}

async function getMerchants(selection: DiscoveryQuery, signal?: AbortSignal): Promise<MerchantResult & { total: number; hasMore: boolean }> {
  const inventory = await getMerchantInventory(selection, signal);
  const offset = Math.max(0, selection.offset ?? 0);
  const limit = Math.min(48, Math.max(1, selection.limit ?? 24));
  return { merchants: inventory.merchants.slice(offset, offset + limit), total: inventory.merchants.length, offset, hasMore: offset + limit < inventory.merchants.length, mapping: inventory.mapping };
}

/** One page of offerings from a complete scoped inventory. Shared with the Supabase provider. */
export function pageOfferings(merchants: Merchant[], selection: DiscoveryQuery, mapping: 'mapped' | 'unmapped'): OfferingResult & { total: number; hasMore: boolean } {
  const search = selection.search?.trim().toLocaleLowerCase('en-KE');
  // Keep the API's host ranking and show one offering per host before returning to the next item.
  // Item prices do not imply a supported item-level price or availability sort.
  const offerings = merchants.flatMap((merchant) => merchant.items
    .filter((item) => item.merchantId === merchant.id && (!search || item.name.toLocaleLowerCase('en-KE').includes(search) || merchant.name.toLocaleLowerCase('en-KE').includes(search)))
    .map((item, index) => ({ merchant, item, index })))
    .sort((left, right) => left.index - right.index)
    .map(({ merchant, item }) => ({ merchant, item }));
  const offset = Math.max(0, selection.offset ?? 0);
  const limit = Math.min(48, Math.max(1, selection.limit ?? 24));
  return { offerings: offerings.slice(offset, offset + limit), total: offerings.length, offset, hasMore: offset + limit < offerings.length, mapping };
}

async function getScopedOfferings(categoryId: 'experiences' | 'travel-tours', selection: DiscoveryQuery, signal?: AbortSignal): Promise<OfferingResult> {
  if (selection.categoryId && selection.categoryId !== categoryId) throw new Error('Unknown offering category');
  // The source endpoint searches merchant names, so offering search needs the full scoped inventory.
  const inventory = await getMerchantInventory({ ...selection, categoryId, search: undefined }, signal);
  return pageOfferings(inventory.merchants, selection, inventory.mapping);
}

const getExperienceOfferings = (selection: DiscoveryQuery, signal?: AbortSignal) => getScopedOfferings('experiences', selection, signal);
const getTourOfferings = (selection: DiscoveryQuery, signal?: AbortSignal) => getScopedOfferings('travel-tours', selection, signal);

/** L2 collections from the configured subcategory groups. Shared with the Supabase provider. */
export async function readCollections(
  read: (query: DiscoveryQuery, signal?: AbortSignal) => Promise<MerchantResult & { total: number }>,
  categoryId: string, query: Pick<DiscoveryQuery, 'area' | 'search' | 'sort' | 'openNow'> = {}, signal?: AbortSignal,
): Promise<CollectionResult> {
  const definitions = collectionDefinitions(categoryId);
  const results = await Promise.allSettled(definitions.map(async (definition) => {
    const result = await read({ ...query, categoryId, subcategoryId: definition.subcategoryId, limit: definition.maximumMerchants }, signal);
    if (result.total < definition.minimumDistinctMerchants) return undefined;
    return { id: definition.id, title: definition.title, subcategoryId: definition.subcategoryId, merchants: result.merchants };
  }));
  if (signal?.aborted) throw signal.reason;
  if (results.length && results.every((result) => result.status === 'rejected')) throw new Error('Category catalog unavailable');
  const signatures = new Set<string>();
  const collections = results.flatMap((result) => {
    if (result.status !== 'fulfilled' || !result.value) return [];
    const signature = result.value.merchants.map((merchant) => merchant.id).sort().join('|');
    if (signatures.has(signature)) return [];
    signatures.add(signature);
    return [result.value];
  });
  if (categoryId !== 'restaurants-food' && categoryId !== 'travel-tours') collections.splice(4);
  return { collections, partial: results.some((result) => result.status === 'rejected') };
}

const getCollections = (categoryId: string, query: Pick<DiscoveryQuery, 'area' | 'search' | 'sort' | 'openNow'> = {}, signal?: AbortSignal) => readCollections(getMerchants, categoryId, query, signal);

export const platformMerchantProvider: DiscoveryProvider = {
  version: 'discovery-provider/v1',
  capabilities: { availabilityFilter: true, nearestSort: false, priceRangeFilter: false, transactions: false },
  getMerchants,
  getExperienceOfferings,
  getTourOfferings,
  getCollections,
  async getMerchant(id, signal) { return toMerchant(await readJson(`/api/merchants/${encodeURIComponent(id)}`, signal)); },
  async getAreas(signal) {
    const result = record(await readJson('/api/areas', signal));
    if (!Array.isArray(result.areas) || result.areas.some((area) => typeof area !== 'string')) throw new Error('Invalid catalog areas');
    return result.areas as string[];
  },
};
