import type { BookingEngine } from './engine.js';
import { movieHoldCustomer, movieHoldIntent, movieHoldView, type MovieHoldInput } from './movies.js';
import { BookingError, type Identity } from './types.js';
import { readMovieSeatAvailability, type MovieSeatQuery } from './movie-seat-availability.js';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fields = new Set(['showingId', 'screenId', 'occurrenceId', 'offeringId', 'seatIds', 'requestId', 'expectedTotalMinor']);

/** Only call with the context returned by authenticate, never request JSON.
 * The trusted bridge verifies a non-anonymous Supabase user and verified contact.
 * The existing HMAC binds this claim to the tenant, actor and short expiry.
 */
export function authenticatedMovieCustomer(identity: Identity) {
  const claim = (identity as Identity & { moviesCustomer?: any }).moviesCustomer;
  if (identity.role !== 'customer' || typeof identity.userId !== 'string' || !uuid.test(identity.userId) ||
      typeof identity.businessId !== 'string' || !uuid.test(identity.businessId) ||
      !claim || claim.purpose !== 'nexg.movies.customer.v1' || claim.verified !== true)
    throw new BookingError(401, 'Sign in with a verified Movies customer account.', 'movie_authentication_required');
  const customer = movieHoldCustomer(claim.customer);
  if (!!customer.email === !!customer.phone)
    throw new BookingError(401, 'A single verified customer contact is required.', 'movie_authentication_required');
  return customer;
}

export async function createAuthenticatedMovieHold(engine: BookingEngine, identity: Identity, raw: unknown, key?: string) {
  const customer = authenticatedMovieCustomer(identity);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !fields.has(k)))
    throw new BookingError(422, 'Send only the reviewed seat hold intent.', 'invalid_movie_intent');
  const intent = movieHoldIntent(raw as MovieHoldInput);
  if (typeof key !== 'string' || !uuid.test(key) || key.toLowerCase() !== intent.requestId)
    throw new BookingError(422, 'The idempotency key must match requestId.', 'invalid_idempotency_key');
  return engine.createMovieHold(identity, intent, customer);
}

export async function readAuthenticatedMovieHold(engine: BookingEngine, identity: Identity, id: string) {
  authenticatedMovieCustomer(identity);
  if (!uuid.test(id)) throw new BookingError(404, 'This hold was not found.', 'not_found');
  const context = engine.managementContext();
  const doc = await context.own('reservations', id, identity);
  if (doc.businessId !== identity.businessId || doc.nexg?.createdBy !== identity.userId || doc.nexg?.movieHold?.contractVersion !== 1)
    throw new BookingError(404, 'This hold was not found.', 'not_found');
  return movieHoldView(doc, context.now());
}

/** Never infer coherentSnapshot from an HTTP parameter or a generic transaction ID. */
export async function readAuthenticatedMovieAvailability(engine: BookingEngine, identity: Identity, params: URLSearchParams) {
  authenticatedMovieCustomer(identity);
  const keys = ['showingId', 'screenId', 'occurrenceId', 'offeringId'] as const;
  if ([...params.keys()].some(k => !keys.includes(k as typeof keys[number])) ||
      keys.some(k => params.getAll(k).length !== 1 || !uuid.test(params.get(k)!)))
    throw new BookingError(422, 'Supply the four exact showing identifiers once each.', 'invalid_movie_query');
  const query = Object.fromEntries(keys.map(k => [k, params.get(k)!])) as unknown as MovieSeatQuery;
  const db = engine.payload.db;
  // Installed PostgreSQL adapter forwards these options to Drizzle before returning
  // the transaction ID. Other adapters must receive their own proven boundary.
  if (db.name !== 'postgres' || (db as any).transactionOptions === false)
    throw new BookingError(503, 'Coherent native availability storage is unavailable.', 'movie_snapshot_unavailable');
  // Both installed adapters augment Payload's shared DatabaseAdapter type. Narrow
  // only after the runtime postgres guard, retaining the adapter method receiver.
  const postgres = db as unknown as { beginTransaction(options: {
    isolationLevel: 'repeatable read'; accessMode: 'read only';
  }): Promise<string | number | null> };
  const tx = await postgres.beginTransaction({ isolationLevel: 'repeatable read', accessMode: 'read only' });
  if (tx == null) throw new BookingError(503, 'Coherent native availability storage is unavailable.', 'movie_snapshot_unavailable');
  try {
    const view = await readMovieSeatAvailability(engine, identity, query, {
      request: engine.managementContext().request(identity, tx), coherentSnapshot: true,
    });
    await db.commitTransaction(tx);
    return { contractVersion: view.contractVersion, merchantId: view.merchantId, offeringId: view.offeringId,
      occurrenceId: view.occurrenceId, showingId: view.showingId, screenId: view.screenId, filmId: view.filmId,
      version: view.version, observedAt: view.observedAt, startTime: view.startTime, endTime: view.endTime,
      seats: view.seats.map(({ seatId, type, status }) => ({ seatId, type, status })) };
  } catch (error) {
    await db.rollbackTransaction(tx);
    throw error;
  }
}
