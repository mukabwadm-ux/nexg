import type { CatalogModifierGroup } from '../../providers/DiscoveryProvider';

const demoSideExtras: CatalogModifierGroup = {
  id: 'demo-restaurant-extras',
  name: 'Add extras (optional)',
  required: false,
  minSelections: 0,
  maxSelections: 4,
  options: [
    { id: 'demo-extra-ugali', name: 'Extra Ugali', description: 'A thick, traditional serving.', priceDelta: 150, currency: 'KES', isAvailable: true },
    { id: 'demo-extra-kachumbari', name: 'Extra Kachumbari', description: 'Fresh tomato, onion and herbs.', priceDelta: 150, currency: 'KES', isAvailable: true },
    { id: 'demo-grilled-vegetables', name: 'Grilled Vegetables', description: 'Seasonal grilled vegetables.', priceDelta: 250, currency: 'KES', isAvailable: true },
    { id: 'demo-extra-protein', name: 'Extra Choma (200g)', description: 'More freshly grilled meat.', priceDelta: 400, currency: 'KES', isAvailable: true },
  ],
};

/** Demo-only reference choices; these are not merchant-confirmed catalog records. */
export function getDemoRestaurantModifierGroups(itemName: string): CatalogModifierGroup[] {
  const normalized = itemName.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (normalized !== 'signature grilled chicken' && normalized !== 'nyama choma platter') return [];

  const extras = normalized === 'signature grilled chicken'
    ? { ...demoSideExtras, options: demoSideExtras.options.map((option) => option.id === 'demo-extra-protein'
      ? { ...option, name: 'Extra Chicken (200g)', description: 'More freshly grilled chicken.' }
      : option) }
    : demoSideExtras;

  return [extras];
}
