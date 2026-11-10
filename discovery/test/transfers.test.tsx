import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CatalogItem, DiscoveryProvider, DiscoveryQuery, Merchant, MerchantResult } from '../src/providers/DiscoveryProvider';
import { shortDate } from '../src/lib/calendar';
import { findCategory } from '../src/data/taxonomy';
import { emptyTransferTrip, transferReady } from '../src/components/cards/RentalTripPanel';
import {
  AIRPORTS, classCounts, cleanTransferForm, fareNote, itemAirport, itemDirection, listedFare, lowestFarePerClass, meetGreetListings,
  meetGreetSummary, partyPhrase, partySummary, placeSuggestions, readTransferOperators, rideSummary, routeLabel, transferClass, transferErrors,
  transferForm, transferRequestSummary, transferVehicles, tripFromForm, vehicleKey, vehicleOperatorCount, type TransferForm,
} from '../src/data/transferPresentation';
import { TransferTripForm } from '../src/components/transfers/TransferTripForm';
import { TransferSearch } from '../src/components/transfers/TransferSearch';
import { CategoryDiscovery } from '../src/components/CategoryDiscovery';

// Isolated presentation controls, never catalogue data. Identities are UUID-shaped, as Supabase's are.
const noop = () => {};
const operator = (n: number, name: string, subcategoryId: string, items: [string, Partial<CatalogItem>?][]): Merchant => {
  const id = `c0000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
  return { id, name, subcategoryId, area: 'Westlands', items: items.map(([itemName, extra], index) => ({
    id: `f0000000-0000-4000-8000-0000000${String(n).padStart(2, '0')}${String(index).padStart(3, '0')}`, merchantId: id, name: itemName, currency: 'KES', ...extra,
  })) };
};
const kes = (price: number) => ({ price, currency: 'KES' });
const pickups = operator(1, 'Control Pickups', 'airport-transfers_airport-pickup', [
  ['JKIA Sedan Pickup', kes(4200)], ['Executive SUV Pickup', kes(5400)], ['Family Van Pickup', kes(7200)], ['Wilson Airport Pickup', kes(3000)],
  ['Early-Morning Pickup', kes(3500)], ['Business Pickup', kes(6100)], ['JKIA Sedan Drop-off', kes(3900)], ['Signature JKIA Sedan Pickup', { ...kes(1000), isAvailable: false }],
]);
const dropoffs = operator(2, 'Control Drop-offs', 'airport-transfers_airport-drop-off', [['JKIA Sedan Drop-off', kes(3800)], ['Executive Sedan', kes(4100)]]);
const greeters = operator(3, 'Control Greeters', 'airport-transfers_meet-greet', [['Standard Meet & Greet', kes(2500)], ['Terminal Escort', kes(1800)]]);
const executive = operator(4, 'Control Executive', 'airport-transfers_executive-transfer', [
  ['Executive Sedan', kes(3900)], ['Premium 4x4', kes(5400)], ['Full-Day Chauffeur', kes(9000)], ['Business Van', { price: 120, currency: 'USD' }],
  ['VIP City Transfer Bundle', { price: undefined }],
]);
const operators = [pickups, dropoffs, greeters, executive];
const item = (merchant: Merchant, name: string) => merchant.items.find((entry) => entry.name === name)!;
const key = (merchant: Merchant, name: string) => vehicleKey({ merchant, item: item(merchant, name) });

test('vehicle classes come from the transfers scheme, and services are never cars', () => {
  const classOf = (merchant: Merchant, name: string, extra: Partial<CatalogItem> = {}) => transferClass(merchant, { name, ...extra });
  assert.deepEqual(['JKIA Sedan Pickup', 'Executive SUV Pickup', 'Family Van Pickup', 'Business Pickup', 'Wilson Airport Pickup', 'Signature Premium 4x4']
    .map((name) => classOf(pickups, name)?.id), ['sedans', 'suvs', 'vans', 'business', 'standard', 'suvs']);
  assert.equal(classOf(pickups, 'JKIA Sedan Pickup')?.kind, 'vehicle');
  assert.equal(classOf(pickups, 'Executive SUV Pickup')?.title, 'SUVs & 4x4s');
  for (const [name, id] of [['Early-Morning Pickup', 'early-late'], ['Standard Meet & Greet', 'meet-greet'], ['Terminal Escort', 'meet-greet'],
    ['Full-Day Chauffeur', 'chauffeur'], ['Corporate Airport Run', 'chauffeur']] as const) {
    assert.deepEqual([classOf(executive, name)?.id, classOf(executive, name)?.kind], [id, 'service'], name);
  }
  // Nothing the vocabulary doesn't class is shown as a vehicle by guesswork.
  assert.equal(classOf(executive, 'Toyota Noah'), undefined);
  assert.equal(classOf(executive, 'Airport Bundle'), undefined);
  assert.equal(transferClass({ subcategoryId: 'restaurants-food_restaurant' }, { name: 'Sedan Pickup' }), undefined);
  // The owner's precedence: the merchant's own section, then the engine's, then the name. A catch-all section says nothing.
  assert.equal(classOf(pickups, 'Family Van Pickup', { section: 'Sedans' })?.id, 'sedans');
  assert.equal(classOf(pickups, 'Executive SUV Pickup', { section: 'Airport transfers' })?.id, 'suvs');
  assert.equal(classOf(pickups, 'Business Pickup', { sectionId: 'transfers:vans' })?.id, 'vans');
  assert.equal(classOf(pickups, 'Business Pickup', { sectionId: 'groceries:produce' })?.id, 'business');
});

test('a listing runs the way its name says, else its operator’s subcategory, and names its airport', () => {
  assert.equal(itemDirection(pickups, { name: 'JKIA Sedan Pickup' }), 'pickup');
  assert.equal(itemDirection(pickups, { name: 'JKIA Sedan Drop-off' }), 'dropoff');
  assert.equal(itemDirection(pickups, { name: 'Executive Sedan' }), 'pickup');
  assert.equal(itemDirection(dropoffs, { name: 'Executive Sedan' }), 'dropoff');
  assert.equal(itemDirection(executive, { name: 'Executive Sedan' }), undefined);
  assert.equal(itemDirection(executive, { name: 'Sedan pickup and drop-off' }), undefined);
  assert.equal(itemAirport({ name: 'Signature JKIA SUV Pickup' }), 'jkia');
  assert.equal(itemAirport({ name: 'Wilson Airport Pickup' }), 'wilson');
  assert.equal(itemAirport({ name: 'Executive Sedan' }), undefined);
  assert.equal(listedFare({ price: 3800, currency: 'KES' }), 3800);
  assert.equal(listedFare({ price: 120, currency: 'USD' }), undefined);
  assert.equal(listedFare({ price: 0, currency: 'KES' }), undefined);
});

test('matching vehicles cross every operator, fit the direction and airport, and come lowest listed fare first', () => {
  const pickupJkia = transferVehicles(operators, { direction: 'pickup', airport: 'jkia' });
  assert.deepEqual(pickupJkia.map(vehicleKey), [
    key(executive, 'Executive Sedan'), key(pickups, 'JKIA Sedan Pickup'), key(executive, 'Premium 4x4'), key(pickups, 'Executive SUV Pickup'),
    key(pickups, 'Business Pickup'), key(pickups, 'Family Van Pickup'), key(executive, 'Business Van'), key(executive, 'VIP City Transfer Bundle'),
  ]);
  // Services, drop-offs, another airport and unavailable listings stay out.
  const names = pickupJkia.map((vehicle) => vehicle.item.name);
  for (const name of ['Early-Morning Pickup', 'Standard Meet & Greet', 'Full-Day Chauffeur', 'JKIA Sedan Drop-off', 'Wilson Airport Pickup', 'Signature JKIA Sedan Pickup']) assert.ok(!names.includes(name), name);

  const pickupWilson = transferVehicles(operators, { direction: 'pickup', airport: 'wilson' }).map((vehicle) => vehicle.item.name);
  assert.ok(pickupWilson.includes('Wilson Airport Pickup'));
  assert.ok(!pickupWilson.includes('JKIA Sedan Pickup'));

  const dropoffJkia = transferVehicles(operators, { direction: 'dropoff', airport: 'jkia' });
  assert.deepEqual(dropoffJkia.slice(0, 4).map(vehicleKey), [key(dropoffs, 'JKIA Sedan Drop-off'), key(executive, 'Executive Sedan'), key(pickups, 'JKIA Sedan Drop-off'), key(dropoffs, 'Executive Sedan')]);
  assert.ok(!dropoffJkia.some((vehicle) => vehicle.merchant.id === pickups.id && vehicle.item.name.endsWith('Pickup')));
  // Paging overlap never repeats a vehicle.
  assert.equal(transferVehicles([...operators, pickups], { direction: 'pickup', airport: 'jkia' }).length, pickupJkia.length);
  assert.equal(vehicleOperatorCount(operators), 3);
});

test('"recommended" is honestly the lowest listed fare in each vehicle class', () => {
  const vehicles = transferVehicles(operators, { direction: 'pickup', airport: 'jkia' });
  const lowest = lowestFarePerClass(vehicles);
  // Class order from the scheme; a tie goes to the operator first by name; foreign and missing prices never compete.
  assert.deepEqual(lowest.map((vehicle) => [vehicle.vehicleClass.id, vehicle.item.name, vehicle.merchant.name]), [
    ['sedans', 'Executive Sedan', 'Control Executive'], ['suvs', 'Premium 4x4', 'Control Executive'],
    ['vans', 'Family Van Pickup', 'Control Pickups'], ['business', 'Business Pickup', 'Control Pickups'],
  ]);
  assert.deepEqual(classCounts(vehicles), [
    { id: 'sedans', title: 'Sedans', count: 2 }, { id: 'suvs', title: 'SUVs & 4x4s', count: 2 },
    { id: 'vans', title: 'Vans & minibuses', count: 2 }, { id: 'business', title: 'Business & VIP', count: 2 },
  ]);
  assert.equal(lowestFarePerClass(transferVehicles(operators, { direction: 'pickup', airport: 'wilson' })).at(-1)?.item.name, 'Wilson Airport Pickup');
  assert.deepEqual(lowestFarePerClass([]), []);
});

test('meet & greet says who lists it, and otherwise that the operator confirms it', () => {
  const listings = meetGreetListings(operators);
  assert.deepEqual(listings.map((listing) => [listing.merchant.name, listing.services.length]), [['Control Greeters', 2]]);
  const vehicles = transferVehicles(operators, { direction: 'pickup', airport: 'jkia' });
  const none = meetGreetSummary(listings, vehicles);
  assert.equal(none.text, 'None of the operators with matching vehicles list meet & greet, so the operator you choose confirms it.');
  assert.deepEqual(none.separate.map((merchant) => merchant.name), ['Control Greeters']);
  const assisting = { ...pickups, items: [...pickups.items, { id: 'f0000000-0000-4000-8000-000000001999', merchantId: pickups.id, name: 'Arrival Assist', ...kes(1500) }] };
  const withVehicles = meetGreetSummary(meetGreetListings([assisting, greeters]), transferVehicles([assisting], { direction: 'pickup', airport: 'jkia' }));
  assert.equal(withVehicles.text, 'Control Pickups lists meet & greet alongside its vehicles. For any other vehicle, the operator confirms it.');
});

const filled = (change: Partial<TransferForm> = {}): TransferForm => ({ ...transferForm(emptyTransferTrip()), place: 'Westlands, Nairobi', date: '2026-11-18', time: '14:30', travellers: 2, bags: 2, meetGreet: true, ...change });
const now = { today: '2026-11-09', time: '10:00' };

test('the trip form starts from the shared ride, swaps sides with the direction, and validates field by field', () => {
  const start = transferForm(emptyTransferTrip());
  assert.deepEqual([start.direction, start.airport, start.place, start.date, start.time, start.travellers, start.bags, start.meetGreet], ['pickup', 'jkia', '', undefined, '', 1, 0, false]);
  assert.deepEqual(tripFromForm(filled()), { pickup: AIRPORTS[0]!.name, dropoff: 'Westlands, Nairobi', date: '2026-11-18', time: '14:30', travellers: 2, bags: 2, meetGreet: true });
  const dropoff = tripFromForm(filled({ direction: 'dropoff', airport: 'wilson' }));
  assert.deepEqual([dropoff.pickup, dropoff.dropoff, dropoff.meetGreet], ['Westlands, Nairobi', 'Wilson Airport', false]);
  assert.equal(tripFromForm(filled({ airport: 'other', otherAirport: '  Moi International Airport ' })).pickup, 'Moi International Airport');
  assert.equal(transferForm(tripFromForm(filled({ direction: 'dropoff' })), 'dropoff').airport, 'jkia');

  assert.deepEqual(transferErrors(start, now), { place: 'Add the drop-off place.', date: 'Choose the pickup date.', time: 'Choose the pickup time.' });
  assert.equal(transferErrors({ ...start, direction: 'dropoff' }, now).place, 'Add the pickup place.');
  assert.equal(transferErrors(filled({ airport: 'other' }), now).airport, 'Enter the airport.');
  assert.equal(transferErrors(filled({ date: '2026-11-09', time: '09:30' }), now).time, 'Choose a time later than now.');
  assert.equal(transferErrors(filled({ date: '2026-11-08' }), now).date, 'Choose today or a later date.');
  assert.deepEqual(transferErrors(filled(), now), {});
  assert.equal(transferReady(tripFromForm(filled())), true);
  assert.equal(transferReady(tripFromForm(start)), false);
});

test('a stored trip is read defensively', () => {
  assert.equal(cleanTransferForm('nonsense', now.today), undefined);
  assert.equal(cleanTransferForm(null, now.today), undefined);
  const form = cleanTransferForm({ direction: 'dropoff', airport: 'mars', place: 'Kilimani', date: '2026-11-01', time: '7pm', travellers: 99, bags: -3, meetGreet: true }, now.today)!;
  assert.deepEqual([form.direction, form.airport, form.place, form.date, form.time, form.travellers, form.bags, form.meetGreet], ['dropoff', 'jkia', 'Kilimani', undefined, '', 20, 0, false]);
  assert.equal(cleanTransferForm({ date: '2026-11-18', time: '06:15' }, now.today)?.time, '06:15');
});

test('the place field offers areas that start with what is typed first, and not one already filled in', () => {
  const areas = ['Westlands', 'Kilimani', 'Parklands', 'Lavington', 'South C'];
  assert.deepEqual(placeSuggestions(areas, 'west'), ['Westlands']);
  assert.deepEqual(placeSuggestions(areas, 'lands'), ['Westlands', 'Parklands']);
  assert.deepEqual(placeSuggestions(areas, 'Westlands, Nairobi'), []);
  assert.deepEqual(placeSuggestions(areas, '  '), []);
  assert.deepEqual(placeSuggestions(areas, 'a', 2).length, 2);
});

test('the ride and the selected transfer are said in plain words, fares as listed and nothing sent', () => {
  const trip = tripFromForm(filled());
  assert.equal(rideSummary(trip), `JKIA → Westlands, Nairobi · ${shortDate('2026-11-18')}, 14:30 · 2 travellers · 2 bags · meet & greet`);
  assert.equal(routeLabel({ pickup: 'Kilimani, Nairobi', dropoff: '' }), 'Kilimani, Nairobi → drop-off to add');
  assert.equal(partySummary(1, 0), '1 traveller · no bags');
  assert.equal(partyPhrase(2, 1), '2 travellers and 1 bag');
  assert.equal(fareNote(trip), 'Fares are as each operator lists them. The operator confirms the final fare and that the vehicle fits 2 travellers and 2 bags.');
  const [lead] = lowestFarePerClass(transferVehicles(operators, { direction: 'pickup', airport: 'jkia' }));
  const summary = transferRequestSummary(trip, lead!);
  assert.equal(summary.vehicle, 'Executive Sedan');
  assert.equal(summary.operator, 'Control Executive');
  assert.match(summary.fare, /^KES\s3,900$/);
  assert.equal(summary.meetGreet, 'Meet & greet goes with the request. Control Executive confirms it.');
  assert.equal(summary.note, 'Saved on this device only. Nothing is sent to Control Executive yet.');
  assert.equal(transferRequestSummary(tripFromForm(filled({ meetGreet: false })), lead!).meetGreet, undefined);
});

test('operators are read a page of 48 at a time, never one request per operator', async () => {
  const calls: DiscoveryQuery[] = [];
  const all = Array.from({ length: 100 }, (_, index) => ({ ...pickups, id: `c0000000-0000-4000-8000-${String(index).padStart(12, '0')}` }));
  const exact: Pick<DiscoveryProvider, 'getMerchants'> = {
    async getMerchants(query) {
      calls.push(query);
      const offset = query.offset ?? 0;
      // One repeated merchant across pages, as a shifting catalogue can send.
      const merchants = [...all.slice(offset, offset + (query.limit ?? 24)), ...(offset ? [all[0]!] : [])];
      return { merchants, total: all.length, offset, hasMore: offset + (query.limit ?? 24) < all.length, mapping: 'mapped' } satisfies MerchantResult;
    },
  };
  const read = await readTransferOperators(exact);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((query) => [query.categoryId, query.limit, query.offset]), [['airport-transfers', 48, 0], ['airport-transfers', 48, 48], ['airport-transfers', 48, 96]]);
  assert.equal(read.merchants.length, 100);
  assert.equal(read.partial, false);

  // Engine pages carry a cursor instead of a total.
  const cursors: (string | undefined)[] = [];
  const boundedRead = await readTransferOperators({
    async getMerchants(query) {
      cursors.push(query.cursor);
      return { semantics: 'bounded/v2', merchants: query.cursor ? [dropoffs] : [pickups], nextCursor: query.cursor ? undefined : 'next' } as unknown as MerchantResult;
    },
  });
  assert.deepEqual(cursors, [undefined, 'next']);
  assert.equal(boundedRead.partial, false);
  assert.deepEqual(boundedRead.merchants.map((merchant) => merchant.name), ['Control Pickups', 'Control Drop-offs']);
});

test('the trip form: pickup or drop-off, the airport on its side, meet & greet only on pickups, errors only after a try', () => {
  const render = (form: TransferForm, showErrors = false) => renderToStaticMarkup(<TransferTripForm form={form} onChange={noop} errors={transferErrors(form, now)}
    showErrors={showErrors} areas={['Westlands']} today={now.today} onSubmit={noop} onInvalid={noop} />);
  const pickup = render(transferForm(emptyTransferTrip()));
  for (const text of ['Airport pickup', 'Airport drop-off', 'Meet &amp; greet at arrivals', 'Find transfers', 'Pickup date', 'Pickup time', 'Travellers &amp; bags', 'Jomo Kenyatta (JKIA)']) assert.ok(pickup.includes(text), text);
  assert.ok(pickup.indexOf('<select') < pickup.indexOf('role="combobox"'), 'the airport is the pickup');
  assert.doesNotMatch(pickup, /transfer-field__error/);
  const dropoff = render({ ...transferForm(emptyTransferTrip()), direction: 'dropoff' });
  assert.doesNotMatch(dropoff, /Meet &amp; greet at arrivals/);
  assert.ok(dropoff.indexOf('role="combobox"') < dropoff.indexOf('<select'), 'the place is the pickup');
  const tried = render(transferForm(emptyTransferTrip()), true);
  assert.match(tried, /Add the drop-off place\./);
  assert.match(tried, /aria-invalid="true"/);
  const other = render({ ...filled(), airport: 'other' }, true);
  assert.match(other, /aria-label="Airport name"/);
  assert.match(other, /Enter the airport\./);
});

test('the airport transfers category opens trip first; its types and searches keep their own pages', () => {
  const category = findCategory('airport-transfers')!;
  const provider = {
    version: 'test', capabilities: { availabilityFilter: false, nearestSort: false, priceRangeFilter: false, transactions: false, supportedSorts: ['recommended'] },
    getAreas: async () => [], getMerchants: async () => ({ merchants: [], total: 0, offset: 0, hasMore: false, mapping: 'mapped' }),
    getCollections: async () => ({ collections: [], partial: false }),
  } as unknown as DiscoveryProvider;
  const page = (query: DiscoveryQuery) => renderToStaticMarkup(<CategoryDiscovery category={category} provider={provider} query={query} onChange={noop}
    onSubcategory={noop} onOpen={noop} onExperience={noop} onTour={noop} onViewAll={noop} />);
  const trip = page({ categoryId: 'airport-transfers' });
  assert.match(trip, /<h1>Airport Transfers<\/h1>/);
  assert.match(trip, /class="transfer-form/);
  assert.doesNotMatch(trip, /Browse by type/);
  assert.doesNotMatch(trip, /transfer-results/);
  assert.doesNotMatch(trip, /\bdemo\b|Featured|Popular/i);
  const types = page({ categoryId: 'airport-transfers', subcategoryId: 'airport-transfers:meet-greet' });
  assert.doesNotMatch(types, /transfer-form/);
  assert.match(types, /Browse by type/);
  const direct = renderToStaticMarkup(<TransferSearch title="Airport Transfers" provider={provider} onOpen={noop} />);
  assert.match(direct, /Your trip first, then compare vehicles across operators\./);
});
