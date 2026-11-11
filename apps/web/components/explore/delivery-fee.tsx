'use client';

import { useLocation } from '@nexg/location';

import { deliveryQuote, type DeliveryRate } from '@/lib/delivery-fee';

/**
 * "Delivery KES 130 · 2.1 km" on an Explore card, priced from the spot in the
 * location pill to this merchant's pin, the way checkout will charge it.
 * Until the visitor sets a spot (or when the merchant has no pin), the base
 * fee as "Delivery from KES 80". With no rate card for the city, nothing.
 */
export function DeliveryFee({
  rate,
  lat,
  lng,
}: {
  rate: DeliveryRate | null;
  lat: number | null;
  lng: number | null;
}) {
  const { place, chip } = useLocation();
  if (!rate) return null;

  /* A city guessed from the connection is not a spot to price from. */
  const spot =
    place && (chip === 'set' || chip === 'qr' || chip === 'room' || chip === 'outside')
      ? { lat: place.lat, lng: place.lng }
      : null;
  const quote = deliveryQuote(rate, spot, { lat, lng });
  const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

  if (quote.kind === 'too_far') {
    return <span className="text-muted text-sm">Too far to deliver · {quote.km} km</span>;
  }
  if (quote.kind === 'from') {
    return (
      <span className="text-muted text-sm">
        Delivery from <span className="text-ink font-extrabold">{kes(quote.fee)}</span>
      </span>
    );
  }
  return (
    <span
      className="text-muted text-sm"
      title="Estimated from your location; confirmed at checkout"
    >
      Delivery <span className="text-ink font-extrabold">{kes(quote.fee)}</span> · {quote.km} km
    </span>
  );
}
