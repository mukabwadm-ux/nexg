import type { Schemas } from '../contracts/index.js';

/**
 * Branch coordinates exactly as the source records them, or undefined. Values must be finite and in range;
 * 0,0 (open sea off West Africa) is a missing value, not a Nairobi location.
 */
export function geoPoint(latitude: unknown, longitude: unknown): Schemas['GeoPoint'] | undefined {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return undefined;
  return { latitude, longitude };
}
