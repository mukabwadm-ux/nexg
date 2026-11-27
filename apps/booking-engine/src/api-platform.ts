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
import { BookingError, type Identity, type OfferingInput, type ResourceInput } from './types.js';

type Doc = Record<string, any>;

const FINISHED = new Set(['cancelled', 'completed', 'expired', 'no-show']);
/** Physical reservations: handed over and returned rather than started and completed. */
const CUSTODY = new Set(['ASSET_INTERVAL', 'STORAGE', 'SPACE_RESERVATION']);

/** The fields given, without the ones left out, so the engine sees no undefined. */
function defined(value: Doc): Doc {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

function note(value: unknown, name: string, max = 500, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new BookingError(422, `${name} is required: at most ${max} characters.`, 'invalid_input');
  return value.trim();
}

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

/** POST /v1/reservations/{id}/reschedule: another time, before it starts. */
export async function platformReschedule(
  engine: BookingEngine,
  identity: Identity,
  id: string,
  input: unknown,
  key?: string,
): Promise<ApiReservation> {
  const manager = managerOf(identity);
  const body = fields(
    input,
    ['expected_version', 'starts_at', 'ends_at', 'expected_total_cents'],
    ['expected_version', 'starts_at'],
  );
  await engine.changeBooking(
    manager,
    id,
    'reschedule',
    defined({
      expectedVersion: version(body.expected_version),
      startTime: body.starts_at,
      endTime: body.ends_at,
      expectedTotalMinor: body.expected_total_cents,
    }),
    key,
  );
  return engine.platformReservation(identity, id);
}

/** POST /v1/reservations/{id}/start: the trip or work begins; a rental is handed over. */
export async function platformStart(
  engine: BookingEngine,
  identity: Identity,
  id: string,
  input: unknown,
  key?: string,
): Promise<ApiReservation> {
  const manager = managerOf(identity);
  const body = fields(input, ['expected_version'], ['expected_version']);
  const model = (await engine.platformReservation(identity, id)).offering.model ?? '';
  const action = CUSTODY.has(model)
    ? model === 'ASSET_INTERVAL'
      ? 'check_out'
      : 'check_in'
    : 'start';
  await engine.changeBooking(
    manager,
    id,
    action,
    { expectedVersion: version(body.expected_version) },
    key,
  );
  return engine.platformReservation(identity, id);
}

/** POST /v1/reservations/{id}/complete: done, with a short note; a rental is returned. */
export async function platformComplete(
  engine: BookingEngine,
  identity: Identity,
  id: string,
  input: unknown,
  key?: string,
): Promise<ApiReservation> {
  const manager = managerOf(identity);
  const body = fields(input, ['expected_version', 'note'], ['expected_version', 'note']);
  const evidence = note(body.note, 'A note on how it went', 2000)!;
  const model = (await engine.platformReservation(identity, id)).offering.model ?? '';
  await engine.changeBooking(
    manager,
    id,
    CUSTODY.has(model) ? 'return' : 'complete',
    { expectedVersion: version(body.expected_version), completionEvidence: evidence },
    key,
  );
  return engine.platformReservation(identity, id);
}

/** POST /v1/reservations/check-in: the customer shows their booking code (and name). */
export async function platformCheckIn(
  engine: BookingEngine,
  identity: Identity,
  input: unknown,
  key?: string,
): Promise<ApiReservation> {
  const manager = managerOf(identity);
  const body = fields(input, ['code', 'name'], ['code']);
  if (typeof body.code !== 'string' || body.code.length > 20)
    throw new BookingError(422, 'Send the six-character booking code.', 'invalid_booking_code');
  const name = note(body.name, 'The name', 120, false);
  const result = (await engine.arriveByCode(
    manager,
    body.code,
    name === undefined ? {} : { reservationName: name },
    key,
  )) as Doc;
  // The answer never carries the code: only the reservation it checked in.
  if (typeof result?.id !== 'string')
    throw new BookingError(409, 'This code was already used.', 'booking_code_used');
  return engine.platformReservation(identity, result.id);
}

/**
 * POST /v1/reservations/{id}/cancel: cancel it before it starts, paid or not.
 * A payment is refunded to the customer by NexG: the booking is marked for
 * Finance to review (refund_state review_required). The reason is shown to the
 * customer.
 */
export async function platformCancel(
  engine: BookingEngine,
  identity: Identity,
  id: string,
  input: unknown,
  key?: string,
): Promise<ApiReservation> {
  const manager = managerOf(identity);
  const body = fields(input, ['expected_version', 'reason'], ['expected_version', 'reason']);
  await engine.changeBooking(
    manager,
    id,
    'cancel',
    { expectedVersion: version(body.expected_version), reason: note(body.reason, 'A reason') },
    key,
  );
  return engine.platformReservation(identity, id);
}

/**
 * POST /v1/reservations: a booking your team took elsewhere (by phone, at the
 * desk), so NexG's calendar holds the time. It is entered as the business, so
 * it needs the guest's email or phone, kept in the engine for the business
 * only: the API never returns them.
 */
export async function platformCreateReservation(
  engine: BookingEngine,
  identity: Identity,
  input: unknown,
  key?: string,
): Promise<ApiReservation> {
  const manager = managerOf(identity);
  const body = fields(
    input,
    [
      'offering_id',
      'starts_at',
      'ends_at',
      'quantity',
      'resource_ids',
      'occurrence_id',
      'ticket_type_id',
      'guest',
      'notes',
      'trip',
      'service_location',
      'hold',
    ],
    ['offering_id', 'guest'],
  );
  const guest = fields(body.guest, ['name', 'email', 'phone'], ['name']);
  const trip =
    body.trip === undefined
      ? undefined
      : fields(
          body.trip,
          ['pickup_area', 'pickup_address', 'dropoff_area', 'dropoff_address', 'flight_number'],
          ['pickup_area', 'pickup_address'],
        );
  const place =
    body.service_location === undefined
      ? undefined
      : fields(body.service_location, ['area', 'address'], ['area', 'address']);
  const made = (await engine.createBooking(
    manager,
    defined({
      offeringId: body.offering_id,
      startTime: body.starts_at,
      endTime: body.ends_at,
      quantity: body.quantity,
      resourceIds: body.resource_ids,
      occurrenceId: body.occurrence_id,
      ticketTypeId: body.ticket_type_id,
      customer: defined({ name: guest.name, email: guest.email, phone: guest.phone }),
      notes: body.notes,
      trip: trip
        ? defined({
            pickupArea: trip.pickup_area,
            pickupAddress: trip.pickup_address,
            dropoffArea: trip.dropoff_area,
            dropoffAddress: trip.dropoff_address,
            flightNumber: trip.flight_number,
          })
        : undefined,
      customerLocation: place ? { area: place.area, address: place.address } : undefined,
      hold: body.hold,
    }) as any,
    key,
  )) as Doc;
  return engine.platformReservation(identity, String(made.id));
}

/** POST /v1/offerings: a new offering, with NexG's standard policies. */
export async function platformCreateOffering(
  engine: BookingEngine,
  identity: Identity,
  input: unknown,
  key?: string,
): Promise<ApiOffering> {
  const manager = managerOf(identity);
  const body = fields(
    input,
    [
      'name',
      'description',
      'model',
      'duration_minutes',
      'price_cents',
      'pricing_basis',
      'resource_ids',
      'capacity',
      'capacity_unit',
      'service_areas',
      'transport_included',
      'with_driver',
      'travel_minutes',
      'booking_enabled',
      'active',
      'lead_time_minutes',
      'horizon_days',
    ],
    ['name', 'model', 'price_cents', 'resource_ids'],
  );
  // Trips and visits keep time to travel between bookings; none unless given.
  const travels = ['TRANSFER', 'FIELD_VISIT'].includes(String(body.model));
  const made = (await engine.addOffering(
    manager,
    defined({
      name: body.name,
      description: body.description,
      model: body.model,
      durationMinutes: body.duration_minutes,
      priceMinor: body.price_cents,
      currency: 'KES',
      pricingBasis: body.pricing_basis,
      resourceIds: body.resource_ids,
      capacity: body.capacity,
      capacityUnit: body.capacity_unit,
      serviceArea: Array.isArray(body.service_areas) ? { areas: body.service_areas } : undefined,
      transportIncluded: body.transport_included,
      withDriver: body.with_driver,
      travelMinutes: body.travel_minutes ?? (travels ? 0 : undefined),
      bookingEnabled: body.booking_enabled ?? true,
      active: body.active ?? true,
      leadTimeMinutes: body.lead_time_minutes ?? 60,
      horizonDays: body.horizon_days ?? 365,
      // NexG's standard terms: customers pay through NexG before a booking confirms.
      intakeMode: 'instant_after_requirements',
      paymentPolicyId: 'NO_PREPAYMENT_V1',
      changePolicyId: 'CHANGE_BEFORE_START_V1',
      policyVersion: 1,
    }) as OfferingInput,
    key,
  )) as Doc;
  return oneOffering(engine, identity, String(made.id));
}

/** POST /v1/resources: a new vehicle, room, guide or pool of places. */
export async function platformCreateResource(
  engine: BookingEngine,
  identity: Identity,
  input: unknown,
  key?: string,
): Promise<ApiResource> {
  const manager = managerOf(identity);
  const body = fields(
    input,
    [
      'name',
      'kind',
      'quantity',
      'schedule',
      'capacity_mode',
      'capacity_unit',
      'party_capacity',
      'active',
    ],
    ['name', 'kind', 'quantity', 'schedule'],
  );
  const made = (await engine.addResource(
    manager,
    defined({
      name: body.name,
      kind: body.kind,
      quantity: body.quantity,
      schedule: body.schedule,
      capacityMode: body.capacity_mode,
      capacityUnit: body.capacity_unit,
      partyCapacity: body.party_capacity,
      active: body.active,
    }) as ResourceInput,
    key,
  )) as Doc;
  return oneResource(engine, identity, String(made.id));
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
