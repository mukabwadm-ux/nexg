import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { describeRange, monthGrid, nightsBetween, selectDay, shiftMonth } from '../src/lib/calendar';
import { DatePicker } from '../src/components/DatePicker';
import { RentalTripPanel, TransferTripPanel, emptyRentalTrip, emptyTransferTrip, transferReady, transferSummary, tripReady, tripSummary } from '../src/components/cards/RentalTripPanel';
import { OfferingSheet } from '../src/components/cards/OfferingSheet';

const noop = () => {};

test('month grids are six Monday-first weeks', () => {
  const november = monthGrid(2026, 10);
  assert.equal(november.length, 6);
  assert.deepEqual([november[0]![0], november[0]![6], november[5]![6]], ['2026-10-26', '2026-11-01', '2026-12-06']);
  assert.equal(shiftMonth('2026-01-31', 1), '2026-02-28');
});

test('a range is a start click then an end click; an earlier or third click starts again', () => {
  const start = selectDay({}, '2026-11-14', 'range');
  assert.deepEqual(start, { from: '2026-11-14' });
  const finished = selectDay(start, '2026-11-17', 'range');
  assert.deepEqual(finished, { from: '2026-11-14', to: '2026-11-17' });
  assert.deepEqual(selectDay(finished, '2026-11-20', 'range'), { from: '2026-11-20' });
  assert.deepEqual(selectDay(start, '2026-11-10', 'range'), { from: '2026-11-10' });
  assert.deepEqual(selectDay(finished, '2026-11-20', 'single'), { from: '2026-11-20' });
  assert.equal(nightsBetween('2026-11-14', '2026-11-17'), 3);
  assert.match(describeRange(finished, 'range'), /14 Nov.*17 Nov · 3 days/);
  assert.equal(describeRange({}, 'range'), '');
});

test('the date picker starts closed, showing its choice or a prompt', () => {
  const empty = renderToStaticMarkup(<DatePicker label="Dates" mode="range" value={{}} onChange={noop} />);
  assert.match(empty, /Choose dates/);
  assert.match(empty, /aria-expanded="false"/);
  assert.match(renderToStaticMarkup(<DatePicker label="Date" mode="single" value={{ from: '2026-11-14' }} onChange={noop} />), /14 Nov/);
});

test('car hire asks for the trip first, and the trip fills each vehicle panel', () => {
  const trip = { ...emptyRentalTrip(), pickupPlace: 'JKIA', dates: { from: '2026-11-14', to: '2026-11-17' } };
  assert.equal(tripReady(emptyRentalTrip()), false);
  assert.equal(tripReady(trip), true);
  assert.equal(tripReady({ ...trip, sameReturn: false }), false);
  assert.match(tripSummary({ ...trip, driver: true }), /^JKIA · .*14 Nov.*17 Nov · 3 days · with a driver$/);
  const panel = renderToStaticMarkup(<RentalTripPanel trip={emptyRentalTrip()} onChange={noop} onShow={noop} />);
  assert.match(panel, /Plan your car hire/);
  assert.match(panel, /Show cars/);
  assert.match(panel, /disabled/);
  const merchant = { id: 'merchant-control', name: 'Control Hire', items: [] };
  const item = { id: 'item-control', merchantId: 'merchant-control', name: 'Control SUV', price: 6500, currency: 'KES' };
  const sheet = renderToStaticMarkup(<OfferingSheet merchant={merchant} item={item} kind="vehicle" saved={false} onSave={noop} onClose={noop} trip={trip} />);
  assert.match(sheet, /value="JKIA"/);
  assert.match(sheet, /14 Nov.*17 Nov · 3 days/);
  const bikes = renderToStaticMarkup(<RentalTripPanel trip={emptyRentalTrip()} vehicle="bike" onChange={noop} onShow={noop} />);
  assert.match(bikes, /Plan your bike hire/);
  assert.match(bikes, /Show bikes/);
  assert.doesNotMatch(bikes, /With a driver/);
});

test('transfers ask for the ride first, with meet & greet as a tick box', () => {
  const ride = { ...emptyTransferTrip(), pickup: 'JKIA Terminal 1A', dropoff: 'Westlands', date: '2026-11-14', time: '14:30', travellers: 2, bags: 3, meetGreet: true };
  assert.equal(transferReady(emptyTransferTrip()), false);
  assert.equal(transferReady(ride), true);
  assert.equal(transferReady({ ...ride, time: '' }), false);
  assert.match(transferSummary(ride), /^JKIA Terminal 1A → Westlands · .*14 Nov, 14:30 · 2 travellers · 3 bags · meet & greet$/);
  const panel = renderToStaticMarkup(<TransferTripPanel trip={emptyTransferTrip()} direction="dropoff" onChange={noop} onShow={noop} />);
  assert.match(panel, /Plan your transfer/);
  assert.match(panel, /Meet &amp; greet/);
  // A drop-off runs to the airport, so the airport is the drop-off example.
  assert.match(panel, /placeholder="e.g. your hotel or home address"/);
  assert.match(panel, /placeholder="e.g. JKIA Terminal 1A"/);
  assert.match(panel, /Show vehicles/);
  assert.match(panel, /disabled/);
});
