import { describe, expect, it } from 'vitest';

import { durationLabel, estimateCents, lengthChoice, nairobiDate, priceLabel } from './customer';

const base = { price_cents: 150000, quote_required: false } as const;

describe('customer booking helpers', () => {
  it('labels prices, including on-request ones', () => {
    expect(priceLabel({ ...base, price_unit: 'booking' })).toBe('KES 1,500');
    expect(priceLabel({ ...base, price_unit: 'day' })).toBe('KES 1,500 per day');
    expect(priceLabel({ ...base, price_unit: 'booking', quote_required: true })).toBe(
      'Price on request',
    );
    expect(priceLabel({ price_cents: null, price_unit: 'hour', quote_required: false })).toBe(
      'Price on request',
    );
  });

  it('estimates totals the way the database prices them', () => {
    expect(estimateCents({ ...base, price_unit: 'hour' }, 90)).toBe(300000);
    expect(estimateCents({ ...base, price_unit: 'day' }, 2 * 1440)).toBe(300000);
    expect(estimateCents({ ...base, price_unit: 'seat' }, 120, 3)).toBe(450000);
    expect(estimateCents({ ...base, price_unit: 'booking' }, 600)).toBe(150000);
    expect(estimateCents({ ...base, price_unit: 'booking', quote_required: true }, 60)).toBeNull();
  });

  it('asks for a length only when the resource has none', () => {
    expect(lengthChoice({ duration_minutes: 45, price_unit: 'booking' })).toEqual({
      kind: 'fixed',
      minutes: 45,
    });
    expect(lengthChoice({ duration_minutes: null, price_unit: 'day' }).kind).toBe('days');
    expect(lengthChoice({ duration_minutes: null, price_unit: 'hour' }).kind).toBe('hours');
  });

  it('formats durations and Nairobi dates', () => {
    expect(durationLabel(90)).toBe('1 hr 30 min');
    expect(durationLabel(1440)).toBe('1 day');
    // 22:30 UTC is already the next day in Nairobi (UTC+3).
    expect(nairobiDate(new Date('2026-11-10T22:30:00Z'))).toBe('2026-11-11');
    expect(nairobiDate(new Date('2026-11-10T08:00:00Z'), 2)).toBe('2026-11-12');
  });
});
