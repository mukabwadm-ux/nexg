import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { addMonths, displayQuantity, fromKenyaInput, kenyaDate, kesInputToMinor, localDateTime, overlapsDay, quantityInputToMinor } from './format';
import type { BookingRecord } from './types';

const reservation: BookingRecord = {
  id: 'test-booking', offeringId: 'test-offering', offeringName: 'Test interval', model: 'ASSET_INTERVAL',
  resourceIds: ['test-asset'], startTime: '2026-10-31T21:00:00+03:00', endTime: '2026-11-01T00:00:00+03:00',
  quantity: 1, customer: { name: 'Test customer' }, status: 'confirmed', version: 1, priceMinor: 10000, currency: 'KES',
};

describe('merchant booking date and amount entry', () => {
  it('shows Kenya midnight on the correct date and round-trips its instant', () => {
    assert.equal(kenyaDate('2026-10-31T20:59:59Z'), '2026-10-31');
    assert.equal(kenyaDate('2026-10-31T21:00:00Z'), '2026-11-01');
    assert.equal(localDateTime('2026-10-31T21:00:00Z'), '2026-11-01T00:00');
    assert.equal(fromKenyaInput('2026-11-01T00:00'), '2026-10-31T21:00:00.000Z');
  });

  it('rejects impossible dates rather than moving a booking into another month', () => {
    assert.throws(() => fromKenyaInput('2026-02-31T12:00'));
  });

  it('navigates a calendar month from long-month dates without skipping February', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-01');
    assert.equal(addMonths('2026-03-31', -1), '2026-02-01');
  });

  it('does not occupy the following day when a reservation ends at midnight', () => {
    assert.equal(overlapsDay(reservation, '2026-10-31'), true);
    assert.equal(overlapsDay(reservation, '2026-11-01'), false);
  });

  it('keeps indicative intervals out of reserved calendar capacity', () => {
    assert.equal(overlapsDay({ ...reservation, executionMode: 'request_capture' }, '2026-10-31'), false);
    assert.equal(overlapsDay({ ...reservation, startTime: null, endTime: null }, '2026-10-31'), false);
  });

  it('preserves decimal money and measured storage quantities in integer units', () => {
    assert.equal(kesInputToMinor('0.10'), 10);
    assert.equal(kesInputToMinor('1250.75'), 125075);
    assert.equal(quantityInputToMinor('1.25', 2), 125);
    assert.equal(displayQuantity(125, 2, 'sqm'), '1.25 sqm');
    assert.throws(() => quantityInputToMinor('1.25', 0));
    assert.throws(() => kesInputToMinor('1250.755'));
  });
});
