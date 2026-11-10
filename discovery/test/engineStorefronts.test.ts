import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineDiscoveryProvider } from '../src/providers/engineProvider';
import { EngineTransport, type BrowserFetch } from '../src/providers/engineTransport';
import type { DiscoveryQuery, EngineSchemas, Merchant } from '../src/providers/DiscoveryProvider';
import { findCategory, findSubcategory } from '../src/data/taxonomy';
import { isGroceryStore, isRetailStore, isSupermarket } from '../src/data/supermarketPresentation';
import { isAppointmentProvider } from '../src/data/massagePresentation';
import { isTourOperator, tourLabel } from '../src/data/tourPresentation';
import { isDirectExperienceMerchant } from '../src/data/experiencePresentation';
import { subcategoryOf } from '../src/data/offeringKinds';

// Isolated protocol controls (9 Nov 2026): engine stores placed by the release's taxonomy paths. Never served as inventory.
const versions = { discoveryRelease: 'release-control', taxonomy: 't', layout: 'l', mapping: 'm', policy: 'p', ranker: 'rank-control', sourceSnapshots: [] };
const context: EngineSchemas['ReleaseContext'] = { contractVersion: '1', discoveryReleaseId: 'release-control', versions, collections: [] };
const query: DiscoveryQuery = { categoryId: 'category-control', sort: 'recommended', limit: 24 };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function store(id: string, path?: EngineSchemas['TaxonomyPath'], extra: Partial<EngineSchemas['PublicMerchant']> = {}): EngineSchemas['PublicMerchant'] {
  return { ref: { kind: 'merchant', ownerId: 'source-control', id, merchantId: id }, name: `Protocol ${id}`, ...(path ? { taxonomyPaths: [path] } : {}), ...extra,
    items: [], itemsCount: { kind: 'unknown' }, itemsCompletion: 'unknown' };
}
const stores = [
  store('cafe', { categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:caf' }, { location: { latitude: -1.2921, longitude: 36.7856 } }),
  store('makeup', { categoryId: 'beauty-wellness', subcategoryId: 'beauty-wellness:beauty-products', optionId: 'beauty-wellness:beauty-products:makeup' }),
  store('grocer', { categoryId: 'groceries-essentials', subcategoryId: 'groceries-essentials:supermarket' }),
  store('butcher', { categoryId: 'groceries-essentials', subcategoryId: 'groceries-essentials:butchery' }),
  store('massage', { categoryId: 'beauty-wellness', subcategoryId: 'beauty-wellness:massage' }),
  store('safari', { categoryId: 'travel-tours', subcategoryId: 'travel-tours:safaris' }),
  store('workshop', { categoryId: 'experiences', subcategoryId: 'experiences:workshops-classes' }),
  store('unplaced'),
];

async function engineStores(): Promise<Map<string, Merchant>> {
  const fetcher: BrowserFetch = async (input, init) => {
    if (String(input).endsWith('/release')) return json(context);
    const request = JSON.parse(String(init?.body)) as EngineSchemas['EngineRequest'];
    return json({ contractVersion: '1', requestId: request.requestId, refs: stores.map(row => row.ref), presentations: { merchants: stores, offerings: [] },
      count: { kind: 'lower_bound', value: stores.length },
      retrieval: { scope: 'bounded_candidates', windowId: 'window-control', candidateCount: stores.length, completion: 'window_exhausted' },
      versions, applied: { selection: request.selection, filterHash: 'hash-control', sort: request.sort, constraints: [] }, status: 'ok' });
  };
  const result = await new EngineDiscoveryProvider(new EngineTransport(fetcher), () => 0, () => 'request-control').getMerchants(query);
  return new Map(result.merchants.map(merchant => [merchant.id, merchant]));
}

test('engine stores carry their Discovery place, its names and their coordinates', async () => {
  const byId = await engineStores();
  const cafe = byId.get('cafe')!;
  assert.deepEqual({ categoryId: cafe.categoryId, category: cafe.category, subcategoryId: cafe.subcategoryId, subcategory: cafe.subcategory, latitude: cafe.latitude, longitude: cafe.longitude },
    { categoryId: 'restaurants-food', category: findCategory('restaurants-food')!.label, subcategoryId: 'restaurants-food:caf', subcategory: 'Café', latitude: -1.2921, longitude: 36.7856 });
  // A nested option names the store more precisely than its subcategory does.
  const makeup = findSubcategory('beauty-wellness', 'beauty-wellness:beauty-products')!.options.find(option => option.id === 'beauty-wellness:beauty-products:makeup')!;
  assert.equal(byId.get('makeup')!.subcategory, makeup.label);
  assert.equal(byId.get('makeup')!.subcategoryId, 'beauty-wellness:beauty-products');
  // An unknown place and missing coordinates stay unset, never guessed.
  const unplaced = byId.get('unplaced')!;
  for (const key of ['categoryId', 'category', 'subcategoryId', 'subcategory', 'latitude', 'longitude'] as const) assert.equal(unplaced[key], undefined, key);
  assert.equal(byId.get('grocer')!.latitude, undefined);
});

test('Discovery IDs open the same storefronts as the source groups they stand for', async () => {
  const byId = await engineStores();
  const get = (id: string) => byId.get(id)!;
  assert.equal(subcategoryOf(get('cafe'))?.subcategory.id, 'restaurants-food:caf');
  assert.equal(isRetailStore(get('grocer')), true);
  assert.equal(isSupermarket(get('grocer')), true);
  assert.equal(isGroceryStore(get('butcher')), true);
  assert.equal(isSupermarket(get('butcher')), false);
  assert.equal(isAppointmentProvider(get('massage')), true);
  assert.equal(isDirectExperienceMerchant(get('workshop')), true);
  assert.equal(tourLabel(get('safari')), findSubcategory('travel-tours', 'travel-tours:safaris')!.label);
  for (const id of ['cafe', 'grocer', 'massage', 'safari', 'workshop', 'unplaced']) assert.equal(isTourOperator(get(id)), id === 'safari', id);
  for (const id of ['cafe', 'massage', 'safari', 'workshop', 'unplaced']) assert.equal(isRetailStore(get(id)), false, id);
  // Source groups, as the Supabase and platform providers send them, still work exactly as before.
  const withSource = (subcategoryId: string): Merchant => ({ ...get('unplaced'), subcategoryId });
  assert.equal(isSupermarket(withSource(findSubcategory('groceries-essentials', 'groceries-essentials:supermarket')!.sourceIds[0]!)), true);
  assert.equal(isTourOperator(withSource(findSubcategory('travel-tours', 'travel-tours:safaris')!.sourceIds[0]!)), true);
  assert.equal(isDirectExperienceMerchant(withSource(findSubcategory('experiences', 'experiences:workshops-classes')!.sourceIds[0]!)), true);
});
