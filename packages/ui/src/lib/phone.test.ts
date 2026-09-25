import { describe, expect, it } from 'vitest';

import { formatAsYouType, fromE164, normaliseNationalInput, toE164 } from './phone';

describe('normaliseNationalInput', () => {
  it('strips non-digits and the trunk zero', () => {
    expect(normaliseNationalInput('0712 345 678')).toBe('712345678');
    expect(normaliseNationalInput('(0712)-345-678')).toBe('712345678');
  });
});

describe('toE164', () => {
  it('converts a Kenyan mobile typed with a leading zero', () => {
    expect(toE164('0712345678', 'KE')).toBe('+254712345678');
  });

  it('converts a Kenyan mobile typed without the zero', () => {
    expect(toE164('712345678', 'KE')).toBe('+254712345678');
  });

  it('handles Safaricom 011x numbers', () => {
    expect(toE164('0110123456', 'KE')).toBe('+254110123456');
  });

  it('returns null for an incomplete number', () => {
    expect(toE164('712', 'KE')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(toE164('', 'KE')).toBeNull();
  });

  it('respects the selected country', () => {
    expect(toE164('0712345678', 'UG')).toBe('+256712345678');
  });
});

describe('fromE164', () => {
  it('round-trips a stored value', () => {
    expect(fromE164('+254712345678')).toEqual({ country: 'KE', national: '712345678' });
  });

  it('returns null for junk', () => {
    expect(fromE164('not-a-number')).toBeNull();
    expect(fromE164(null)).toBeNull();
  });
});

describe('formatAsYouType', () => {
  it('groups digits for readability', () => {
    expect(formatAsYouType('712345678', 'KE')).toBe('712 345678');
  });
});
