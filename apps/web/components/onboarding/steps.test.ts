import { describe, expect, it } from 'vitest';

import { pathForStep } from './types';

describe('merchant onboarding step routes', () => {
  it('places location before business category selection', () => {
    expect(pathForStep(2)).toBe('/merchants/apply/location');
    expect(pathForStep(3)).toBe('/merchants/apply/category');
  });
});
