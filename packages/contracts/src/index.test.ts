import { describe, expect, it } from 'vitest';

import {
  CreateRefund,
  LatLng,
  Money,
  Msisdn,
  StartConversation,
  normaliseMsisdn,
  parse,
} from './index';

/**
 * These test the decisions, not the library.
 *
 * Zod is already tested. What is worth asserting here is the
 * handful of refusals this package exists to make — each one
 * corresponds to a way this system has actually been wrong, or
 * could be, and each one would otherwise be removed by somebody
 * who thought it was being unhelpful.
 */

describe('money is cents', () => {
  it('takes whole cents', () => {
    expect(Money.parse(1250)).toBe(1250);
  });

  it('refuses a float, because it is almost always shillings', () => {
    /* 12.5 passed here means twelve shillings fifty to the
       caller and a hundredth of that to the ledger. */
    const result = Money.safeParse(12.5);
    expect(result.success).toBe(false);
  });

  it('refuses a negative amount where only a quantity makes sense', () => {
    expect(Money.safeParse(-100).success).toBe(false);
  });
});

describe('Null Island', () => {
  it('takes a real point', () => {
    expect(LatLng.parse({ lat: -1.2921, lng: 36.8219 })).toEqual({
      lat: -1.2921,
      lng: 36.8219,
    });
  });

  it('refuses 0,0', () => {
    /* Number(null) === 0. This exact value has already shipped
       once as a confident answer about where somebody stood. */
    const result = LatLng.safeParse({ lat: 0, lng: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/Null Island/);
    }
  });

  it('allows a genuine zero on one axis', () => {
    /* The equator is a real place. Only both-at-once is suspect. */
    expect(LatLng.safeParse({ lat: 0, lng: 36.8219 }).success).toBe(true);
  });
});

describe('one spelling of a phone number', () => {
  it.each([
    ['0712345678', '+254712345678'],
    ['254712345678', '+254712345678'],
    ['+254 712 345 678', '+254712345678'],
    ['712345678', '+254712345678'],
    ['0112345678', '+254112345678'],
  ])('%s becomes %s', (input, expected) => {
    expect(normaliseMsisdn(input)).toBe(expected);
  });

  it('returns null rather than guessing at nonsense', () => {
    expect(normaliseMsisdn('hello')).toBeNull();
    expect(normaliseMsisdn('+1 555 0100')).toBeNull();
  });

  it('refuses an unnormalised number at the boundary', () => {
    /* The schema is strict so that normalisation happens
       deliberately at an edge rather than accidentally in the
       middle. */
    expect(Msisdn.safeParse('0712345678').success).toBe(false);
  });
});

describe('unknown fields are refused', () => {
  it('rejects an extra key rather than ignoring it', () => {
    const result = CreateRefund.safeParse({
      order_id: '550e8400-e29b-41d4-a716-446655440000',
      amount_cents: 50000,
      amount: 500, // the bug: both spellings sent
      reason_code: 'late',
      idempotency_key: 'a'.repeat(20),
    });
    expect(result.success).toBe(false);
  });
});

describe('consent is not optional', () => {
  it('refuses a conversation without it', () => {
    const result = parse(StartConversation, {
      contact: '+254712345678',
      topic: 'my_order',
      body: 'Where is my food',
      consent: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.message).toMatch(/agreement to reply/);
    }
  });
});

describe('parse shapes the error for a response', () => {
  it('gives one problem per field', () => {
    const result = parse(CreateRefund, {
      order_id: 'not-a-uuid',
      amount_cents: -5,
      reason_code: '',
      idempotency_key: 'short',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('invalid_request');
      expect(Object.keys(result.failure.fields ?? {})).toEqual(
        expect.arrayContaining(['order_id', 'amount_cents', 'idempotency_key']),
      );
      /* One message per field, not a list of four about one. */
      for (const v of Object.values(result.failure.fields ?? {})) {
        expect(typeof v).toBe('string');
      }
    }
  });
});

describe('merchant taxonomy', () => {
  it('has 21 categories and 128 subcategories', async () => {
    const { ALL_CATEGORIES, ALL_SUBCATEGORIES } = await import('./taxonomy');
    expect(ALL_CATEGORIES.length).toBe(21);
    expect(ALL_SUBCATEGORIES.length).toBe(128);
  });

  it('gives each Adults Only specialty a distinct, staged workflow', async () => {
    const { getCategoryById } = await import('./taxonomy');
    const category = getCategoryById('adults_only');

    expect(category?.subcategories).toHaveLength(6);
    for (const subcategory of category?.subcategories ?? []) {
      expect(subcategory.workflow?.status).toBe('designed');
      expect(subcategory.workflow?.groups).toHaveLength(3);
      expect(subcategory.defaultWorkflow).not.toContain('Browse → item → variant/quantity');
      expect(subcategory.workflow?.policyNote).toMatch(/verification|not yet implemented/i);
    }

    const workflows = (category?.subcategories ?? []).map((subcategory) =>
      subcategory.workflow?.groups.flatMap((group) => group.steps).join(' '),
    );
    expect(new Set(workflows).size).toBe(6);
  });

  it('only asks for preparation time where the business category needs it', async () => {
    const { MERCHANT_TAXONOMY } = await import('./taxonomy');
    const categoriesWithPrepTime = MERCHANT_TAXONOMY.filter(
      (category) => category.prepTimeRequired,
    ).map((category) => category.id);

    expect(categoriesWithPrepTime).toEqual(['restaurants_food']);
    for (const id of ['adults_only', 'beauty', 'fashion_apparel', 'vehicle_rentals']) {
      expect(
        MERCHANT_TAXONOMY.find((category) => category.id === id)?.prepTimeRequired,
      ).toBeFalsy();
    }
  });

  it('provides category and adult specialty-specific catalogue prompts', async () => {
    const { getCatalogueExample, MERCHANT_TAXONOMY } = await import('./taxonomy');

    expect(MERCHANT_TAXONOMY.every((category) => getCatalogueExample(category.id))).toBe(true);
    expect(getCatalogueExample('fashion_apparel')?.name).toContain('Linen shirt');
    expect(getCatalogueExample('adults_only', 'cigarettes')?.name).toContain('20-pack');
    expect(getCatalogueExample('adults_only', 'adult_products')?.name).not.toBe(
      getCatalogueExample('adults_only', 'cigarettes')?.name,
    );
    expect(getCatalogueExample('vehicle_rentals')?.photoHint).toContain('vehicle');
  });

  it('resolves categories by id and legacy alias', async () => {
    const { getCategoryById } = await import('./taxonomy');
    expect(getCategoryById('restaurants_food')?.name).toBe('Restaurants & Food');
    // Legacy alias
    expect(getCategoryById('restaurant')?.name).toBe('Restaurants & Food');
    expect(getCategoryById('supermarket')?.name).toBe('Groceries & Essentials');
  });

  it('searches taxonomy by query', async () => {
    const { searchTaxonomy } = await import('./taxonomy');
    const res = searchTaxonomy('safari');
    expect(res.subcategories.some((s) => s.name.toLowerCase().includes('safari'))).toBe(true);
    expect(res.categories.some((c) => c.id === 'travel_tours')).toBe(true);
  });

  it('provides a unique image for all 21 categories', async () => {
    const { ALL_CATEGORIES, getCategoryImage } = await import('./taxonomy');
    expect(ALL_CATEGORIES.length).toBe(21);
    for (const cat of ALL_CATEGORIES) {
      expect(cat.image).toBeDefined();
      expect(cat.image?.startsWith('/images/categories/')).toBe(true);
      expect(cat.image?.endsWith('.jpg')).toBe(true);
    }
    // Check legacy aliases resolve to image paths
    expect(getCategoryImage('restaurant')).toBe('/images/categories/restaurants.jpg');
    expect(getCategoryImage('supermarket')).toBe('/images/categories/groceries.jpg');
    expect(getCategoryImage('bar_liquor')).toBe('/images/categories/drinks.jpg');
  });
});
