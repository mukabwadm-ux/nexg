import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBookingPrice } from '../src/pricing.js';
const time = (value: string) => Date.parse(value);
test('measured quantity prices use declared precision without money floats', () => {
  const result = calculateBookingPrice(
    { priceMinor: 12500, pricingBasis: 'per_quantity', quantityScale: 3 },
    null,
    null,
    1500,
  );
  assert.equal(result.totalMinor, 18750);
  assert.equal(result.units, 1.5);
});
test('duration pricing applies whole billing units and explicit minimum', () => {
  const result = calculateBookingPrice(
    {
      priceMinor: 10000,
      pricingBasis: 'per_duration',
      durationUnitMinutes: 60,
      minimumBillableUnits: 2,
    },
    0,
    61 * 60000,
    1,
  );
  assert.equal(result.units, 2);
  assert.equal(result.totalMinor, 20000);
});
test('night pricing counts Kenya local date boundaries', () => {
  const result = calculateBookingPrice(
    { priceMinor: 450000, pricingBasis: 'per_night' },
    time('2030-01-01T14:00:00+03:00'),
    time('2030-01-03T11:00:00+03:00'),
    1,
  );
  assert.equal(result.units, 2);
  assert.equal(result.totalMinor, 900000);
});
test('credited percentage fee has exact rounded minor units and clear balance', () => {
  const result = calculateBookingPrice(
    {
      priceMinor: 10001,
      reservationFee: {
        mode: 'percentage',
        percentageBps: 2500,
        treatment: 'credited_to_total',
        requiredBeforeConfirmation: true,
      },
    },
    null,
    null,
    1,
  );
  assert.equal(result.serviceSubtotalMinor, 10001);
  assert.equal(result.reservationFeeMinor, 2501);
  assert.equal(result.totalDueMinor, 10001);
  assert.equal(result.dueNowMinor, 2501);
  assert.equal(result.balanceMinor, 7500);
});
test('additional reservation fee increases total without double-counting balance', () => {
  const result = calculateBookingPrice(
    {
      priceMinor: 10000,
      reservationFee: {
        mode: 'fixed',
        amountMinor: 2000,
        treatment: 'applied_in_addition',
        requiredBeforeConfirmation: true,
      },
    },
    null,
    null,
    1,
  );
  assert.equal(result.totalDueMinor, 12000);
  assert.equal(result.dueNowMinor, 2000);
  assert.equal(result.balanceMinor, 10000);
});
test('no fee keeps due-now zero and quoted service price unchanged', () => {
  const result = calculateBookingPrice({ priceMinor: 10000 }, null, null, 1);
  assert.equal(result.reservationFeeMinor, 0);
  assert.equal(result.dueNowMinor, 0);
  assert.equal(result.totalDueMinor, 10000);
});
test('credited fees above total and unsafe totals fail closed', () => {
  assert.throws(() =>
    calculateBookingPrice(
      {
        priceMinor: 10000,
        reservationFee: { mode: 'fixed', amountMinor: 10001, treatment: 'credited_to_total' },
      },
      null,
      null,
      1,
    ),
  );
  assert.throws(() =>
    calculateBookingPrice(
      { priceMinor: 1000000000, pricingBasis: 'per_quantity' },
      null,
      null,
      1000000000,
    ),
  );
});
