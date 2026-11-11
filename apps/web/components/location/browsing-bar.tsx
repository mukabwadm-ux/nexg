'use client';

import { useLocation } from '@nexg/location';
import { ChevronDown, MapPin, Navigation } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/**
 * The "Browsing" bar at the top of Explore.
 *
 * It reads the same place as the header's location pill: once the visitor
 * has set a spot (on the map, by QR or by room), it says where that is and,
 * on the right, the delivery zone it falls in, which narrows the listing to
 * that zone. With no spot yet, or only a city guessed from the connection,
 * it asks them to set one, and the button opens the same sheet as the pill.
 */
export function BrowsingBar({ citySlug }: { citySlug: string }) {
  const { place, chip, ready, openSheet } = useLocation();
  const params = useSearchParams();
  const hasSpot =
    !!place && (chip === 'set' || chip === 'qr' || chip === 'room' || chip === 'outside');
  const zoneFilter = params.get('zone');

  /* The listing, with or without the zone filter, keeping the other filters. */
  const zoneHref = (zoneId: string | null) => {
    const next = new URLSearchParams(params.toString());
    next.set('city', place?.city_slug ?? citySlug);
    if (zoneId) next.set('zone', zoneId);
    else next.delete('zone');
    next.delete('area');
    return `/explore?${next.toString()}`;
  };

  return (
    <div className="border-border bg-surface flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3">
      <MapPin aria-hidden="true" className="text-gold h-4 w-4 shrink-0" />
      <span className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
        Browsing
      </span>

      {!ready ? (
        <span className="bg-bg h-4 w-32 animate-pulse rounded" aria-hidden="true" />
      ) : hasSpot ? (
        <button
          type="button"
          onClick={() => openSheet('explore')}
          aria-label={`Browsing near ${place!.label}. Change location`}
          className="hover:text-gold-text inline-flex min-w-0 max-w-full items-center gap-1 text-[0.875rem] font-extrabold transition-colors"
        >
          <span className="truncate">{place!.label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
      ) : (
        <span className="text-muted text-[0.875rem] font-semibold">
          Set your location to see the stores that deliver to you.
        </span>
      )}

      <span className="ml-auto flex flex-wrap items-center gap-1.5">
        {!ready ? null : !hasSpot ? (
          <button
            type="button"
            onClick={() => openSheet('explore')}
            className="bg-gold text-ink hover:bg-gold/90 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors"
          >
            <Navigation className="h-3 w-3" aria-hidden="true" />
            Set location
          </button>
        ) : place!.zone && place!.zone_id ? (
          <>
            <span className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
              Zone
            </span>
            {/* The zone narrows the listing; tapped again, it shows all of the city. */}
            <Link
              href={zoneHref(zoneFilter === place!.zone_id ? null : place!.zone_id)}
              aria-current={zoneFilter === place!.zone_id ? 'true' : undefined}
              title={
                zoneFilter === place!.zone_id
                  ? 'Showing this zone only. Tap to show all.'
                  : 'Show stores in this zone only'
              }
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                zoneFilter === place!.zone_id
                  ? 'bg-ink text-white'
                  : 'border-border-strong hover:bg-bg border'
              }`}
            >
              {place!.zone}
            </Link>
          </>
        ) : (
          <span className="text-muted text-xs font-semibold">
            {place!.nearest_zone
              ? `Outside our zones · nearest is ${place!.nearest_zone}`
              : 'Outside our delivery zones'}
          </span>
        )}
      </span>
    </div>
  );
}
