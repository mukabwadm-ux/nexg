'use client';

import { useLocation } from '@nexg/location';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

/**
 * Makes Explore follow the chip.
 *
 * Explore is a server component keyed on `?city=`, which is the
 * right shape — it is cacheable and shareable. This is the small
 * client piece that keeps that key in step with the place in the
 * header, so changing the delivery location anywhere re-queries
 * the listing for the new spot without a reload.
 *
 * It uses `router.replace`, not `push`. Setting a delivery
 * address is not a navigation, and a guest who sets one and then
 * presses Back should leave Explore rather than step through
 * every address they tried.
 *
 * It only acts on a real mismatch. Writing the parameter
 * unconditionally would re-render the page on every mount and,
 * worse, overwrite a city somebody had deliberately chosen from
 * the city switcher with the one their connection guessed.
 */
export function ExploreFollowsLocation() {
  const { place, ready } = useLocation();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const current = params.get('city');
  const target = place?.city_slug ?? null;

  React.useEffect(() => {
    if (!ready || !target) return;
    if (current === target) return;

    /*
     * A city the visitor picked by hand wins until they change
     * the place again. Without this the switcher and the chip
     * fight: pick Mombasa, and the Nairobi pin in the header
     * puts it straight back.
     */
    if (current && place?.source === 'ip_city') return;

    const next = new URLSearchParams(params.toString());
    next.set('city', target);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [ready, target, current, place?.source, params, pathname, router]);

  /* Announced, because the listing beneath has just changed
     under somebody who may not have been looking at the header. */
  return (
    <p aria-live="polite" className="sr-only">
      {place
        ? `Showing merchants that deliver to ${place.label}.`
        : 'No delivery location set yet.'}
    </p>
  );
}
