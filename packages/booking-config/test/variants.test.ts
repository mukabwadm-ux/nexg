import { describe, expect, it } from 'vitest';

import { BOOKING_REGISTRY_REVISION, baseSubcategoryId, getBookingProfile } from '../src/index';
import { listOnboardingCategories, resolveOnboardingSelection } from '../src/onboarding';
import { registry } from '../src/registry';
import {
  isListedSubcategory,
  SUBCATEGORY_VARIANTS,
  VARIANT_REGISTRY_REVISION,
} from '../src/variants';

const laundryIds = [
  'washing_dry_cleaning',
  'ironing',
  'express_laundry',
  'shoe_leather_cleaning',
  'carpet_cleaning',
  'laundry_pickup_delivery',
];

describe('subcategory variants', () => {
  it('lists the Laundry Services subcategories in the master order', () => {
    const laundry = listOnboardingCategories().find((c) => c.id === 'laundry_cleaning');
    expect(laundry?.name).toBe('Laundry Services');
    expect(laundry?.subcategories.map((s) => s.id)).toEqual(laundryIds);
    expect(laundry?.subcategories.find((s) => s.id === 'express_laundry')?.name).toBe(
      'Express Laundry',
    );
    expect(laundry?.subcategories.find((s) => s.id === 'ironing')?.name).toBe('Ironing & Pressing');
  });

  it('lists Wellness types under their group headings', () => {
    const wellness = listOnboardingCategories().find((c) => c.id === 'wellness');
    expect(wellness?.name).toBe('Wellness, Spa, Fitness & Nutrition');
    expect(wellness?.subcategories[0]).toEqual({
      id: 'swedish_massage',
      name: 'Swedish',
      group: 'Spa & Massage',
    });
    expect(new Set(wellness?.subcategories.map((s) => s.group))).toEqual(
      new Set([
        'Spa & Massage',
        'Salon Services',
        'Barber Services',
        'Fitness & Gym',
        'Nutrition & Diet',
        'Sports & Training',
        'Recovery & Relaxation',
        'Wellness Programs',
        'Wellness Products',
      ]),
    );
  });

  it('keeps retired subcategories valid but unlisted', () => {
    expect(isListedSubcategory('wash_and_fold')).toBe(false);
    expect(isListedSubcategory('clinics')).toBe(false);
    expect(getBookingProfile('wash_and_fold')?.defaultModelId).toBe('LINKED_WINDOWS');
    expect(resolveOnboardingSelection('health', ['clinics']).issues).toEqual([]);
  });

  it('uses the base profile booking model, questions and rules, with unique rule ids', () => {
    for (const variant of SUBCATEGORY_VARIANTS) {
      const profile = registry.profiles.find((p) => p.subcategoryId === variant.subcategoryId);
      const base = registry.profiles.find((p) => p.subcategoryId === variant.baseSubcategoryId);
      expect(profile && base).toBeTruthy();
      expect(profile!.categoryId).toBe(variant.categoryId);
      expect(profile!.defaultModelId).toBe(base!.defaultModelId);
      expect(profile!.candidateModelIds).toEqual(base!.candidateModelIds);
      expect(profile!.sourceQuestionIds).toEqual(base!.sourceQuestionIds);
      expect(baseSubcategoryId(variant.subcategoryId)).toBe(variant.baseSubcategoryId);
      expect(getBookingProfile(variant.subcategoryId)?.defaultModelId).toBe(base!.defaultModelId);
    }
    const ruleIds = registry.profiles.flatMap((p) => p.rules.map((r) => r.id));
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
  });

  it('gives new categories profiles from other categories', () => {
    expect(getBookingProfile('residential_moving')).toMatchObject({
      categoryId: 'movers_relocation',
      categoryName: 'Movers & Relocation',
      defaultModelId: 'REQUEST_QUOTE',
    });
    expect(getBookingProfile('luxury_car_rentals')?.defaultModelId).toBe('ASSET_INTERVAL');
    expect(getBookingProfile('pharmacy_retail')?.categoryName).toBe('Pharmaceutical Services');
    expect(resolveOnboardingSelection('games_sports', ['board_games']).issues).toEqual([]);
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
