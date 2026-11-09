import { describe, expect, it } from 'vitest';

import { BOOKING_REGISTRY_REVISION, baseSubcategoryId, getBookingProfile } from '../src/index';
import { listOnboardingCategories, resolveOnboardingSelection } from '../src/onboarding';
import { registry } from '../src/registry';
import { SUBCATEGORY_VARIANTS, VARIANT_REGISTRY_REVISION } from '../src/variants';

const laundryIds = [
  'laundry',
  'dry_cleaning',
  'ironing',
  'home_cleaning',
  'office_cleaning',
  'wash_and_fold',
  'stain_removal',
  'clothing_alterations',
  'curtain_cleaning',
  'carpet_cleaning',
  'wedding_gown_cleaning',
  'corporate_uniform_laundry',
  'fumigation',
  'express_laundry',
  'laundry_pickup_delivery',
  'garment_care',
  'laundry_order_tracking',
];

describe('subcategory variants', () => {
  it('lists every Laundry & Cleaning subcategory once, under its category', () => {
    const laundry = listOnboardingCategories().find((c) => c.id === 'laundry_cleaning');
    expect(laundry?.name).toBe('Laundry & Cleaning');
    expect(laundry?.subcategories.map((s) => s.id).sort()).toEqual([...laundryIds].sort());
    expect(laundry?.subcategories.find((s) => s.id === 'express_laundry')?.name).toBe(
      'Express Laundry (2-hour service)',
    );
  });

  it('uses the base profile booking model, questions and rules, with unique rule ids', () => {
    for (const variant of SUBCATEGORY_VARIANTS) {
      const profile = registry.profiles.find((p) => p.subcategoryId === variant.subcategoryId);
      const base = registry.profiles.find((p) => p.subcategoryId === variant.baseSubcategoryId);
      expect(profile && base).toBeTruthy();
      expect(profile!.categoryId).toBe(base!.categoryId);
      expect(profile!.defaultModelId).toBe(base!.defaultModelId);
      expect(profile!.candidateModelIds).toEqual(base!.candidateModelIds);
      expect(profile!.sourceQuestionIds).toEqual(base!.sourceQuestionIds);
      expect(baseSubcategoryId(variant.subcategoryId)).toBe(variant.baseSubcategoryId);
      expect(getBookingProfile(variant.subcategoryId)?.defaultModelId).toBe(base!.defaultModelId);
    }
    const ruleIds = registry.profiles.flatMap((p) => p.rules.map((r) => r.id));
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
  });

  it('maps pickup laundry to linked windows and fumigation to a field visit', () => {
    expect(getBookingProfile('wash_and_fold')?.defaultModelId).toBe('LINKED_WINDOWS');
    expect(getBookingProfile('carpet_cleaning')?.defaultModelId).toBe('LINKED_WINDOWS');
    expect(getBookingProfile('fumigation')?.defaultModelId).toBe('FIELD_VISIT');
    expect(baseSubcategoryId('laundry')).toBe('laundry');
  });

  it('accepts a variant in an onboarding selection', () => {
    const result = resolveOnboardingSelection('laundry_cleaning', ['wash_and_fold', 'fumigation']);
    expect(result.issues).toEqual([]);
  });

  it('carries its own registry revision', () => {
    expect(BOOKING_REGISTRY_REVISION).toBe(VARIANT_REGISTRY_REVISION);
    expect(VARIANT_REGISTRY_REVISION).not.toBe('nexg-booking-2026-10-31.1');
  });
});
