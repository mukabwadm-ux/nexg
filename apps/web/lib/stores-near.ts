/**
 * "Find Stores Near You" on the homepage: which live stores to show, and in
 * what order, for where the visitor is.
 *
 * With an exact spot (set on the map, a QR code or a room), the stores whose
 * branch is within delivery reach come first, nearest first. When there are
 * none near, or too few to fill the row, or the visitor has not set a spot,
 * the row is filled with Nairobi's usual stores so the section is never
 * empty: concierge picks, then featured, then open ones, then the newest.
 */

export interface NearbyStore {
  id: string;
  trading_name: string;
  category: string | null;
  category_key: string | null;
  category_other: string | null;
  cover_photo_path: string | null;
  branch_name: string | null;
  branch_latitude: number | null;
  branch_longitude: number | null;
  concierge_pick: boolean | null;
  featured: boolean | null;
  accepting_orders: boolean | null;
  closed_today: boolean | null;
  closes_today: string | null;
  prep_minutes: number | null;
  listed_at: string | null;
}

export interface RankedStore extends NearbyStore {
  /** km from the visitor's spot, for stores counted as near. */
  km: number | null;
}

/*
 * How far a branch may be from the visitor's spot to count as near. The
 * platform's default delivery limit (fees.delivery.max_km), as on Explore:
 * a store further than this would be refused at checkout anyway.
 */
export const NEAR_KM = 15;

/** The row is at least this long, topped up from across Nairobi. */
export const STORES_MIN = 8;
export const STORES_MAX = 12;

/** Great-circle distance in km. */
export function kmBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const isOpen = (s: NearbyStore) => s.accepting_orders !== false && !s.closed_today;

/** Nairobi's usual order: picks, featured, open, newest. */
function cityOrder(a: NearbyStore, b: NearbyStore): number {
  return (
    Number(!!b.concierge_pick) - Number(!!a.concierge_pick) ||
    Number(!!b.featured) - Number(!!a.featured) ||
    Number(isOpen(b)) - Number(isOpen(a)) ||
    (b.listed_at ?? '').localeCompare(a.listed_at ?? '')
  );
}

export function rankStores(
  stores: NearbyStore[],
  spot: { lat: number; lng: number } | null,
): { stores: RankedStore[]; nearCount: number } {
  const near: RankedStore[] = [];
  if (spot) {
    for (const store of stores) {
      if (store.branch_latitude == null || store.branch_longitude == null) continue;
      const km = kmBetween(spot, { lat: store.branch_latitude, lng: store.branch_longitude });
      if (km <= NEAR_KM) near.push({ ...store, km });
    }
    /* Open ones first among the near, then nearest. */
    near.sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || a.km! - b.km!);
  }

  /* The rest still carry their distance when there is a spot and a pin, so
     a card can say how far away it is even when it is not near. */
  const taken = new Set(near.map((s) => s.id));
  const rest: RankedStore[] = stores
    .filter((s) => !taken.has(s.id))
    .sort(cityOrder)
    .map((s) => ({
      ...s,
      km:
        spot && s.branch_latitude != null && s.branch_longitude != null
          ? kmBetween(spot, { lat: s.branch_latitude, lng: s.branch_longitude })
          : null,
    }));

  const shown = near.slice(0, STORES_MAX);
  const topUp = Math.max(0, STORES_MIN - shown.length);
  return { stores: [...shown, ...rest.slice(0, topUp)], nearCount: shown.length };
}
