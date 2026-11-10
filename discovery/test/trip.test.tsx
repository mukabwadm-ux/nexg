import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CatalogItem, Merchant } from '../src/providers/DiscoveryProvider';
import { departureLabel, missingDetailsNote, splitDescription, tripFacts, tripPrice, upcomingDepartures } from '../src/components/tours/tripFormat';
import { TripFacts } from '../src/components/tours/TripFacts';
import { TripBooking } from '../src/components/tours/TripBooking';
import { TripIncluded, TripItinerary, TripNote, TripOverview, TripPhotos } from '../src/components/tours/TripSections';

// Isolated presentation controls, never catalog data.
const merchant: Merchant = { id: 'operator-control', name: 'Control Operator', area: 'Kilimani', items: [] };
const listing: CatalogItem = { id: 'trip-control', merchantId: merchant.id, name: 'Control Trip', price: 93000, currency: 'KES', description: 'A short first line. More detail follows here.' };
const complete: CatalogItem = { ...listing, trip: {
  duration: '3 days / 2 nights', location: 'Control Reserve', travelStyle: ['Safari', 'Family', 'Group'], bestTime: 'July–October',
  highlights: ['Big views'], itinerary: [{ title: 'Arrive', description: 'Afternoon drive.' }, { title: 'Full day' }, { title: 'Return' }],
  included: ['Park fees'], excluded: ['Flights'], addOns: ['Balloon flight', 'Village visit'], departures: [{ start: '2026-11-13', end: '2026-11-15' }],
} };
const noop = () => {};

test('a listing without trip facts shows only what it says, and the operator base is never the destination', () => {
  const facts = tripFacts(listing, merchant, 'Game Drives');
  assert.deepEqual(facts.map((fact) => fact.key), ['type', 'base', 'price']);
  assert.deepEqual(facts.slice(0, 2).map((fact) => fact.value), ['Game Drives', 'Kilimani']);
  assert.match(facts[2]!.value, /^From KES\s93,000$/);
  assert.equal(facts[1]!.label, 'Operator based in');
  const html = renderToStaticMarkup(<TripFacts facts={facts} />);
  assert.match(html, /Operator based in/);
  assert.doesNotMatch(html, /Not provided/);
  assert.equal(tripPrice({ price: undefined, currency: 'KES' }), 'Price on request');
  assert.deepEqual(tripFacts({ ...listing, price: undefined }, { ...merchant, area: undefined }).map((fact) => fact.value), ['Price on request']);
});

test('supplied trip facts replace the listing facts', () => {
  const facts = tripFacts(complete, merchant, 'Game Drives');
  assert.deepEqual(facts.map((fact) => fact.key), ['duration', 'location', 'style', 'season']);
  assert.equal(facts[2]!.value, 'Safari · Family · Group');
});

test('departures read as compact date ranges and past ones drop off', () => {
  assert.equal(departureLabel({ start: '2026-11-13', end: '2026-11-15' }), '13–15 Nov 2026');
  assert.equal(departureLabel({ start: '2026-11-28', end: '2026-12-02' }), '28 Nov – 2 Dec 2026');
  assert.equal(departureLabel({ start: '2026-12-30', end: '2027-01-02' }), '30 Dec 2026 – 2 Jan 2027');
  assert.equal(departureLabel({ start: '2026-11-13' }), '13 Nov 2026');
  assert.deepEqual(upcomingDepartures({ departures: [{ start: '2026-12-04' }, { start: '2026-11-01' }, { start: '2026-11-20' }] }, '2026-11-08').map((entry) => entry.start), ['2026-11-20', '2026-12-04']);
});

test('one honest note covers whatever the operator has not listed', () => {
  assert.equal(missingDetailsNote(undefined, 'Control Operator'), 'Control Operator shares the day-by-day plan, inclusions and departure dates when you send a request.');
  assert.equal(missingDetailsNote({ ...complete.trip, departures: [] }, 'Control Operator'), 'Control Operator shares departure dates when you send a request.');
  assert.equal(missingDetailsNote(complete.trip, 'Control Operator'), undefined);
  assert.deepEqual(splitDescription(listing.description), { summary: 'A short first line.', overview: 'More detail follows here.' });
  assert.deepEqual(splitDescription('Only one line'), { summary: 'Only one line' });
});

test('the booking card asks for dates and travellers and never claims a booking', () => {
  const render = (props: Partial<Parameters<typeof TripBooking>[0]> = {}) => renderToStaticMarkup(<TripBooking operator="Control Operator" price="From KES 93,000" departures={[]}
    choice={{ dates: {}, travellers: 2 }} onChange={noop} today="2026-11-08" onCustomise={noop} {...props} />);
  const open = render();
  assert.match(open, /Control Operator confirms the price and availability for your dates and group\./);
  assert.match(open, /Choose dates/);
  assert.match(open, /Request booking/);
  assert.match(open, /Customise this tour/);
  assert.match(open, /<output[^>]*>2<\/output>/);
  assert.doesNotMatch(open, /\b(whatsapp|deposit|pay|payment|confirmed)\b/i);
  const listed = render({ departures: [{ start: '2026-11-13', end: '2026-11-15' }, { start: '2026-12-04', end: '2026-12-06' }] });
  assert.equal(listed.match(/type="radio"/g)?.length, 2);
  assert.match(listed, /13–15 Nov 2026/);
  const closed = render({ unavailable: true });
  assert.match(closed, /class="trip-booking__primary" disabled=""/);
  assert.match(closed, /Currently unavailable/);
});

test('itinerary, inclusions and photos render only when supplied', () => {
  assert.equal(renderToStaticMarkup(<TripItinerary />), '');
  assert.equal(renderToStaticMarkup(<TripIncluded />), '');
  assert.equal(renderToStaticMarkup(<TripOverview />), '');
  assert.equal(renderToStaticMarkup(<TripNote />), '');
  const days = renderToStaticMarkup(<TripItinerary days={complete.trip!.itinerary} />);
  assert.match(days, /3-day itinerary/);
  assert.match(days, /Day 1/);
  const included = renderToStaticMarkup(<TripIncluded included={['Park fees']} excluded={['Flights']} addOns={['Balloon flight', 'Village visit']} />);
  assert.match(included, /<details/);
  assert.match(included, /Not included/);
  assert.match(included, /Optional add-ons · Balloon flight and Village visit/);
  assert.match(renderToStaticMarkup(<TripPhotos photos={['a.jpg']} name="Control Trip" />), /trip-photos--single/);
  assert.match(renderToStaticMarkup(<TripPhotos photos={['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']} name="Control Trip" />), /trip-photos--3/);
});
