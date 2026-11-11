import { kmBetween } from './stores-near';

/**
 * The delivery price Explore shows on a merchant card, worked out the way
 * checkout charges it (fn_delivery_price_per_km): straight-line distance
 * rounded to 0.1 km, then rounded up to whole kilometres; the base fee covers
 * the first kilometre and each further commenced kilometre adds the per-km
 * rate. Beyond the maximum distance there is no price, because checkout
 * refuses the order.
 *
 * The rate comes from the city's settings (rpc_delivery_rate), never from a
 * number written here.
 */
export interface DeliveryRate {
  base: number;
  perKm: number;
  maxKm: number;
}

export type DeliveryQuote =
  | { kind: 'from'; fee: number }
  | { kind: 'quote'; fee: number; km: number }
  | { kind: 'too_far'; km: number; maxKm: number };

export function deliveryFeeForKm(rawKm: number, rate: DeliveryRate): DeliveryQuote {
  const km = Math.round(rawKm * 10) / 10;
  if (km > rate.maxKm) return { kind: 'too_far', km, maxKm: rate.maxKm };
  const commenced = Math.ceil(km);
  const fee = commenced <= 1 ? rate.base : rate.base + (commenced - 1) * rate.perKm;
  return { kind: 'quote', fee, km };
}

/**
 * From the visitor's spot to the merchant's pin. With either end missing,
 * the base fee, the least any delivery costs, as "from".
 */
export function deliveryQuote(
  rate: DeliveryRate,
  spot: { lat: number; lng: number } | null,
  pin: { lat: number | null; lng: number | null },
): DeliveryQuote {
  if (!spot || pin.lat == null || pin.lng == null) return { kind: 'from', fee: rate.base };
  return deliveryFeeForKm(kmBetween(spot, { lat: pin.lat, lng: pin.lng }), rate);
}
