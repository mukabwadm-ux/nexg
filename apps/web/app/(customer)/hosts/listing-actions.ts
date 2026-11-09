'use server';

import { AirbnbImportError, fetchAirbnbListing } from '@/lib/airbnb-import';
import type { AirbnbListing } from '@/lib/airbnb-listing';

export type ListingPreviewResult =
  | { ok: true; listing: AirbnbListing }
  | { ok: false; message: string };

/**
 * The "Is this your listing?" card on the host form. Only Airbnb is
 * fetched, and nothing is stored: the listing is read again on submit.
 */
export async function previewAirbnbListing(raw: string): Promise<ListingPreviewResult> {
  if (typeof raw !== 'string' || raw.length > 500)
    return { ok: false, message: 'Paste a link to your listing on airbnb.com.' };
  try {
    return { ok: true, listing: await fetchAirbnbListing(raw) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AirbnbImportError
          ? error.message
          : 'We could not read that listing. You can continue without it.',
    };
  }
}
