import { describe, expect, it } from 'vitest';

import { businessInitials } from './business-initials';

describe('business badge initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(businessInitials('Deck Supplies')).toBe('DS');
    expect(businessInitials('kuku choma restaurant')).toBe('KC');
    expect(businessInitials('Fish & Chips Co.')).toBe('FC');
  });

  it('takes two letters of a one-word name and falls back without one', () => {
    expect(businessInitials('Razzors')).toBe('RA');
    expect(businessInitials('  ')).toBe('ME');
    expect(businessInitials(null)).toBe('ME');
  });
});
