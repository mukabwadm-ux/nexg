import { hasNativeMovieAuthority } from './movie-authority.js';
import { BookingError, type Identity } from './types.js';
import type { BookingEngine } from './engine.js';

type Row = Record<string, any>;
export interface MovieSeatQuery { occurrenceId: string; showingId: string; screenId: string; offeringId: string }
/** Internal snapshot only. Never accept these rows or the coherence assertion from HTTP input. */
export interface MovieSeatSnapshot {
  configuration: Row; occurrence: Row; offering: Row; resources: Row[]; reservations: Row[];
}
const unavailable = (): never => { throw new BookingError(409, 'Native showing availability is unavailable.', 'movie_availability_unavailable'); };
const relationId = (value: any): string => String(value && typeof value === 'object' ? value.id : value);

/** Advisory projection, not a promise of inventory. The hold command must recheck atomically.
 * Rows must come from the same tenant-scoped coherent database snapshot. No guest/payment
 * data is copied, and geometry is deliberately absent because publication does not store it.
 */
export function projectMovieSeatAvailability(identity: Identity, query: MovieSeatQuery, snapshot: MovieSeatSnapshot, now: number) {
  const { configuration: config, occurrence: o, offering: service, resources, reservations } = snapshot;
  const m = o?.movies;
  if (!Array.isArray(resources) || !Array.isArray(reservations) ||
      [o, service, ...resources, ...reservations].some(row => row?.businessId !== identity.businessId)) unavailable();
  const start = Date.parse(o?.startTime), end = Date.parse(o?.endTime);
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || start <= now + 600000 ||
      config?.categoryKey !== 'experiences' || config?.subcategoryId !== 'cinemas' || config?.published !== true ||
      o?.published !== true || o.publicId !== query.occurrenceId || o.offeringId !== query.offeringId ||
      service?.publicId !== query.offeringId || service.active !== true || service.nexg?.bookingEnabled !== true ||
      service.nexg?.model !== 'SESSION_CAPACITY' || service.nexg.locationId !== o.locationId ||
      (identity.branches && !identity.branches.includes(o.locationId)) ||
      m?.contractVersion !== 1 || m.merchantId !== identity.businessId || m.showingId !== query.showingId || m.screenId !== query.screenId ||
      !Array.isArray(m.seats) || !m.seats.length || !Array.isArray(resources) || !Array.isArray(reservations)) unavailable();
  if (!hasNativeMovieAuthority(config, { businessId: identity.businessId, offeringId: query.offeringId,
    occurrenceId: query.occurrenceId, locationId: o.locationId })) unavailable();
  const codes = new Set<string>(), resourceIds = new Set<string>();
  const byInternal = new Map<string, string>();
  for (const seat of m.seats) {
    if (!seat || typeof seat.code !== 'string' || !seat.code.trim() || seat.code !== seat.code.trim() || seat.code.length > 12 ||
        typeof seat.resourceId !== 'string' || codes.has(seat.code) || resourceIds.has(seat.resourceId) ||
        !['standard','vip','wheelchair'].includes(seat.type) || !Number.isSafeInteger(m.pricesMinor?.[seat.type]) || m.pricesMinor[seat.type] <= 0) unavailable();
    codes.add(seat.code); resourceIds.add(seat.resourceId);
    const matches = resources.filter(r => r.publicId === seat.resourceId);
    const r = matches[0];
    if (matches.length !== 1 || r.id == null || r.active !== true || r.quantity !== 1 || r.capacityMode !== 'per-reservation' ||
        r.resourceType !== 'asset' || r.nexg?.locationId !== o.locationId || byInternal.has(String(r.id))) unavailable();
    byInternal.set(String(r.id), seat.code);
  }
  if (!Array.isArray(o.resourceIds) || o.resourceIds.length !== resourceIds.size || new Set(o.resourceIds).size !== resourceIds.size ||
      o.resourceIds.some((id: string) => !resourceIds.has(id)) || !Array.isArray(service.nexg.resourceIds) ||
      [...resourceIds].some(id => !service.nexg.resourceIds.includes(id))) unavailable();
  const occupied = new Set<string>();
  for (const reservation of reservations) {
    // Use actual Reserve parent + item resource relationships, not client seat metadata.
    if (!reservation || !Array.isArray(reservation.items ?? [])) unavailable();
    const ids = [reservation.resource, ...(reservation.items ?? []).map((item: any) => item?.resource)].map(relationId);
    const affected = ids.flatMap(id => byInternal.has(id) ? [byInternal.get(id)!] : []);
    if (!affected.length) continue;
    if (['cancelled', 'expired'].includes(reservation.status)) continue;
    const a = Date.parse(reservation.startTime), b = Date.parse(reservation.endTime);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) unavailable();
    if (a >= end || b <= start) continue;
    if (reservation.status === 'held') {
      const expiry = Date.parse(reservation.nexg?.expiresAt);
      if (!Number.isFinite(expiry)) unavailable();
      if (expiry <= now) continue;
    }
    // Unknown/pending/completed overlapping statuses remain unavailable, never guessed free.
    affected.forEach(code => occupied.add(code));
  }
  return { contractVersion: 1 as const, merchantId: identity.businessId, occurrenceId: o.publicId,
    offeringId: service.publicId, showingId: m.showingId, screenId: m.screenId, filmId: m.filmId,
    version: o.version ?? 1, observedAt: new Date(now).toISOString(), startTime: o.startTime, endTime: o.endTime,
    seats: [...m.seats].sort((a,b) => a.code.localeCompare(b.code)).map(s => ({ seatId: s.code, resourceId: s.resourceId,
      type: s.type, status: occupied.has(s.code) ? 'unavailable' as const : 'available' as const })) };
}

/** Caller owns commit/rollback and must establish a coherent snapshot (e.g. REPEATABLE READ).
 * A transaction ID alone does not give PostgreSQL READ COMMITTED snapshot consistency.
 * This helper performs no writes, expiry sweep, fallback, audit, or merchant API calls.
 */
export async function readMovieSeatAvailability(engine: BookingEngine, identity: Identity, query: MovieSeatQuery,
  transaction: { request: any; coherentSnapshot: true }) {
  if (!transaction || transaction.coherentSnapshot !== true || transaction.request?.transactionID == null) unavailable();
  const c = engine.managementContext(), req = c.request(identity, transaction.request.transactionID);
  // One transaction owns one database client; do not issue concurrent pg queries.
  const businesses = await c.all('businesses', identity, req);
  const occurrences = await c.all('booking-sessions', identity, req);
  const offering = await c.own('services', query.offeringId, identity, req);
  const resources = await c.all('resources', identity, req);
  const reservations = await c.all('reservations', identity, req);
  const occurrence = occurrences.find(o => o.publicId === query.occurrenceId) ?? unavailable();
  for (const r of resources.filter(r => occurrence.resourceIds?.includes(r.publicId))) {
    if (!r.nexg?.schedule || !c.scheduleAllows(offering, r, Date.parse(occurrence.startTime), Date.parse(occurrence.endTime))) unavailable();
  }
  return projectMovieSeatAvailability(identity, query, { configuration: businesses[0]?.configuration, occurrence, offering, resources, reservations }, c.now());
}
