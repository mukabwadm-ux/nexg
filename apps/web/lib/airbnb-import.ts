import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  airbnbListingId,
  isAirbnbHost,
  isAirbnbImageHost,
  parseAirbnbListing,
  parseAirbnbUrl,
  canonicalAirbnbUrl,
  type AirbnbListing,
} from '@/lib/airbnb-listing';
import { SafeFetchError, safeGet, safeGetHtml } from '@/lib/safe-fetch';
import type { createClient } from '@/lib/supabase/server';

export class AirbnbImportError extends Error {}

/**
 * Reads a listing from its public page. Share links (abnb.me, /h/…) are
 * followed to the /rooms/<id> page first; every hop must stay on Airbnb.
 */
export async function fetchAirbnbListing(raw: string): Promise<AirbnbListing> {
  const url = parseAirbnbUrl(raw);
  if (!url) throw new AirbnbImportError('Paste a link to your listing on airbnb.com.');
  try {
    let id = airbnbListingId(url);
    if (!id) {
      const { url: landed } = await safeGet(url, { allowHost: isAirbnbHost, maxBytes: 4096 });
      id = airbnbListingId(landed);
    }
    if (!id) throw new AirbnbImportError('That link does not point to a single Airbnb listing.');
    const { html } = await safeGetHtml(canonicalAirbnbUrl(id), { allowHost: isAirbnbHost });
    const listing = parseAirbnbListing(html, id);
    if (!listing.name && listing.bedrooms === null && !listing.photoUrl)
      throw new AirbnbImportError(
        'We could not read that listing. You can still continue without it.',
      );
    return listing;
  } catch (error) {
    if (error instanceof AirbnbImportError) throw error;
    if (error instanceof SafeFetchError)
      throw new AirbnbImportError(
        'We could not open that listing. Check the link, or continue without it.',
      );
    throw new AirbnbImportError('Airbnb did not answer in time. You can continue without it.');
  }
}

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Copies the listing's cover photo into the host's own folder of the
 * private host-photos bucket, on the applicant's session (the bucket allows
 * a host member to write under <host_id>/). Returns the stored path.
 */
export async function copyAirbnbCoverPhoto(
  db: ReturnType<typeof createClient>,
  hostId: string,
  unitId: string,
  photoUrl: string,
): Promise<string> {
  const source = new URL(photoUrl);
  if (source.protocol !== 'https:' || !isAirbnbImageHost(source.hostname))
    throw new AirbnbImportError('That photo is not on Airbnb.');
  const { response, body } = await safeGet(source, {
    allowHost: isAirbnbImageHost,
    accept: 'image/jpeg,image/png,image/webp',
    maxBytes: 10 * 1024 * 1024,
    timeoutMs: 10_000,
  });
  const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  const extension = IMAGE_TYPES[type];
  if (!extension || body.length < 1024)
    throw new AirbnbImportError('The cover photo could not be read.');
  const path = `${hostId}/${unitId}/${randomUUID()}.${extension}`;
  const { error } = await db.storage
    .from('host-photos')
    .upload(path, body, { contentType: type, upsert: false });
  if (error) throw new AirbnbImportError('The cover photo could not be saved.');
  return path;
}
