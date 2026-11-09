import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CATEGORY_AGREEMENT,
  INTERIM,
  MERCHANT_AGREEMENTS,
  MERCHANT_AGREEMENTS_PUBLISHED_ON,
  agreementForCategory,
  merchantAgreementHref,
} from './merchant-agreements';
import { MERCHANT_TAXONOMY } from './taxonomy';

const publicDir = resolve(__dirname, '../../../apps/web/public');

describe('merchant agreements', () => {
  it('gives every merchant category exactly one known agreement', () => {
    const categories = MERCHANT_TAXONOMY.map((category) => category.id).sort();
    expect(Object.keys(CATEGORY_AGREEMENT).sort()).toEqual(categories);
    for (const id of categories) expect(agreementForCategory(id)).toBeDefined();
    expect(agreementForCategory('nope')).toBeUndefined();
    expect(agreementForCategory(null)).toBeUndefined();
  });

  it('uses each of the 18 agreements, with three interim categories', () => {
    expect(MERCHANT_AGREEMENTS).toHaveLength(18);
    expect(new Set(Object.values(CATEGORY_AGREEMENT)).size).toBe(18);
    expect([...INTERIM].sort()).toEqual(['concierge_services', 'health', 'vehicle_rentals']);
    expect(agreementForCategory('vehicle_rentals')?.id).toBe('vehicle-services');
    expect(agreementForCategory('health')?.id).toBe('wellness');
    expect(agreementForCategory('concierge_services')?.id).toBe('marketplace');
    expect(agreementForCategory('laundry_cleaning')?.id).toBe('laundry-and-cleaning');
  });

  it('matches every published PDF to its recorded version', () => {
    for (const agreement of MERCHANT_AGREEMENTS) {
      const file = resolve(publicDir, `.${merchantAgreementHref(agreement)}`);
      expect(existsSync(file), file).toBe(true);
      const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
      expect(sha256, agreement.id).toBe(agreement.sha256);
      expect(agreement.version).toBe(`${MERCHANT_AGREEMENTS_PUBLISHED_ON}+${sha256.slice(0, 12)}`);
    }
  });
});
