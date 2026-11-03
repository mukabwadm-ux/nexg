'use client';

import { LocationBanner, LocationSheet } from '@nexg/location';
import { usePathname } from 'next/navigation';
import { isBookingPage } from '@/lib/booking/routes';
import { isMerchantRegistrationPath } from '@/lib/merchant-journey-navigation';

/**
 * The precision banner and first-visit sheet, outside flows that should
 * not be interrupted by a location prompt.
 *
 * The homepage opens on the hero, and the hero asks for a place itself:
 * a prompt beside the location pill in its nav. A banner above that nav,
 * or a sheet over it before the visitor has seen the page, would be
 * asking twice — and the first thing a new visitor saw would be a
 * question instead of the site.
 */
export function LocationBannerSlot() {
  const pathname = usePathname();
  if (
    isBookingPage(pathname) ||
    isMerchantRegistrationPath(pathname) ||
    pathname === '/merchant-live-preview' ||
    pathname.startsWith('/merchant-live-preview/')
  )
    return null;
  return <LocationBanner hidden={pathname === '/' || pathname === '/merchant-live-preview'} />;
}

export function LocationSheetSlot() {
  const pathname = usePathname();
  if (
    isBookingPage(pathname) ||
    isMerchantRegistrationPath(pathname) ||
    pathname === '/merchant-live-preview' ||
    pathname.startsWith('/merchant-live-preview/')
  )
    return null;
  return <LocationSheet autoOpen={pathname !== '/' && pathname !== '/merchant-live-preview'} />;
}
