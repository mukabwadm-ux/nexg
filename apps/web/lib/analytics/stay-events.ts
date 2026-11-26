import type { StayEvent, StayItem } from './gtag';

/**
 * The GA4 ecommerce events for stays, built from listing data only: the
 * property's slug and name, the unit's name, nights and KES amounts.
 * Nothing about the guest. Every event uses the property slug as item_id,
 * so views, checkouts and purchases line up in the same item report.
 */

function money(kes: number | null | undefined): number | undefined {
  return typeof kes === 'number' && Number.isFinite(kes) && kes >= 0 ? Math.round(kes) : undefined;
}

export function stayViewItem(property: {
  slug: string;
  name: string;
  /** The unit, on a unit page. */
  unit?: string | null;
  fromRateKes: number | null;
}): StayEvent {
  const price = money(property.fromRateKes);
  const item: StayItem = {
    item_id: property.slug,
    item_name: property.name,
    item_category: 'stay',
    ...(property.unit ? { item_variant: property.unit } : {}),
    ...(price !== undefined ? { price } : {}),
  };
  return {
    name: 'view_item',
    params: { currency: 'KES', ...(price !== undefined ? { value: price } : {}), items: [item] },
  };
}

export function stayBeginCheckout(stay: {
  slug: string;
  property: string;
  unit: string;
  nightlyKes: number | null;
}): StayEvent {
  const price = money(stay.nightlyKes);
  return {
    name: 'begin_checkout',
    params: {
      currency: 'KES',
      ...(price !== undefined ? { value: price } : {}),
      items: [
        {
          item_id: stay.slug,
          item_name: stay.property,
          item_category: 'stay',
          item_variant: stay.unit,
          ...(price !== undefined ? { price } : {}),
          quantity: 1,
        },
      ],
    },
  };
}

export function stayPurchase(stay: {
  /** The booking's payment reference, shown to the guest as their reference. */
  reference: string;
  slug: string;
  property: string;
  unit: string;
  nights: number;
  paidKes: number;
}): StayEvent {
  const value = money(stay.paidKes) ?? 0;
  const nights = Math.max(1, Math.floor(stay.nights) || 1);
  return {
    name: 'purchase',
    params: {
      currency: 'KES',
      value,
      transaction_id: stay.reference,
      items: [
        {
          item_id: stay.slug,
          item_name: stay.property,
          item_category: 'stay',
          item_variant: stay.unit,
          price: Math.round(value / nights),
          quantity: nights,
        },
      ],
    },
  };
}
