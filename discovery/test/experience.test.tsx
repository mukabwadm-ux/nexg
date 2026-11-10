import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CatalogItem, Merchant } from '../src/providers/DiscoveryProvider';
import {
  experienceBooking, experienceDescription, experienceFacts, hostConfirms, listedDates, listedTotal, readExperienceRequest, writeExperienceRequest,
} from '../src/data/experiencePresentation';
import { EventBooking } from '../src/components/ExperienceDetail';
import { TripFacts } from '../src/components/tours/TripFacts';

// Isolated presentation controls, never catalog data.
const host: Merchant = { id: 'host-control', name: 'Control Host', area: 'Riverside', subcategoryId: 'experiences_concerts', items: [] };
const ticket: CatalogItem = { id: 'ticket-control', merchantId: host.id, name: 'Control Pass', price: 18500, currency: 'KES', description: 'Control Pass from Control Host. Doors open early.' };
const shelfKey = `nexg.discovery.shelf.v1:${host.id}`;
const noop = () => {};

class MemoryStorage {
  #values = new Map<string, string>();
  getItem(key: string) { return this.#values.get(key) ?? null; }
  setItem(key: string, value: string) { this.#values.set(key, String(value)); }
  removeItem(key: string) { this.#values.delete(key); }
}

test('event facts show only what the listing says, and the host base is never the venue', () => {
  const facts = experienceFacts(ticket, host);
  assert.deepEqual(facts.map((fact) => fact.key), ['event', 'base', 'price']);
  assert.deepEqual(facts.map((fact) => fact.label), ['Event type', 'Host based in', 'Price']);
  assert.equal(facts[0]!.value, 'Concerts');
  assert.match(facts[2]!.value, /^From KES\s18,500$/);
  const html = renderToStaticMarkup(<TripFacts facts={facts} label="Experience facts" />);
  assert.match(html, /aria-label="Experience facts"/);
  assert.doesNotMatch(html, /not provided/i);
  assert.deepEqual(experienceFacts({ ...ticket, price: undefined }, { ...host, area: undefined }).map((fact) => fact.value), ['Concerts', 'Price on request']);
});

test('events count tickets; classes and activities count guests', () => {
  const events = experienceBooking(host);
  assert.equal(events.countLabel, 'Tickets');
  assert.equal(events.count(1), '1 ticket');
  assert.equal(events.count(3), '3 tickets');
  assert.equal(events.action, 'Request tickets');
  const classes = experienceBooking({ subcategoryId: 'experiences_classes' });
  assert.equal(classes.countLabel, 'Guests');
  assert.equal(classes.count(1), '1 guest');
  assert.equal(classes.action, 'Request booking');
  assert.equal(experienceBooking({ subcategoryId: 'experiences_recreation' }).fact, 'sport');
});

test('a description that only restates the title gives way to the rest, and one line says who confirms', () => {
  assert.deepEqual(experienceDescription(ticket), { overview: 'Doors open early.' });
  assert.deepEqual(experienceDescription({ name: 'Other', description: 'A night of jazz. Bring friends.' }), { summary: 'A night of jazz.', overview: 'Bring friends.' });
  assert.deepEqual(experienceDescription({ name: 'Control Pass', description: 'Control Pass from Control Host.' }), {});
  assert.equal(hostConfirms('Control Host', false), 'Control Host confirms the date, time, venue and final price.');
  assert.equal(hostConfirms('Control Host', true), 'Control Host confirms the time, venue and final price.');
});

test('the listed total is the listed price times the count, and nothing without a price', () => {
  assert.match(listedTotal(ticket, 2) ?? '', /^KES\s37,000$/);
  assert.equal(listedTotal({ ...ticket, price: undefined }, 2), undefined);
  assert.equal(listedTotal({ ...ticket, isAvailable: false }, 2), undefined);
  assert.deepEqual(listedDates({ trip: { departures: [{ start: '2026-11-27' }, { start: '2026-11-01' }, { start: '2026-11-20' }] } }, '2026-11-09').map((date) => date.start), ['2026-11-20', '2026-11-27']);
  assert.deepEqual(listedDates({}, '2026-11-09'), []);
});

test('a request is kept in the store’s shelf on this device, beside its other hearts and requests', () => {
  const storage = new MemoryStorage();
  storage.setItem(shelfKey, JSON.stringify({ saved: ['other-item'], requests: { 'other-item': { answers: { date: '2026-12-01' }, savedAt: 'earlier' } } }));
  const request = { date: '2026-11-20', count: 2, savedAt: '2026-11-09T10:00:00.000Z' };
  assert.equal(writeExperienceRequest(storage, host.id, ticket.id, request), true);
  const shelf = JSON.parse(storage.getItem(shelfKey)!);
  assert.deepEqual(shelf.saved, ['other-item']);
  assert.deepEqual(shelf.requests[ticket.id], { answers: { date: '2026-11-20', adults: 2 }, savedAt: request.savedAt });
  assert.ok(shelf.requests['other-item']);
  assert.deepEqual(readExperienceRequest(storage, host.id, ticket.id, '2026-11-09'), request);
  assert.equal(readExperienceRequest(storage, host.id, ticket.id, '2026-11-21'), undefined, 'a request for a day that has passed is gone');
  writeExperienceRequest(storage, host.id, ticket.id);
  assert.equal(JSON.parse(storage.getItem(shelfKey)!).requests[ticket.id], undefined);

  const empty = new MemoryStorage();
  writeExperienceRequest(empty, host.id, ticket.id, request);
  writeExperienceRequest(empty, host.id, ticket.id);
  assert.equal(empty.getItem(shelfKey), null, 'an empty shelf leaves nothing behind');
  storage.setItem(shelfKey, '{not json');
  assert.equal(readExperienceRequest(storage, host.id, ticket.id, '2026-11-09'), undefined);
  assert.equal(writeExperienceRequest(undefined, host.id, ticket.id, request), false);
});

test('the booking card asks for a date and a count, shows the listed total and never claims a booking', () => {
  const render = (props: Partial<Parameters<typeof EventBooking>[0]> = {}) => renderToStaticMarkup(<EventBooking host="Control Host" item={ticket}
    booking={experienceBooking(host)} dates={[]} today="2026-11-09" choice={{ count: 2 }} onChange={noop} onRequest={noop} {...props} />);
  const open = render();
  assert.match(open, /Control Host confirms the date, time, venue and final price\./);
  assert.match(open, /Preferred date/);
  assert.match(open, /Choose a date/);
  assert.match(open, /Tickets/);
  assert.match(open, /<output[^>]*>2<\/output>/);
  assert.match(open, /2 tickets × KES\s18,500/);
  assert.match(open, /KES\s37,000/);
  assert.match(open, /Request tickets/);
  assert.doesNotMatch(open, /\b(whatsapp|deposit|pay|payment|confirmed|demo)\b|not provided/i);
  const listed = render({ dates: [{ start: '2026-11-20' }, { start: '2026-11-27' }] });
  assert.equal(listed.match(/type="radio"/g)?.length, 2);
  assert.match(listed, /20 Nov 2026/);
  assert.doesNotMatch(listed, /Preferred date/);
  const saved = render({ saved: true, kept: true, onRemove: noop, status: 'Saved on this device. Nothing has been sent to Control Host yet.', tone: 'saved' });
  assert.match(saved, /Request saved/);
  assert.match(saved, /Remove saved request/);
  assert.match(saved, /is-saved/);
  const closed = render({ item: { ...ticket, isAvailable: false } });
  assert.match(closed, /class="trip-booking__primary" disabled=""/);
  assert.doesNotMatch(closed, /Listed total/);
});
