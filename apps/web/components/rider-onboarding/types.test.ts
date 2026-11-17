import { describe, expect, it } from 'vitest';

import { offeredRiderCities, type CityOption } from './types';

const city = (slug: string, status: CityOption['status']): CityOption => ({
  id: `${slug}-id`,
  name: slug,
  slug,
  status,
});

describe('offeredRiderCities', () => {
  it('offers Nairobi and the waitlist cities, not the other open cities', () => {
    const cities = [
      city('nairobi', 'live'),
      city('mombasa', 'live'),
      city('kisumu', 'live'),
      city('nakuru', 'soft_launch'),
      city('kampala', 'waitlist'),
    ];
    expect(offeredRiderCities(cities).map((c) => c.slug)).toEqual(['nairobi', 'kampala']);
  });
});
