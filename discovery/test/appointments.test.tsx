import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CatalogItem, Merchant } from '../src/providers/DiscoveryProvider';
import { bookingAction, isAppointmentProvider, localDateKey, readShelf, servicesSearchPrompt, writeShelf, type AppointmentRequest } from '../src/data/massagePresentation';
import { MassageServiceCard } from '../src/components/storefronts/massage/MassageServiceCard';
import { MassageStorefront } from '../src/components/storefronts/massage/MassageStorefront';

// Requests and hearts live in the browser's localStorage; this file runs in its own process, so a stand-in is safe.
const kept = new Map<string, string>();
Object.assign(globalThis, { window: { localStorage: {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => { kept.set(key, String(value)); },
  removeItem: (key: string) => { kept.delete(key); },
} } });

// Isolated presentation controls, never catalogue data.
const noop = () => {};
const service = (id: string, name: string, price?: number, extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ id, merchantId: 'store-control', name, ...(price === undefined ? {} : { price, currency: 'KES' }), ...extra });
const storeOf = (subcategoryId: string, items: CatalogItem[], extra: Partial<Merchant> = {}): Merchant =>
  ({ id: 'store-control', name: 'Control Wellness', subcategoryId, area: 'Kilimani', items, ...extra });
const render = (merchant: Merchant) => renderToStaticMarkup(<MassageStorefront merchant={merchant} onBack={noop} onSelectItem={noop} onCloseItem={noop} />);
const nextWeek = localDateKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
const request = (extra: Partial<AppointmentRequest> = {}): AppointmentRequest =>
  ({ date: nextWeek, time: '14:30', people: 2, notes: 'Firm pressure, please', savedAt: '2026-11-09T08:00:00.000Z', ...extra });
/** The open sheet's markup alone, without the store behind it. */
const dialogOf = (html: string) => html.slice(html.indexOf('<dialog'), html.indexOf('</dialog>'));
const massage = [service('item-a', 'Hot Stone Massage', 10600, { description: 'Hot Stone Massage from Control Wellness. Massage in the Wellness vertical.' }), service('item-b', 'Classic Facial', 6500)];

test('massage, spa, gym and personal training all open the appointment storefront', () => {
  for (const id of ['wellness_massage', 'wellness_spa', 'wellness_gym', 'wellness_personal-training', 'beauty-wellness:massage']) {
    assert.ok(isAppointmentProvider(storeOf(id, [])), id);
  }
  assert.equal(isAppointmentProvider(storeOf('groceries-essentials_supermarket', [])), false);
});

test('one hero with confirmed facts, then the store’s own sections in its own words', () => {
  kept.clear();
  const html = render(storeOf('wellness_massage', massage));
  assert.match(html, /class="store-hero"/);
  assert.match(html, /store-hero__eyebrow">Massage</);
  assert.match(html, /Kilimani/);
  assert.match(html, /2 treatments/);
  assert.doesNotMatch(html, /Open now|Closed now/, 'the open state shows only when the source knows it');
  assert.match(render(storeOf('wellness_massage', massage, { isOpen: true })), /Open now/);
  assert.match(html, /aria-label="Treatments"/);
  assert.match(html, /placeholder="Search Control Wellness"/, 'the store search names the store it searches');
  assert.match(html, />Massages</);
  assert.match(html, />Facials</);
  assert.match(html, /offering-grid offering-grid--roomy/);
  assert.match(html, new RegExp(`${bookingAction}<svg`));
  // Generated catalogue copy never shows, and nothing claims a duration, a slot or availability.
  assert.doesNotMatch(html, /Wellness vertical/);
  assert.doesNotMatch(html, /\d+\s*min|minutes|slot|available|demo/i);
  assert.doesNotMatch(html, /store-basket/);

  const gym = render(storeOf('wellness_gym', [service('item-c', 'Day Pass', 4250), service('item-d', 'Monthly Membership', 9000)]));
  assert.match(gym, /placeholder="Search Control Wellness"/);
  assert.match(gym, /2 options/);
  const training = render(storeOf('wellness_personal-training', [service('item-e', 'Strength Programme', 4100)]));
  assert.match(training, /placeholder="Search Control Wellness"/);
  assert.match(training, /1 programme/);
  const empty = render(storeOf('wellness_spa', []));
  assert.match(empty, /No treatments listed yet/);
  assert.doesNotMatch(empty, /section-nav/);
});

test('requests stay on this device: the card is marked and the pill says nothing has been sent', () => {
  kept.clear();
  writeShelf('store-control', { saved: ['item-b'], requests: { 'item-a': request() } });
  const html = render(storeOf('wellness_massage', massage));
  assert.match(html, /appointment-store has-basket/);
  assert.match(html, /Request saved/);
  assert.match(html, /View request<svg/);
  assert.match(html, /1 request on this device/);
  assert.match(html, /Not sent to Control Wellness yet/);
  assert.match(html, />Review</);
  assert.match(html, /aria-label="Unsave Classic Facial"/);
  // A request for a day that has passed is no longer a request.
  writeShelf('store-control', { saved: [], requests: { 'item-a': request({ date: '2020-01-01' }) } });
  assert.deepEqual(readShelf('store-control').requests, {});
  writeShelf('store-control', { saved: [], requests: {} });
  assert.equal(kept.get('nexg.discovery.appointments.v1'), '{}');
});

test('a service opens the one item sheet with the request step: a preferred day and time, never a free slot', () => {
  kept.clear();
  const sheet = (merchant: Merchant, item: CatalogItem = merchant.items[0]!) =>
    dialogOf(renderToStaticMarkup(<MassageStorefront merchant={merchant} activeItem={item} onBack={noop} onSelectItem={noop} onCloseItem={noop} />));
  const store = storeOf('wellness_massage', massage);
  const fresh = sheet(store);
  assert.match(fresh, /^<dialog class="item-sheet item-sheet--service item-sheet--request"/);
  for (const question of [/Preferred date/, /Preferred time/, /type="time"/, /Guests/, /Anything they should know\?/]) assert.match(fresh, question);
  assert.match(fresh, /KES\s*10,600/);
  assert.match(fresh, /Control Wellness confirms the time\./);
  assert.match(fresh, /Requests stay on this device\. Sending them isn’t on the website yet\./);
  assert.match(fresh, /<span class="item-sheet__label">Save request<\/span>/);
  assert.doesNotMatch(fresh, /slot|availab|duration|minutes|therapist|Wellness vertical|demo|Order from/i);
  assert.doesNotMatch(fresh, /Remove<\/button>/);

  const consultation = service('item-x', 'Consultation');
  const unpriced = sheet(storeOf('wellness_massage', [...massage, consultation]), consultation);
  assert.match(unpriced, /Price on request/);
  assert.match(unpriced, /confirms the time and price/);

  const day = sheet(storeOf('wellness_gym', [service('item-c', 'Day Pass', 4250)]));
  assert.match(day, /Preferred start date/);
  assert.doesNotMatch(day, /type="time"/);
  assert.match(day, /Control Wellness confirms the start date\./);
});

test('a request saved before the one sheet still opens with everything the shopper chose', () => {
  kept.clear();
  writeShelf('store-control', { saved: [], requests: { 'item-a': request() } });
  const saved = dialogOf(renderToStaticMarkup(<MassageStorefront merchant={storeOf('wellness_massage', massage)} activeItem={massage[0]} onBack={noop} onSelectItem={noop} onCloseItem={noop} />));
  assert.match(saved, /Saved on this device\. Nothing has been sent yet\./);
  assert.match(saved, /<span class="item-sheet__label">Saved<\/span>/);
  assert.match(saved, /value="14:30"/);
  assert.match(saved, /<output aria-live="polite">2<\/output>/);
  assert.match(saved, /Firm pressure, please/);
  assert.match(saved, /Remove<\/button>/);
  // Still kept in the appointment shelf's own format, where the store reads it.
  assert.deepEqual(readShelf('store-control').requests['item-a'], request());
});

test('the service card opens the booking request, and a kept request reopens it', () => {
  const card = (requested: boolean) => renderToStaticMarkup(<MassageServiceCard item={service('item-a', 'Hot Stone Massage', 10600)} merchant={{ name: 'Control Wellness' }}
    kind="service" saved={false} requested={requested} onSave={noop} onOpen={noop} />);
  assert.match(card(false), /Request to book<svg/);
  assert.doesNotMatch(card(false), /Request saved/);
  assert.match(card(true), /View request<svg/);
  assert.match(card(true), /offering-card__tag">Request saved</);
  assert.equal(servicesSearchPrompt({ list: 'Treatments', items: 'treatments' }), 'Search treatments');
  assert.equal(servicesSearchPrompt({ list: 'Training', items: 'programmes' }), 'Search programmes');
});
