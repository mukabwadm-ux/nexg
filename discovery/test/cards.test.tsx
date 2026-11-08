import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { categories } from '../src/data/taxonomy';
import { kindPresentation, offeringKind, transferCardAction, type OfferingKind } from '../src/data/offeringKinds';
import { OfferingCard, cardLine, sheetDescription } from '../src/components/cards/OfferingCard';
import { OfferingSheet, type OfferingSheetProps } from '../src/components/cards/OfferingSheet';
import { GenericStorefront } from '../src/components/storefronts/GenericStorefront';
import type { CatalogItem, Merchant } from '../src/providers/DiscoveryProvider';

// One card family (owner decision, 8 Nov 2026). Isolated presentation controls, never catalog data.
const item = (price?: number): CatalogItem => ({ id: 'item-control', merchantId: 'merchant-control', name: 'Control offering', description: 'A short control description.',
  ...(price === undefined ? {} : { price, currency: 'KES' }) });
const named = (id: string, name: string, price: number): CatalogItem => ({ id, merchantId: 'merchant-control', name, price, currency: 'KES' });
const merchant: Merchant = { id: 'merchant-control', name: 'Control Merchant', area: 'Kilimani', items: [item(1500)] };
const noop = () => {};
const kinds = ['product', 'dish', 'service', 'activity', 'task', 'vehicle'] as const;

test('every subcategory gets a card kind from its journey, and restaurant purchases are dishes', () => {
  const counts: Partial<Record<OfferingKind, number>> = {};
  for (const category of categories) for (const subcategory of category.subcategories) {
    const source = subcategory.sourceIds[0];
    assert.ok(source, `${subcategory.id} has a source group`);
    const kind = offeringKind({ subcategoryId: source });
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  assert.deepEqual(counts, { product: 46, dish: 6, service: 11, activity: 8, task: 21, vehicle: 6 });
  assert.equal(offeringKind({ subcategoryId: 'restaurants-food_restaurant' }), 'dish');
  assert.equal(offeringKind({ subcategoryId: 'restaurants-food_catering' }), 'task');
  assert.equal(offeringKind({ subcategoryId: 'beauty-wellness:massage' }), 'service');
  assert.equal(offeringKind({ subcategoryId: 'concierge-services_courier-errands' }), 'task');
  assert.equal(offeringKind({ subcategoryId: 'no-such-group' }), 'product');
});

test('small cards share one anatomy and change only their wording and action by kind', () => {
  const render = (kind: OfferingKind, price?: number) => renderToStaticMarkup(<OfferingCard item={item(price)} kind={kind} saved={false} onSave={noop} onOpen={noop} />);
  const product = render('product', 64500);
  assert.match(product, /KES\s*64,500/);
  assert.match(product, /aria-label="Choose Control offering"/);
  assert.match(render('activity', 9300), /From KES\s*9,300/);
  assert.match(render('activity', 9300), /Choose a date/);
  const task = render('task');
  assert.match(task, /Quoted after review/);
  assert.match(task, /Start a request/);
  assert.match(render('vehicle', 6500), /Check dates/);
  for (const kind of kinds) {
    const html = render(kind, 1000);
    assert.match(html, /offering-card__media/); assert.match(html, /offering-card__save/); assert.match(html, /offering-card__price/);
  }
  // A worded action never squeezes the price onto two lines: request kinds get their own footer layout.
  assert.match(task, /offering-card__footer offering-card__footer--action/);
  assert.doesNotMatch(product, /offering-card__footer--action/);
});

test('cards leave out a line that only repeats the name, and products show what is already on the list', () => {
  assert.equal(cardLine({ name: 'Entry Smartphone', description: 'Entry Smartphone from Amani Smartphones Atelier. Unlocked, with a charger.' }), undefined);
  assert.equal(sheetDescription({ name: 'Entry Smartphone', description: 'Entry Smartphone from Amani Smartphones Atelier. Unlocked, with a charger.' }), 'Unlocked, with a charger.');
  assert.equal(sheetDescription({ name: 'Entry Smartphone', description: 'Entry Smartphone from Amani Smartphones Atelier.' }), undefined);
  assert.equal(cardLine({ name: 'Grilled Chicken', description: 'Chargrilled with herbs. Served with chips.' }), 'Chargrilled with herbs.');
  assert.equal(sheetDescription({ name: 'Grilled Chicken', description: 'Chargrilled with herbs. Served with chips.' }), 'Chargrilled with herbs. Served with chips.');
  const chosen = renderToStaticMarkup(<OfferingCard item={item(64500)} kind="product" saved={false} onSave={noop} onOpen={noop} quantity={2} onAdd={noop} onRemove={noop} />);
  assert.match(chosen, /offering-card offering-card--product is-chosen/);
  assert.match(chosen, /aria-label="Remove one Control offering"/);
  assert.match(chosen, /aria-label="Add another Control offering, 2 on your list"/);
  const fresh = renderToStaticMarkup(<OfferingCard item={item(64500)} kind="product" saved={false} onSave={noop} onOpen={noop} onAdd={noop} onRemove={noop} />);
  assert.match(fresh, /aria-label="Add Control offering to your list"/);
  assert.doesNotMatch(fresh, /Remove one/);
});

test('expanded states ask kind-specific questions and say plainly that nothing is sent yet', () => {
  const render = (kind: OfferingKind) => renderToStaticMarkup(<OfferingSheet merchant={merchant} item={item(1500)} kind={kind} saved={false} onSave={noop} onClose={noop} />);
  assert.match(render('product'), /Quantity/);
  assert.match(render('service'), /Preferred date/);
  assert.match(render('activity'), /Time of day/);
  assert.match(render('activity'), /Children/);
  assert.match(render('task'), /Describe what you need/);
  assert.match(render('task'), /How should they reach you/);
  assert.match(render('vehicle'), /Pick-up place/);
  assert.match(render('vehicle'), /With a driver/);
  for (const kind of kinds) {
    const html = render(kind);
    assert.ok(html.includes(kindPresentation[kind].sheetAction), kind);
    assert.ok(html.includes(kindPresentation[kind].pending.replaceAll('’', '&#x27;')) || html.includes(kindPresentation[kind].pending), kind);
  }
  // No store says it visits homes, so a service never offers "At my place".
  assert.doesNotMatch(render('service'), /At my place/);
});

test('wording is production wording, and every kind says its choices stay on this device', () => {
  for (const kind of kinds) {
    for (const text of Object.values(kindPresentation[kind])) assert.doesNotMatch(text, /demo|sample/i, kind);
    assert.match(kindPresentation[kind].pending, /this device/, kind);
  }
  assert.equal(transferCardAction, 'Select');
});

test('the expanded card only claims what it keeps: products join the list, requests stay on the device', () => {
  const sheet = (props: Partial<OfferingSheetProps> & { kind: OfferingKind }) =>
    renderToStaticMarkup(<OfferingSheet merchant={merchant} item={item(1500)} saved={false} onSave={noop} onClose={noop} {...props} />);
  // Without somewhere to keep the choice, the main button can't claim to keep it.
  assert.match(sheet({ kind: 'product' }), /class="offering-sheet__primary" disabled=""/);
  assert.match(sheet({ kind: 'task' }), /class="offering-sheet__primary" disabled=""/);
  assert.doesNotMatch(sheet({ kind: 'product', onList: noop }), /class="offering-sheet__primary" disabled=""/);
  const listed = sheet({ kind: 'product', listed: 2, onList: noop });
  assert.match(listed, /2 on your list/);
  assert.match(listed, /On your list/);
  assert.match(listed, /Remove<\/button>/);
  const kept = sheet({ kind: 'task', onKeep: noop, onForget: noop,
    request: { answers: { brief: 'Collect a parcel in Westlands', contact: 'call' }, savedAt: '2026-11-08T10:00:00.000Z' } });
  assert.match(kept, /Collect a parcel in Westlands/);
  assert.match(kept, /Saved on this device/);
  assert.match(kept, /Remove<\/button>/);
});

test('a transfer asks for the ride, not hire dates, and bike hire never offers a driver', () => {
  const transfers: Merchant = { id: 'merchant-control', name: 'Control Transfers', subcategoryId: 'airport-transfers_airport-pickup', items: [] };
  const ride = renderToStaticMarkup(<OfferingSheet merchant={transfers} item={item(4200)} kind="vehicle" saved={false} onSave={noop} onClose={noop}
    ride={{ pickup: 'JKIA Terminal 1A', dropoff: 'Westlands', date: '2026-11-14', time: '14:30', travellers: 2, bags: 3, meetGreet: true }} />);
  for (const question of [/Pickup/, /Drop-off/, /value="Westlands"/, /Travellers/, /Bags/, /Meet &amp; greet/]) assert.match(ride, question);
  assert.doesNotMatch(ride, /Return time|With a driver|Pick-up and return dates/);
  const bikes: Merchant = { id: 'merchant-control', name: 'Control Bikes', subcategoryId: 'vehicle-rentals_bike-rental', items: [] };
  const bike = renderToStaticMarkup(<OfferingSheet merchant={bikes} item={item(1200)} kind="vehicle" saved={false} onSave={noop} onClose={noop} />);
  assert.match(bike, /Pick-up and return dates/);
  assert.doesNotMatch(bike, /With a driver/);
});

test('the generic storefront: one hero with confirmed facts, then the store’s own sections in its own words', () => {
  const render = (store: Merchant) => renderToStaticMarkup(<GenericStorefront merchant={store} onBack={noop} onSelectItem={noop} onCloseItem={noop} />);
  const phones: Merchant = { id: 'merchant-control', name: 'Control Phones', subcategoryId: 'tech-electronics_smartphones', area: 'Westlands',
    items: [named('item-a', 'Foldable Smartphone', 98000), named('item-b', 'Phone Case', 1500)] };
  const shop = render(phones);
  assert.match(shop, /class="store-hero"/);
  assert.match(shop, /Back<\/button>/);
  assert.match(shop, /Westlands/);
  assert.match(shop, /2 products/);
  assert.doesNotMatch(shop, /Open now|Closed now/);
  assert.match(shop, /placeholder="Search the shop"/);
  assert.match(shop, /Flagship &amp; foldable phones/);
  assert.match(shop, /aria-label="Add Foldable Smartphone to your list"/);
  assert.doesNotMatch(shop, /Back to discovery|demo/i);
  assert.match(render({ ...phones, isOpen: false }), /Closed now/);
  assert.match(render({ ...phones, items: [] }), /No products listed yet/);

  const hire = render({ id: 'merchant-control', name: 'Control Hire', subcategoryId: 'vehicle-rentals_car-rental', items: [named('item-c', 'Compact SUV', 6500)] });
  assert.match(hire, /Plan your car hire/);
  assert.match(hire, /placeholder="Search the fleet"/);
  assert.match(hire, /1 vehicle/);
  assert.ok(hire.indexOf('Plan your car hire') < hire.indexOf('class="section-nav'), 'the trip comes before the fleet');

  const transfer = render({ id: 'merchant-control', name: 'Control Transfers', subcategoryId: 'airport-transfers_airport-pickup', items: [named('item-d', 'JKIA Sedan Pickup', 4200)] });
  assert.match(transfer, /Plan your transfer/);
  assert.match(transfer, /placeholder="e.g. JKIA Terminal 1A"/);
  assert.match(transfer, /Select<svg/);
  assert.doesNotMatch(transfer, /Check dates/);
});
