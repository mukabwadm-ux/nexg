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
    // Flights waits for a flights category in Derrick NexG (owner, 9 Nov 2026); everything else has a source group.
    const source = subcategory.sourceIds[0];
    if (category.id !== 'flights') assert.ok(source, `${subcategory.id} has a source group`);
    const kind = offeringKind({ subcategoryId: source ?? subcategory.id });
    if (source) assert.equal(offeringKind({ subcategoryId: subcategory.id }), kind, subcategory.id);
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  // Play adds 13 activities; Flights adds 2 activities (scenic, safari) and 2 quoted charters (task).
  assert.deepEqual(counts, { product: 46, dish: 6, service: 11, activity: 23, task: 23, vehicle: 6 });
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

test('cards leave out a line that only repeats the name, and a product’s + adds it to the cart', () => {
  assert.equal(cardLine({ name: 'Entry Smartphone', description: 'Entry Smartphone from Amani Smartphones Atelier. Unlocked, with a charger.' }), undefined);
  assert.equal(sheetDescription({ name: 'Entry Smartphone', description: 'Entry Smartphone from Amani Smartphones Atelier. Unlocked, with a charger.' }), 'Unlocked, with a charger.');
  assert.equal(sheetDescription({ name: 'Entry Smartphone', description: 'Entry Smartphone from Amani Smartphones Atelier.' }), undefined);
  assert.equal(cardLine({ name: 'Grilled Chicken', description: 'Chargrilled with herbs. Served with chips.' }), 'Chargrilled with herbs.');
  assert.equal(sheetDescription({ name: 'Grilled Chicken', description: 'Chargrilled with herbs. Served with chips.' }), 'Chargrilled with herbs. Served with chips.');
  const fresh = renderToStaticMarkup(<OfferingCard item={item(64500)} kind="product" saved={false} onSave={noop} onOpen={noop} onAdd={noop} onRemove={noop} />);
  assert.match(fresh, /aria-label="Add Control offering to cart"/);
  assert.doesNotMatch(fresh, /Remove|offering-card__stepper/);
});

test('the + adds in place and rests as a gold count; its − n + pill opens only when tapped (owner, 9 Nov 2026)', () => {
  const card = (quantity: number, handlers = true) => renderToStaticMarkup(<OfferingCard item={item(64500)} kind="product" saved={false} onSave={noop} onOpen={noop}
    quantity={quantity} {...(handlers ? { onAdd: noop, onRemove: noop } : { onAdd: noop })} />);
  const two = card(2);
  assert.match(two, /offering-card offering-card--product is-chosen/);
  // Folded: one round button showing the count, which reopens the pill; the − and the count wait, inert, inside it.
  assert.match(two, /class="offering-card__quantity is-folded"/);
  assert.match(two, /aria-label="Change quantity of Control offering, 2 in cart"/);
  assert.match(two, /<span class="offering-card__stepper" inert="">/);
  assert.match(two, /aria-label="Remove one Control offering from cart"/);
  assert.match(two, /class="offering-card__total" aria-hidden="true">2</);
  // At one the − becomes the bin; a polite live region says what changed.
  assert.match(card(1), /aria-label="Remove Control offering from cart"/);
  assert.match(card(1), /aria-live="polite"/);
  // Without a way to take one out, the + only adds and a badge shows the count.
  assert.match(card(2, false), /class="offering-card__badge" aria-hidden="true">2</);
  assert.match(card(2, false), /aria-label="Add one more Control offering, 2 in cart"/);
  assert.doesNotMatch(card(2, false), /offering-card__stepper/);
  // Without onAdd the + opens the item, as before.
  assert.match(renderToStaticMarkup(<OfferingCard item={item(64500)} kind="product" saved={false} onSave={noop} onOpen={noop} />), /aria-label="Choose Control offering"/);
});

test('the compact card: a square tile with the + on it, then the price and the name, and nothing more', () => {
  const compact = (extra: Partial<CatalogItem> = {}) => renderToStaticMarkup(<OfferingCard item={{ ...item(1700), image: 'https://example.test/milk.jpg', ...extra }} kind="product" variant="compact"
    saved={false} onSave={noop} onOpen={noop} onAdd={noop} onRemove={noop} />);
  const html = compact();
  assert.match(html, /class="offering-card offering-card--compact offering-card--product"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
  assert.match(html, /KES\s*1,700/);
  assert.match(html, /aria-label="Add Control offering to cart"/);
  assert.ok(html.indexOf('offering-card__quantity') < html.indexOf('offering-card__body'), 'the + sits on the photo tile');
  assert.doesNotMatch(html, /offering-card__save|offering-card__description|offering-card__tag|offering-card__footer/);
  const gone = compact({ isAvailable: false });
  assert.match(gone, /is-unavailable/);
  assert.match(gone, />Unavailable</);
  assert.match(gone, /class="offering-card__add" disabled=""/);
  // The standard card keeps its anatomy.
  const standard = renderToStaticMarkup(<OfferingCard item={item(1700)} kind="product" saved={false} onSave={noop} onOpen={noop} onAdd={noop} onRemove={noop} />);
  for (const part of [/offering-card__save/, /offering-card__description/, /offering-card__footer/]) assert.match(standard, part);
  assert.doesNotMatch(standard, /offering-card--compact/);
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

test('wording is production wording: purchases go to the NexG cart, requests stay on this device', () => {
  for (const kind of kinds) {
    for (const text of Object.values(kindPresentation[kind])) assert.doesNotMatch(text, /demo|sample/i, kind);
    assert.match(kindPresentation[kind].pending, kind === 'product' || kind === 'dish' ? /cart|checkout/i : /this device/, kind);
  }
  assert.equal(transferCardAction, 'Select');
});

test('the expanded card only claims what it keeps: products join the cart, requests stay on the device', () => {
  const sheet = (props: Partial<OfferingSheetProps> & { kind: OfferingKind }) =>
    renderToStaticMarkup(<OfferingSheet merchant={merchant} item={item(1500)} saved={false} onSave={noop} onClose={noop} {...props} />);
  // Without somewhere to keep the choice, the main button can't claim to keep it.
  assert.match(sheet({ kind: 'product' }), /class="offering-sheet__primary" disabled=""/);
  assert.match(sheet({ kind: 'task' }), /class="offering-sheet__primary" disabled=""/);
  assert.doesNotMatch(sheet({ kind: 'product', onList: noop }), /class="offering-sheet__primary" disabled=""/);
  const listed = sheet({ kind: 'product', listed: 2, onList: noop });
  assert.match(listed, /2 in your cart/);
  assert.match(listed, /In your cart/);
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
  assert.match(shop, /placeholder="Search Control Phones"/);
  assert.match(shop, /Flagship &amp; foldable phones/);
  assert.match(shop, /aria-label="Add Foldable Smartphone to cart"/);
  assert.doesNotMatch(shop, /Back to discovery|demo/i);
  assert.match(render({ ...phones, isOpen: false }), /Closed now/);
  assert.match(render({ ...phones, items: [] }), /No products listed yet/);

  const hire = render({ id: 'merchant-control', name: 'Control Hire', subcategoryId: 'vehicle-rentals_car-rental', items: [named('item-c', 'Compact SUV', 6500)] });
  assert.match(hire, /Plan your car hire/);
  assert.match(hire, /placeholder="Search Control Hire"/);
  assert.match(hire, /1 vehicle/);
  assert.ok(hire.indexOf('Plan your car hire') < hire.indexOf('class="section-nav'), 'the trip comes before the fleet');

  const transfer = render({ id: 'merchant-control', name: 'Control Transfers', subcategoryId: 'airport-transfers_airport-pickup', items: [named('item-d', 'JKIA Sedan Pickup', 4200)] });
  assert.match(transfer, /Plan your transfer/);
  assert.match(transfer, /placeholder="e.g. JKIA Terminal 1A"/);
  assert.match(transfer, /Select<svg/);
  assert.doesNotMatch(transfer, /Check dates/);
});
