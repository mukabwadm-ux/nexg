import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CatalogItem, CatalogModifierGroup, Merchant } from '../src/providers/DiscoveryProvider';
import { offeringKind } from '../src/data/offeringKinds';
import { cartBlock } from '../src/data/restaurantPresentation';
import {
  appointmentFromKept, cartAction, cartSheetNote, detailAction, itemSheetBlock, keptFromAppointment, readItemRequest, requestAnswers, requestDraft,
  requestIntro, requestProblem, storeLabel, storeMeta, writeItemRequest, type ItemSheetBlock,
} from '../src/data/itemSheet';
import { OfferingSheet, type OfferingSheetProps } from '../src/components/cards/OfferingSheet';

// Device storage stand-ins; this file runs in its own process. Requests read the storage they're given, and the
// appointment shelf reads window.localStorage, so both point at one in-memory map. No real storage or website is used.
const stored = new Map<string, string>();
const storage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, String(value)); },
  removeItem: (key: string) => { stored.delete(key); },
};
Object.assign(globalThis, { window: { localStorage: storage } });

// Isolated presentation controls, never catalogue data. Cart controls carry UUIDs, as Supabase identities do.
const noop = () => {};
const store = (id: string, name: string, subcategoryId: string, extra: Partial<Merchant> = {}): Merchant => ({ id, name, subcategoryId, area: 'Westlands', items: [], ...extra });
const offering = (id: string, merchant: Merchant, name: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, merchantId: merchant.id, name, ...extra });
const phones = store('c0000000-0000-4000-8000-0000000000a1', 'Control Phones', 'tech-electronics_smartphones');
const kitchen = store('c0000000-0000-4000-8000-0000000000a3', 'Control Kitchen', 'restaurants-food_restaurant');
const spa = store('c0000000-0000-4000-8000-0000000000a4', 'Control Spa', 'wellness_massage');
const gym = store('c0000000-0000-4000-8000-0000000000a5', 'Control Gym', 'wellness_gym');
const clinic = store('c0000000-0000-4000-8000-0000000000a6', 'Control Clinic', 'health_clinics');
const errands = store('c0000000-0000-4000-8000-0000000000a7', 'Control Errands', 'concierge-services_courier-errands');
const hire = store('c0000000-0000-4000-8000-0000000000a8', 'Control Hire', 'vehicle-rentals_car-rental');
const bikes = store('c0000000-0000-4000-8000-0000000000a9', 'Control Bikes', 'vehicle-rentals_bike-rental');
const transfers = store('c0000000-0000-4000-8000-0000000000b1', 'Control Transfers', 'airport-transfers_airport-pickup');
const concerts = store('c0000000-0000-4000-8000-0000000000b2', 'Control Concerts', 'experiences_concerts');
const classes = store('c0000000-0000-4000-8000-0000000000b3', 'Control Classes', 'experiences_workshops');
const safaris = store('c0000000-0000-4000-8000-0000000000b4', 'Control Safaris', 'travel-tours_game-drives');

const phone = (extra: Partial<CatalogItem> = {}) => offering('f0000000-0000-4000-8000-000000000001', phones, 'Control Phone', { price: 22000, currency: 'KES', ...extra });
const size: CatalogModifierGroup = { id: 'size', name: 'Size', required: true, minSelections: 1, maxSelections: 1, options: [
  { id: 'regular', name: 'Regular', priceDelta: 0, currency: 'KES' }, { id: 'large', name: 'Large', priceDelta: 200, currency: 'KES' }] };
const extras: CatalogModifierGroup = { id: 'extras', name: 'Extras', required: false, minSelections: 0, maxSelections: 2, options: [
  { id: 'cheese', name: 'Extra cheese', priceDelta: 150, currency: 'KES' }] };
const burger = offering('f0000000-0000-4000-8000-000000000003', kitchen, 'Control Burger', { price: 800, currency: 'KES', modifierGroups: [size] });
const wrap = offering('f0000000-0000-4000-8000-000000000004', kitchen, 'Control Wrap', { price: 570, currency: 'KES', modifierGroups: [extras] });
const massage = offering('massage', spa, 'Control Massage', { price: 4500, currency: 'KES' });
const membership = offering('membership', gym, 'Control Membership', { price: 6000, currency: 'KES' });
const car = offering('car', hire, 'Control SUV', { price: 6500, currency: 'KES' });
const ticket = offering('ticket', concerts, 'Control Ticket', { price: 2500, currency: 'KES' });
const drive = offering('drive', safaris, 'Control Game Drive', { price: 93000, currency: 'KES' });
const blockFor = (merchant: Merchant, item: CatalogItem, options: Parameters<typeof itemSheetBlock>[3] = {}) =>
  itemSheetBlock(merchant, item, offeringKind(merchant), { context: 'discovery', today: '2026-11-09', ...options });
const request = (block: ItemSheetBlock) => {
  assert.ok(block.type === 'request' || block.type === 'vehicle', `expected a request, got ${block.type}`);
  return block;
};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('one sheet, one block per kind, resolved from the kind, the subcategory and the data', () => {
  assert.deepEqual(blockFor(phones, phone()), { type: 'cart', options: [] });
  assert.equal(itemSheetBlock(phones, phone(), 'product').type, 'cart', 'products go in the cart wherever the sheet opens');
  assert.deepEqual(blockFor(kitchen, burger), { type: 'cart', options: [size] }, 'a dish lists only its own option groups');

  const spaBlock = blockFor(spa, massage);
  assert.ok(spaBlock.type === 'request' && spaBlock.form === 'service');
  assert.deepEqual([spaBlock.profile?.dateLabel, spaBlock.profile?.askTime, spaBlock.profile?.peopleLabel], ['Preferred date', true, 'Guests']);
  const gymBlock = blockFor(gym, membership);
  assert.ok(gymBlock.type === 'request' && gymBlock.profile?.askTime === false, 'a gym membership starts on a day, not at a time');
  const clinicBlock = blockFor(clinic, offering('visit', clinic, 'Control Visit'));
  assert.ok(clinicBlock.type === 'request' && clinicBlock.form === 'service' && !clinicBlock.profile, 'care keeps the plain questions');
  assert.deepEqual(blockFor(errands, offering('parcel', errands, 'Control Parcel')), { type: 'request', form: 'task' });

  assert.deepEqual(blockFor(hire, car), { type: 'vehicle', journey: 'rental', bike: false, direction: undefined });
  assert.deepEqual(blockFor(bikes, offering('bike', bikes, 'Control Bike')), { type: 'vehicle', journey: 'rental', bike: true, direction: undefined });
  assert.deepEqual(blockFor(transfers, offering('sedan', transfers, 'Control Sedan')), { type: 'vehicle', journey: 'transfer', bike: false, direction: 'pickup' });

  const event = blockFor(concerts, ticket, { detail: true });
  assert.ok(event.type === 'detail' && event.page === 'event');
  assert.equal(detailAction.event, 'View event');
  assert.equal(blockFor(concerts, ticket).type, 'request', 'without a page to open, an activity asks its questions');
  const trip = blockFor(safaris, drive, { detail: true });
  assert.ok(trip.type === 'detail' && trip.page === 'trip');
  assert.equal(detailAction.trip, 'View trip');
  const lesson = blockFor(classes, offering('lesson', classes, 'Control Lesson'), { detail: true });
  assert.ok(lesson.type === 'detail' && lesson.page === 'class' && detailAction[lesson.page] === 'View class');

  assert.deepEqual([storeLabel('product'), storeLabel('dish'), storeLabel('service'), storeLabel('vehicle'), storeLabel('activity')],
    ['Order from', 'Order from', 'Request from', 'Request from', 'Offered by']);
  assert.equal(storeMeta({ ...phones, displayFacts: { deliveryTime: '25–35 min', rating: { value: 4.6 } } }), 'Westlands · 25–35 min · Rated 4.6');
  assert.equal(storeMeta({ ...phones, area: undefined }), '');
});

test('events and trips show only the facts their listing has', () => {
  const listed = { ...drive, trip: { duration: '3 days / 2 nights', location: 'Maasai Mara, Narok',
    departures: [{ start: '2026-12-04', end: '2026-12-06' }, { start: '2026-11-20', end: '2026-11-22' }, { start: '2026-10-01' }] } };
  const block = blockFor(safaris, listed, { detail: true });
  assert.ok(block.type === 'detail');
  assert.deepEqual(block.facts.map((fact) => [fact.label, fact.value]), [
    ['Duration', '3 days / 2 nights'], ['Location', 'Maasai Mara, Narok'], ['Next departure', '20–22 Nov 2026 · 1 more date']]);
  const plain = blockFor(safaris, drive, { detail: true });
  assert.ok(plain.type === 'detail');
  assert.deepEqual(plain.facts.map((fact) => fact.key), ['type'], 'no price, no operator base, nothing the listing lacks');
});

test('products and dishes go in the NexG cart, and what can’t go in says why', () => {
  assert.equal(cartBlock(phone()), undefined);
  const add = cartAction({ item: phone(), quantity: 2, inCart: 0 });
  assert.deepEqual([add.type, add.label, add.disabled], ['add', 'Add to cart', false]);
  assert.match(add.total ?? '', /^KES\s44,000$/);
  assert.deepEqual(cartAction({ item: phone(), quantity: 2, inCart: 2 }), { type: 'in-cart', label: 'In your cart', disabled: true });
  const update = cartAction({ item: phone(), quantity: 3, inCart: 2 });
  assert.deepEqual([update.type, update.label], ['update', 'Update cart']);
  assert.match(update.total ?? '', /^KES\s66,000$/);

  const gone = phone({ isAvailable: false });
  assert.equal(cartBlock(gone), 'unavailable');
  assert.deepEqual(cartAction({ item: gone, reason: 'unavailable', quantity: 1, inCart: 0, context: 'discovery', canOpenStore: true }), { type: 'blocked', label: 'Unavailable', disabled: true });
  assert.equal(cartBlock(burger), 'choices');
  assert.deepEqual(cartAction({ item: burger, reason: 'choices', quantity: 1, inCart: 0, context: 'discovery', canOpenStore: true }), { type: 'store', label: 'View in store', disabled: false });
  assert.deepEqual(cartAction({ item: burger, reason: 'choices', quantity: 1, inCart: 0, context: 'store', canOpenStore: true }), { type: 'blocked', label: 'Add to cart', disabled: true });
  assert.equal(cartBlock(phone({ price: undefined })), 'unpriced');
  const checkout = 'Checkout happens on the NexG website.';
  assert.equal(cartSheetNote(phones, phone({ price: undefined }), 'unpriced', checkout), 'This product has no listed price yet, so it can’t go in the cart.');
  assert.equal(cartSheetNote(kitchen, burger, 'choices', checkout), 'This dish needs a choice, and the cart can’t hold choices yet.');
  assert.equal(cartSheetNote(kitchen, wrap, undefined, checkout), 'The cart can’t hold extras yet, so the dish goes in on its own.');
  assert.equal(cartSheetNote(phones, phone(), undefined, checkout), checkout);
});

test('appointment requests saved before the one sheet stay readable, and new ones keep the same format', () => {
  const saved = { date: '2099-01-10', time: '15:00', people: 2, notes: 'Firm pressure', savedAt: '2026-11-08T10:00:00.000Z' };
  const kept = keptFromAppointment(saved);
  assert.deepEqual(kept, { answers: { date: '2099-01-10', time: '15:00', adults: 2, notes: 'Firm pressure' }, savedAt: saved.savedAt });
  assert.deepEqual(appointmentFromKept(kept), saved, 'the round trip changes nothing');
  assert.deepEqual(keptFromAppointment({ ...saved, time: '', notes: '' }).answers, { date: '2099-01-10', adults: 2 }, 'a time left to the provider stays empty');
  assert.deepEqual(appointmentFromKept({ answers: { date: '2099-01-10' }, savedAt: '' }), { date: '2099-01-10', time: '', people: 1, notes: '', savedAt: '' });
  assert.equal(appointmentFromKept({ answers: { notes: 'No date' }, savedAt: '' }), undefined, 'every booking needs a preferred date');
});

test('requests from the sheet are kept on this device where the store’s own page reads them', () => {
  stored.clear();
  const today = '2026-11-09';
  const shelf = `nexg.discovery.shelf.v1:${errands.id}`;
  stored.set(shelf, JSON.stringify({ saved: ['kept-heart'], requests: {} }));
  const parcel = { answers: { brief: 'Collect a parcel in Westlands', contact: 'call' }, savedAt: '2026-11-09T08:00:00.000Z' };
  assert.equal(writeItemRequest(storage, errands, 'parcel', parcel), true);
  assert.deepEqual(JSON.parse(stored.get(shelf)!).saved, ['kept-heart'], 'the store’s hearts stay');
  assert.deepEqual(readItemRequest(storage, errands, 'parcel', today), parcel);
  writeItemRequest(storage, errands, 'parcel');
  assert.equal(readItemRequest(storage, errands, 'parcel', today), undefined);
  assert.deepEqual(JSON.parse(stored.get(shelf)!), { saved: ['kept-heart'], requests: {} });

  writeItemRequest(storage, hire, 'car', { answers: { place: 'JKIA', date: '2026-11-01', endDate: '2026-11-03' }, savedAt: '' });
  assert.equal(readItemRequest(storage, hire, 'car', today), undefined, 'a request for a day that has passed is gone');

  // Appointment stores keep requests on the appointment shelf, the one their storefront reads.
  writeItemRequest(storage, spa, 'massage', { answers: { date: '2099-01-10', time: '15:00', adults: 2, notes: 'Firm pressure' }, savedAt: 'saved' });
  const appointments = JSON.parse(stored.get('nexg.discovery.appointments.v1')!);
  assert.deepEqual(appointments[spa.id].requests.massage, { date: '2099-01-10', time: '15:00', people: 2, notes: 'Firm pressure', savedAt: 'saved' });
  assert.deepEqual(readItemRequest(storage, spa, 'massage', today)?.answers, { date: '2099-01-10', time: '15:00', adults: 2, notes: 'Firm pressure' });
  stored.clear();
});

test('request questions: what stops a request, what it keeps, and who confirms', () => {
  const rental = request(blockFor(hire, car));
  assert.equal(requestProblem(rental, requestDraft()), 'Add the pick-up place and both dates.');
  const draft = { ...requestDraft(), place: 'JKIA', date: '2026-11-14', endDate: '2026-11-14', time: '10:00', endTime: '09:00' };
  assert.equal(requestProblem(rental, draft), 'The return must be after the pickup.');
  const ready = { ...draft, endDate: '2026-11-17' };
  assert.equal(requestProblem(rental, ready), undefined);
  const kept = requestAnswers(rental, ready);
  assert.deepEqual([kept.place, kept.date, kept.endDate, kept.driver, kept.returnPlace], ['JKIA', '2026-11-14', '2026-11-17', false, undefined]);
  const transfer = request(blockFor(transfers, offering('sedan', transfers, 'Control Sedan')));
  assert.equal(requestProblem(transfer, { ...requestDraft(), place: 'JKIA Terminal 1A', dropoff: 'Westlands', date: '2026-11-14' }), 'Add the pickup, drop-off, date and time.');

  const membershipBlock = request(blockFor(gym, membership));
  assert.equal(requestProblem(membershipBlock, requestDraft()), 'Choose a preferred start date.');
  assert.equal(requestAnswers(membershipBlock, { ...requestDraft(), date: '2026-11-20', time: '07:00' }).time, undefined);
  assert.equal(requestIntro(spa, massage, request(blockFor(spa, massage))), 'Control Spa confirms the time.');
  assert.equal(requestIntro(gym, membership, membershipBlock), 'Control Gym confirms the start date.');
  assert.equal(requestIntro(hire, car, rental), 'Control Hire confirms availability and the final price.');
  assert.equal(requestIntro(errands, offering('parcel', errands, 'Control Parcel'), request(blockFor(errands, offering('parcel', errands, 'Control Parcel')))), 'Control Errands confirms the price and timing.');
});

test('the sheet keeps Wolt’s order, shows the store only outside it, and uses production wording', () => {
  const render = (props: Partial<OfferingSheetProps> = {}) => renderToStaticMarkup(<OfferingSheet merchant={phones} item={phone({ description: 'Unlocked, with a charger and a two-year warranty.' })}
    kind="product" saved={false} onSave={noop} onClose={noop} context="discovery" onOpenStore={noop} {...props} />);
  const html = render();
  const at = (marker: string) => { const index = html.indexOf(marker); assert.ok(index >= 0, `${marker} is shown`); return index; };
  const order = ['item-sheet__media', 'item-sheet__title', 'item-sheet__price', 'item-sheet__description', 'Order from', 'item-sheet__footer'].map(at);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'photo, title, price, description, store, then the action');
  assert.match(html, /Add to cart/);
  assert.match(html, /KES\s22,000/);
  assert.match(html, /Control Phones/);
  assert.match(html, /aria-label="Increase quantity"/);
  assert.doesNotMatch(text(html), /\b(list|demo|featured|popular|not provided)\b/i);
  assert.match(html, /Checkout happens on the NexG website\./);
  assert.doesNotMatch(html, /this device/, 'a cart item is the website’s cart, not a note kept on the device');
  assert.doesNotMatch(render({ context: 'store' }), /Order from/, 'inside the store the store card is left out');

  // A store with its own view of the cart writes it; the sheet shows what's there in cart words.
  const inStore = render({ context: 'store', onList: noop, listed: 2 });
  assert.match(inStore, /2 in your cart/);
  assert.match(inStore, /disabled=""><span class="item-sheet__label">In your cart<\/span>/);
  assert.match(inStore, /Remove<\/button>/);
  assert.doesNotMatch(text(inStore), /\blist\b/i);

  const generated = render({ item: phone({ description: 'Control Phone from Control Phones. Smartphones in the Tech & Electronics vertical, dispatched by the NEXG concierge team.' }) });
  assert.doesNotMatch(generated, /item-sheet__description|dispatched/, 'generated copy is never shown');

  const gone = render({ item: phone({ isAvailable: false }) });
  assert.match(gone, /disabled="">\s*<span class="item-sheet__label">Unavailable<\/span>/);
  assert.doesNotMatch(gone, /Increase quantity/);

  const dish = renderToStaticMarkup(<OfferingSheet merchant={kitchen} item={burger} kind="dish" saved={false} onSave={noop} onClose={noop} context="discovery" onOpenStore={noop} />);
  assert.match(dish, /View in store/);
  assert.match(dish, /Required · choose 1/);
  assert.match(dish, /\+ KES\s200/);

  const event = renderToStaticMarkup(<OfferingSheet merchant={concerts} item={ticket} kind="activity" saved={false} onSave={noop} onClose={noop} context="discovery" onOpenStore={noop} onOpenDetail={noop} />);
  assert.match(event, /View event/);
  assert.match(event, /Offered by/);
  assert.doesNotMatch(event, /Time of day|Save request/);

  const hireSheet = renderToStaticMarkup(<OfferingSheet merchant={hire} item={car} kind="vehicle" saved={false} onSave={noop} onClose={noop} context="discovery" onOpenStore={noop} />);
  assert.match(hireSheet, /Request from/);
  assert.match(hireSheet, /Your trip/);
  assert.match(hireSheet, /Control Hire confirms availability and the final price\./);
  assert.match(hireSheet, /Requests stay on this device/);
  // Kept on this device by the sheet itself, so the main button works without a store handler.
  assert.doesNotMatch(hireSheet, /class="offering-sheet__primary" disabled=""/);
});
