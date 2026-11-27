/**
 * What NexG's public API may change for the business that owns an API key:
 * the platform routes behind /v1/offerings, /v1/resources and the
 * reservation actions on api.nexgapp.com (see server.ts).
 *
 * The API signs a platform context for the key's merchant. Each change here
 * runs the business's own command (management.ts, occurrences.ts,
 * BookingEngine.changeBooking) as a manager of that business, under the key's
 * user id (`api_key_<id>`), so the engine's rules, idempotency, audit and
 * outbox are exactly the merchant console's. Bodies are the API's snake_case,
 * already checked by the API; they are checked again here.
 *
 * - Prices, switching an offering on or off, departures and closures follow
 *   the console's rules: an offering with open work keeps its price, and a
 *   closure cannot cover an accepted booking.
 * - Accepting confirms a reservation or request (or accepts a work request).
 *   Declining is only for a booking still waiting and unpaid: a confirmed or
 *   paid booking is cancelled through NexG support, as API orders are.
 * - A driver is a first name, a vehicle and a plate, shown to the customer.
 */
import { requireManager } from './auth.js';
import { requirePlatform } from './customer-privacy.js';
import type { BookingEngine } from './engine.js';
import { createClosure, manageOffering } from './management.js';
import { addOccurrence, occurrenceView } from './occurrences.js';
import {
  apiOffering,
  apiResource,
  normalizeDriver,
  type ApiOffering,
  type ApiReservation,
  type ApiResource,
} from './api-reservations.js';
import { BookingError, type Identity } from './types.js';

type Doc = Record<string, any>;

const FINISHED = new Set(['cancelled', 'completed', 'expired', 'no-show']);

/** The business's manager the API acts as; the key's user id stays for the audit. */
function managerOf(identity: Identity): Identity {
  requirePlatform(identity);
  const manager = { ...identity, role: 'manager', branches: null };
  requireManager(manager);
  return manager;
}

function fields(input: unknown, allowed: string[], required: string[] = []): Doc {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BookingError(400, 'Send a JSON object.', 'invalid_json');
  const body = input as Doc;
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  if (extra.length)
    throw new BookingError(422, `Unknown field: ${extra.join(', ')}.`, 'invalid_input');
  for (const key of required)
    if (body[key] === undefined)
      throw new BookingError(422, `${key} is required.`, 'invalid_input');
  return body;
}

function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new BookingError(
      422,
      'expected_version is the version you read: a whole number of at least 1.',
      'invalid_input',
    );
  return value as number;
}

/* ═══════════════════════════════════════════════════════ reads */

export async function platformOfferings(
  engine: BookingEngine,
  identity: Identity,
): Promise<{ items: ApiOffering[] }> {
  requirePlatform(identity);
  const c = engine.managementContext();
  const [services, sessions] = await Promise.all([
    c.all('services', identity),
    c.all('booking-sessions', identity),
  ]);
  const now = c.now();
  return {
    items: services.map((service: Doc) =>
      apiOffering(
        engine.offeringView(service),
        sessions
          .map(occurrenceView)
          .filter(
            (session): session is NonNullable<ReturnType<typeof occurrenceView>> =>
              !!session &&
              session.offeringId === service.publicId &&
              Date.parse(session.endTime) > now,
          ),
      ),
    ),
  };
}

async function oneOffering(engine: BookingEngine, identity: Identity, id: string) {
  const found = (await platformOfferings(engine, identity)).items.find((item) => item.id === id);
  if (!found) throw new BookingError(404, 'This offering was not found.', 'not_found');
  return found;
}

export async function platformResources(
  engine: BookingEngine,
  identity: Identity,
): Promise<{ items: ApiResource[] }> {
  requirePlatform(identity);
  const c = engine.managementContext();
  const now = c.now();
  return {
    items: (await c.all('resources', identity)).map((resource: Doc) =>
      apiResource(engine.resourceView(resource), now),
    ),
  };
}

async function oneResource(engine: BookingEngine, identity: Identity, id: string) {
  const found = (await platformResources(engine, identity)).items.find((item) => item.id === id);
  if (!found) throw new BookingError(404, 'This resource was not found.', 'not_found');
  return found;
}

/* ═══════════════════════════════════════════════════════ prices and availability */

/** PATCH /v1/offerings/{id}: its price, whether it is on, whether it takes bookings. */
export async function platformUpdateOffering(
  engine: BookingEngine,
  identity: Identity,
  id: string,
  input: unknown,
  key?: string,
): Promise<ApiOffering> {
  const manager = managerOf(identity);
  const body = fields(
    input,
    ['expected_version', 'price_cents', 'active', 'booking_enabled'],
    ['expected_version'],
  );
  const changes: Doc = { expectedVersion: version(body.expected_version) };
  if (body.price_cents !== undefined) changes.priceMinor = body.price_cents;
  if (body.active !== undefined) changes.active = body.active;
  if (body.booking_enabled !== undefined) changes.bookingEnabled = body.booking_enabled;
  if (Object.keys(changes).length === 1)
    throw new BookingError(422, 'Send price_cents, active or booking_enabled.', 'invalid_input');
  await manageOffering(engine, manager, id, changes, key);
  return oneOffering(engine, identity, id);
}

/** POST /v1/offerings/{id}/departures: add a departure, or change or close one. */
export async function platformDeparture(
  engine: BookingEngine,
  identity: Identity,
  offeringId: string,
  input: unknown,
  key?: string,
): Promise<ApiOffering> {
  const manager = managerOf(identity);
  const body = fields(
    input,
    [
      'expected_version',
      'departure_id',
      'expected_departure_version',
      'starts_at',
      'ends_at',
      'capacity',
      'published',
      'resource_ids',
    ],
    ['expected_version', 'starts_at', 'ends_at', 'capacity', 'published'],
  );
  await addOccurrence(
    engine,
    manager,
    offeringId,
    {
      expectedVersion: version(body.expected_version),
      startTime: body.starts_at,
      endTime: body.ends_at,
      capacity: body.capacity,
      published: body.published,
      ...(body.resource_ids !== undefined ? { resourceIds: body.resource_ids } : {}),
      ...(body.departure_id !== undefined ? { occurrenceId: body.departure_id } : {}),
      ...(body.expected_departure_version !== undefined
        ? { expectedOccurrenceVersion: body.expected_departure_version }
        : {}),
    },
    key,
  );
  return oneOffering(engine, identity, offeringId);
}

/** POST /v1/resources/{id}/closures: the resource is busy or closed for a time. */
export async function platformClosure(
  engine: BookingEngine,
  identity: Identity,
  resourceId: string,
  input: unknown,
  key?: string,
): Promise<ApiResource> {
  const manager = managerOf(identity);
  const body = fields(
    input,
    ['expected_version', 'starts_at', 'ends_at', 'reason'],
    ['expected_version', 'starts_at', 'ends_at', 'reason'],
  );
  await createClosure(
    engine,
    manager,
    resourceId,
    {
      expectedVersion: version(body.expected_version),
      startTime: body.starts_at,
      endTime: body.ends_at,
      reason: body.reason,
    },
    key,
  );
  return oneResource(engine, identity, resourceId);
}

/** DELETE /v1/resources/{id}/closures/{closure_id}: open the time again. */
export async function platformRemoveClosure(
  engine: BookingEngine,
  identity: Identity,
  resourceId: string,
  closureId: string,
  expectedVersion: unknown,
  key?: string,
): Promise<ApiResource> {
  const manager = managerOf(identity);
  await createClosure(
    engine,
    manager,
    resourceId,
    { expectedVersion: version(expectedVersion), removeId: closureId },
    key,
  );
  return oneResource(engine, identity, resourceId);
}

/* ═══════════════════════════════════════════════════════ reservation actions */

/** POST /v1/reservations/{id}/accept: confirm it, or accept a work request. */
export async function platformAccept(
  engine: BookingEngine,
  identity: Identity,
  id: string,
  input: unknown,
  key?: string,
): Promise<ApiReservation> {
  const manager = managerOf(identity);
  const body = fields(input, ['expected_version'], ['expected_version']);
  const expectedVersion = version(body.expected_version);
  try {
    await engine.changeBooking(manager, id, 'confirm', { expectedVersion }, key);
  } catch (error) {
    // A work request is accepted rather than confirmed: it reserves no time.
    if (!(error instanceof BookingError && error.code === 'nonblocking_request')) throw error;
    await engine.changeBooking(manager, id, 'accept', { expectedVersion }, key);
  }
  return engine.platformReservation(identity, id);
}

/** POST /v1/reservations/{id}/decline: only while it is waiting and unpaid. */
export async function platformDecline(
  engine: BookingEngine,
  identity: Identity,
  id: string,
  input: unknown,
  key?: string,
): Promise<ApiReservation> {
  const manager = managerOf(identity);
  const body = fields(input, ['expected_version', 'reason'], ['expected_version']);
  const expectedVersion = version(body.expected_version);
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 500))
    throw new BookingError(422, 'A reason is at most 500 characters.', 'invalid_input');
  const current = await engine.platformReservation(identity, id);
  if (current.status !== 'requested' || current.paid_cents > 0)
    throw new BookingError(
      409,
      'Only a booking that is still waiting and unpaid can be declined. NexG support cancels a confirmed or paid booking.',
      'decline_not_allowed',
    );
  // The version check inside the cancel refuses a booking paid since it was read.
  await engine.changeBooking(
    manager,
    id,
    'cancel',
    { expectedVersion, ...(body.reason ? { reason: body.reason } : {}) },
    key,
  );
  return engine.platformReservation(identity, id);
}

/** PUT /v1/reservations/{id}/driver: who is coming, or null to clear it. */
export async function platformDriver(
  engine: BookingEngine,
  identity: Identity,
  id: string,
  input: unknown,
  key?: string,
): Promise<ApiReservation> {
  const manager = managerOf(identity);
  const body = fields(input, ['expected_version', 'driver'], ['expected_version', 'driver']);
  const expectedVersion = version(body.expected_version);
  const driver = body.driver === null ? null : normalizeDriver(body.driver);
  const c = engine.managementContext();
  await c.command(manager, key, `booking.${id}.driver`, body, async (req: any) => {
    const doc = await c.own('reservations', id, manager, req);
    if (doc.nexg?.recordRole)
      throw new BookingError(404, 'This record was not found.', 'not_found');
    const n = doc.nexg ?? {};
    const current = n.version ?? 1;
    if (expectedVersion !== current)
      throw new BookingError(
        409,
        'The booking changed. Refresh its details before trying again.',
        'version_conflict',
      );
    if (FINISHED.has(engine.bookingView(doc).status))
      throw new BookingError(
        409,
        'A cancelled or finished booking cannot be given a driver.',
        'invalid_transition',
      );
    await c.update(
      'reservations',
      doc.id,
      {
        nexg: {
          ...n,
          driver: driver ? { ...driver, assignedAt: new Date(c.now()).toISOString() } : null,
          version: current + 1,
        },
      },
      manager,
      req,
    );
    await c.audit(manager, req, driver ? 'booking.driver_assigned' : 'booking.driver_cleared', id, {
      version: current + 1,
    });
    return { id };
  });
  return engine.platformReservation(identity, id);
}
