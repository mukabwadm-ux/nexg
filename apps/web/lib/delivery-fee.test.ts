import { describe, expect, it } from 'vitest';

import { deliveryFeeForKm, deliveryQuote, type DeliveryRate } from './delivery-fee';

const RATE: DeliveryRate = { base: 80, perKm: 25, maxKm: 15 };

describe('deliveryFeeForKm', () => {
  it('charges the base fee for the first kilometre', () => {
    expect(deliveryFeeForKm(0.4, RATE)).toEqual({ kind: 'quote', fee: 80, km: 0.4 });
    expect(deliveryFeeForKm(1, RATE)).toMatchObject({ fee: 80 });
  });

  it('adds the per-km rate for each commenced kilometre after the first, as checkout does', () => {
    /* 3.2 km -> 4 commenced -> 80 + 3 x 25 */
    expect(deliveryFeeForKm(3.2, RATE)).toMatchObject({ fee: 155, km: 3.2 });
    /* 1.04 km rounds to 1.0, so it is still the base fee */
    expect(deliveryFeeForKm(1.04, RATE)).toMatchObject({ fee: 80 });
    expect(deliveryFeeForKm(1.06, RATE)).toMatchObject({ fee: 105 });
  });

  it('gives no price past the maximum distance', () => {
    expect(deliveryFeeForKm(15.2, RATE)).toEqual({ kind: 'too_far', km: 15.2, maxKm: 15 });
    expect(deliveryFeeForKm(15, RATE)).toMatchObject({ kind: 'quote', fee: 430 });
  });
});

describe('deliveryQuote', () => {
  it('shows the base fee as "from" without a spot or a pin', () => {
    expect(deliveryQuote(RATE, null, { lat: -1.26, lng: 36.8 })).toEqual({ kind: 'from', fee: 80 });
    expect(deliveryQuote(RATE, { lat: -1.26, lng: 36.8 }, { lat: null, lng: null })).toEqual({
      kind: 'from',
      fee: 80,
    });
  });

  it('prices from the spot to the pin', () => {
    const quote = deliveryQuote(RATE, { lat: -1.2676, lng: 36.8108 }, { lat: -1.265, lng: 36.803 });
    expect(quote).toMatchObject({ kind: 'quote', fee: 80 });
  });
});
