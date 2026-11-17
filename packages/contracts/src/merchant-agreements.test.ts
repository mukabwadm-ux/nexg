import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CATEGORY_AGREEMENT,
  INTERIM,
  MERCHANT_AGREEMENTS,
  MERCHANT_AGREEMENTS_PUBLISHED_ON,
  MerchantAgreementDetails,
  agreementForCategory,
  emptyAgreementDetails,
  merchantAgreementHref,
} from './merchant-agreements';
import { MERCHANT_TAXONOMY } from './taxonomy';

const publicDir = resolve(__dirname, '../../../apps/web/public');

describe('merchant agreements', () => {
  it('gives every merchant category exactly one known agreement', () => {
    const categories = MERCHANT_TAXONOMY.map((category) => category.id).sort();
    // The 21 listed categories plus the retired ones, kept for past acceptances.
    expect(Object.keys(CATEGORY_AGREEMENT).sort()).toEqual(
      [...categories, 'financial_services', 'health', 'vehicle_services'].sort(),
    );
    for (const id of categories) expect(agreementForCategory(id)).toBeDefined();
    expect(agreementForCategory('nope')).toBeUndefined();
    expect(agreementForCategory(null)).toBeUndefined();
  });

  it('uses each of the 18 agreements, with six interim categories', () => {
    expect(MERCHANT_AGREEMENTS).toHaveLength(18);
    expect(new Set(Object.values(CATEGORY_AGREEMENT)).size).toBe(18);
    expect([...INTERIM].sort()).toEqual([
      'concierge_services',
      'games_sports',
      'health',
      'movers_relocation',
      'premium_services',
      'vehicle_rentals',
    ]);
    expect(agreementForCategory('movers_relocation')?.id).toBe('logistics-and-shipping');
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

describe('merchant agreement details', () => {
  const valid = {
    legal_name: '  Glow   Beauty Limited ',
    registration_number: 'pvt-glow99',
    kra_pin: 'p 051234567x',
    address: 'Shop 9, Yaya Centre, Nairobi',
    postal_address: '',
    signatory_name: 'Wanjiku Owner',
    signatory_title: 'Director',
    representative_name: 'Otieno Manager',
    representative_title: 'Operations Manager',
    principal_name: 'Wanjiku Owner',
  };

  it('tidies the details the way the database stores them', () => {
    expect(MerchantAgreementDetails.parse(valid)).toEqual({
      ...valid,
      legal_name: 'Glow Beauty Limited',
      registration_number: 'PVT-GLOW99',
      kra_pin: 'P051234567X',
      postal_address: null,
    });
  });

  it('lets the registration number wait, but not the KRA PIN', () => {
    expect(
      MerchantAgreementDetails.parse({ ...valid, registration_number: ' ' }).registration_number,
    ).toBeNull();
    const result = MerchantAgreementDetails.safeParse({ ...valid, kra_pin: 'P05123' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Enter the KRA PIN: a letter, nine digits and a letter, for example P051234567X.',
    );
    expect(MerchantAgreementDetails.safeParse({ ...valid, iban: 'x' }).success).toBe(false);
  });

  it('starts empty', () => {
    expect(Object.keys(emptyAgreementDetails()).sort()).toEqual(Object.keys(valid).sort());
  });
});
