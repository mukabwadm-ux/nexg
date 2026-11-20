import { describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({ default: () => () => null }));

import { formatPin, parsePin } from './map-pin-field';

describe('the onboarding map pin', () => {
  it('writes a picked spot the way the field expects it', () => {
    const text = formatPin({ lat: -1.28641234, lng: 36.81721234 });
    expect(text).toBe('-1.286412, 36.817212');
    // The database pattern for map_pin (20270110410100).
    expect(text).toMatch(/^-?[0-9]{1,2}(\.[0-9]+)?, *-?[0-9]{1,3}(\.[0-9]+)?$/);
  });

  it('reads a typed or saved pin back onto the map', () => {
    expect(parsePin(' -1.2864, 36.8172 ')).toEqual({ lat: -1.2864, lng: 36.8172 });
    expect(parsePin('near the market')).toBeNull();
    expect(parsePin('95, 36')).toBeNull();
  });
});
