import { describe, expect, it } from 'vitest';

import { kenyanMobile } from './phone-confirm';

describe('kenyanMobile', () => {
  it('reads the common ways a Kenyan mobile is typed', () => {
    for (const typed of ['0712 345 678', '254712345678', '+254 712 345 678', '712345678']) {
      expect(kenyanMobile(typed)).toBe('+254712345678');
    }
    expect(kenyanMobile('0110 123 456')).toBe('+254110123456');
  });

  it('refuses anything else', () => {
    for (const typed of ['', '12345', '0212 345 678', '+44 7700 900123']) {
      expect(kenyanMobile(typed)).toBeNull();
    }
  });
});
