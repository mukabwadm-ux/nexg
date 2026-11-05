import {
  appendMerchantOnboardingDemoContext,
  type MerchantOnboardingDemoContext,
  type MerchantOnboardingDemoSelection,
} from './merchant-onboarding-demo';

/** Meeting preview only. This definition does not register a production category. */
export const AVIATION_DEMO_CATEGORY = {
  id: 'flights_aviation',
  name: 'Flights & aviation',
  subcategoryOptions: [
    { id: 'helicopter_charters', name: 'Helicopter charters' },
    { id: 'scenic_flights', name: 'Scenic flights' },
    { id: 'safari_flights', name: 'Safari flights' },
    { id: 'private_charters', name: 'Private charters' },
  ],
};

export function createAviationDemoContext(
  selection?: MerchantOnboardingDemoSelection,
): MerchantOnboardingDemoContext {
  const requested = selection?.subcategories ?? AVIATION_DEMO_CATEGORY.subcategoryOptions;
  const subcategories = AVIATION_DEMO_CATEGORY.subcategoryOptions.filter((item) =>
    requested.some((selected) => selected.id === item.id),
  );
  const activities = subcategories.length
    ? subcategories
    : [AVIATION_DEMO_CATEGORY.subcategoryOptions[0]!];
  return {
    categoryId: AVIATION_DEMO_CATEGORY.id,
    categoryName: AVIATION_DEMO_CATEGORY.name,
    subcategories: activities,
    businessName: 'Heliflight Africa',
    contactName: 'Heliflight team',
    initials: 'HA',
    profileId: activities[0]!.id,
  };
}

export function aviationDemoHref(selection?: MerchantOnboardingDemoSelection): string {
  return appendMerchantOnboardingDemoContext(
    '/merchant-live-preview',
    createAviationDemoContext(selection),
  );
}
