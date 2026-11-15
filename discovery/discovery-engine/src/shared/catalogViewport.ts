import type { Schemas } from '../contracts/index.js';

export function isInCatalogViewport(viewport: Schemas['MapViewport'], location: Schemas['GeoPoint'] | undefined): boolean {
  if (!location || location.latitude < viewport.south || location.latitude > viewport.north) return false;
  const { longitude } = location;
  const { west, east } = viewport;
  if (west > east) return longitude >= west || longitude <= east;
  return (longitude >= west && longitude <= east) ||
    (Math.abs(longitude) === 180 && (west === -180 || east === 180));
}
