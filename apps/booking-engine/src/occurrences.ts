import { createHash, randomBytes } from 'node:crypto';
import { requireManager } from './auth.js';
import { BookingError, type Identity } from './types.js';
import type { BookingEngine } from './engine.js';
import { normalizeSpecialistSetup } from '@nexg/booking-config/specialists';

type Doc = Record<string, any>;
function publicId(): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6]! & 15) | 0x70;
  bytes[8] = (bytes[8]! & 63) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export interface SessionOccurrence {
  id: string;
  offeringId: string;
  startTime: string;
  endTime: string;
  capacity: number;
  resourceIds: string[];
  published: boolean;
  version: number;
  locationId: string;
}
export interface OccurrenceInput {
  expectedVersion: number;
  startTime: string;
  endTime: string;
  capacity: number;
  published: boolean;
  resourceIds?: string[];
  /** Optional edit of an existing occurrence. Live attendees prevent structural changes. */
  occurrenceId?: string;
  expectedOccurrenceVersion?: number;
}

function integer(value: unknown, label: string, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > 1e9)
    throw new BookingError(
      422,
      `${label} must be an exact whole number of at least ${minimum}.`,
      'invalid_occurrence',
    );
  return value;
}
function parseInstant(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new BookingError(
      422,
      'Session dates need an exact time and UTC offset.',
      'invalid_occurrence_time',
    );
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    throw new BookingError(422, 'Choose a valid session date and time.', 'invalid_occurrence_time');
  return Date.parse(value);
}

/** Rows must first be loaded through the authorized tenant/branch service boundary. */
export function occurrenceView(row: Doc): SessionOccurrence | undefined {
  if (
    typeof row.publicId !== 'string' ||
    !row.publicId ||
    typeof row.offeringId !== 'string' ||
    !row.offeringId ||
    !Number.isSafeInteger(row.capacity) ||
    row.capacity < 1 ||
    !Array.isArray(row.resourceIds) ||
    row.resourceIds.length === 0 ||
    row.resourceIds.some((id: unknown) => typeof id !== 'string' || !id) ||
    typeof row.published !== 'boolean' ||
    !Number.isFinite(Date.parse(row.startTime)) ||
    !Number.isFinite(Date.parse(row.endTime)) ||
    Date.parse(row.endTime) <= Date.parse(row.startTime)
  )
    return undefined;
  return {
    id: row.publicId,
    offeringId: row.offeringId,
    startTime: new Date(row.startTime).toISOString(),
    endTime: new Date(row.endTime).toISOString(),
    capacity: row.capacity,
    resourceIds: [...row.resourceIds],
    published: row.published,
    version: Number.isSafeInteger(row.version) && row.version > 0 ? row.version : 1,
    locationId: row.locationId ?? row.nexg?.locationId ?? 'primary',
  };
}

/** A dated session is merchant-created; a missing row never becomes an implicit occurrence. */
export function listCurrentOccurrences(
  rows: readonly Doc[],
  options: { offeringId?: string; date?: string; now?: number; includePast?: boolean } = {},
): SessionOccurrence[] {
  const now = options.now ?? Date.now();
  return rows
    .map(occurrenceView)
    .filter(
      (item): item is SessionOccurrence =>
        !!item &&
        item.published &&
        (!options.offeringId || item.offeringId === options.offeringId) &&
        (options.includePast === true || Date.parse(item.startTime) >= now) &&
        (!options.date ||
          new Date(Date.parse(item.startTime) + 3 * 60 * 60 * 1000).toISOString().slice(0, 10) ===
            options.date),
    )
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || a.id.localeCompare(b.id));
}

export function findPublishedOccurrence(
  rows: readonly Doc[],
  input: {
    offeringId: string;
    occurrenceId?: string;
    startTime: string;
    endTime: string;
    now?: number;
  },
): SessionOccurrence | undefined {
  const start = Date.parse(input.startTime),
    end = Date.parse(input.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return listCurrentOccurrences(rows, { offeringId: input.offeringId, now: input.now }).find(
    (item) =>
      (!input.occurrenceId || item.id === input.occurrenceId) &&
      Date.parse(item.startTime) === start &&
      Date.parse(item.endTime) === end,
  );
}

/** Safe upper bound; occurrence-level enrollment and resource occupancy must also be checked transactionally. */
export function occurrenceCapacity(
  service: Doc,
  resources: readonly Doc[],
  occurrence?: Pick<SessionOccurrence, 'capacity'>,
): number {
  const pools = resources.filter(
    (resource) =>
      resource.capacityMode === 'per-guest' &&
      ['person', 'place'].includes(resource.nexg?.capacityUnit),
  );
  if (pools.length !== 1)
    throw new BookingError(
      422,
      'A session needs exactly one explicit person/place capacity pool.',
      'session_pool_required',
    );
  const pool = pools[0]!;
  if (pool.nexg?.quantityScale !== undefined && pool.nexg.quantityScale !== 0)
    throw new BookingError(
      422,
      'Session places use whole-person capacity.',
      'invalid_session_unit',
    );
  const poolCapacity = integer(pool.quantity, 'Place-pool capacity');
  const offeringCapacity =
    service.nexg?.capacity === undefined
      ? poolCapacity
      : integer(service.nexg.capacity, 'Offering session capacity');
  return Math.min(
    poolCapacity,
    offeringCapacity,
    occurrence ? integer(occurrence.capacity, 'Occurrence capacity') : Number.MAX_SAFE_INTEGER,
  );
}

/** Create, publish or revise a real dated occurrence; shared resources are reserved once for the occurrence. */
export async function addOccurrence(
  engine: BookingEngine,
  identity: Identity,
  offeringId: string,
  input: OccurrenceInput,
  key?: string,
) {
  requireManager(identity);
  const c = engine.managementContext();
  const permitted = new Set([
    'expectedVersion',
    'startTime',
    'endTime',
    'capacity',
    'published',
    'resourceIds',
    'occurrenceId',
    'expectedOccurrenceVersion',
  ]);
  if (!input || Object.keys(input).some((field) => !permitted.has(field)))
    throw new BookingError(422, 'Send only the dated session fields.', 'invalid_occurrence');
  if (typeof input.published !== 'boolean')
    throw new BookingError(
      422,
      'Choose whether this occurrence is published.',
      'invalid_occurrence',
    );
  return c.command(identity, key, `offering.${offeringId}.occurrence`, input, async (req: any) => {
    const service = await c.own('services', offeringId, identity, req);
    const sharedTour =
      service.nexg?.model === 'TOUR'
        ? normalizeSpecialistSetup('TOUR', service.nexg.specialistSetup)
        : undefined;
    if (
      service.nexg?.model !== 'SESSION_CAPACITY' &&
      (!sharedTour || sharedTour.model !== 'TOUR' || sharedTour.mode !== 'shared')
    )
      throw new BookingError(
        422,
        'Dated occurrences apply to sessions, events and shared tour departures.',
        'invalid_occurrence_model',
      );
    const offeringVersion = service.nexg?.version ?? 1;
    if (input.expectedVersion !== offeringVersion)
      throw new BookingError(
        409,
        'This offering changed. Refresh before adding a session.',
        'version_conflict',
      );
    const start = parseInstant(input.startTime),
      end = parseInstant(input.endTime);
    if (
      end <= start ||
      (sharedTour
        ? end - start < (service.nexg.minDurationMinutes ?? 1) * 60000 ||
          end - start > (service.nexg.maxDurationMinutes ?? 366 * 1440) * 60000
        : end - start !== service.duration * 60000)
    )
      throw new BookingError(
        422,
        'The occurrence must match this offering’s accepted duration or tour interval range.',
        'invalid_occurrence_duration',
      );
    if (start < c.now() + integer(service.nexg?.leadTimeMinutes ?? 0, 'Lead time', 0) * 60000)
      throw new BookingError(
        422,
        'Publish a session after the required booking lead time.',
        'invalid_occurrence_time',
      );
    if (
      service.nexg?.horizonDays &&
      start > c.now() + integer(service.nexg.horizonDays, 'Booking horizon') * 86400000
    )
      throw new BookingError(
        422,
        'The session is outside this offering’s booking horizon.',
        'invalid_occurrence_time',
      );
    if (input.published && service.active === false)
      throw new BookingError(
        409,
        'Activate the offering before publishing its sessions.',
        'inactive_offering',
      );
    const allowed = service.nexg?.resourceIds;
    if (!Array.isArray(allowed) || !allowed.length)
      throw new BookingError(
        422,
        'Assign this session’s real resources first.',
        'resources_required',
      );
    if (
      input.resourceIds !== undefined &&
      (!Array.isArray(input.resourceIds) || input.resourceIds.some((id) => typeof id !== 'string'))
    )
      throw new BookingError(422, 'Choose eligible session resources.', 'resource_mismatch');
    const resourceIds = [...new Set<string>(input.resourceIds ?? allowed)];
    if (!resourceIds.length || resourceIds.some((id) => !allowed.includes(id)))
      throw new BookingError(
        422,
        'Choose only resources assigned to this offering.',
        'resource_mismatch',
      );
    if (
      service.nexg?.resourceSelectionMode === 'choose_one'
        ? resourceIds.length !== 1
        : allowed.some((id: string) => !resourceIds.includes(id))
    )
      throw new BookingError(
        422,
        'Keep the required session resource bundle together.',
        'resource_bundle_required',
      );
    const resources = await Promise.all(
      resourceIds.map((id) => c.own('resources', id, identity, req)),
    );
    if (sharedTour && sharedTour.model === 'TOUR') {
      const expected = [...sharedTour.resourceIds, sharedTour.poolResourceId!].sort().join('|');
      if ([...resourceIds].sort().join('|') !== expected)
        throw new BookingError(
          422,
          'Keep the configured guide, vehicle/equipment and departure place pool together.',
          'tour_resource_mismatch',
        );
    }
    if (resources.some((resource) => resource.active === false))
      throw new BookingError(409, 'An occurrence resource is inactive.', 'inactive_resource');
    const maximum = Math.min(
      occurrenceCapacity(service, resources),
      sharedTour && sharedTour.model === 'TOUR'
        ? sharedTour.maximumParticipants
        : Number.MAX_SAFE_INTEGER,
    );
    const capacity = integer(input.capacity, 'Occurrence capacity');
    if (capacity > maximum)
      throw new BookingError(
        422,
        `This occurrence can contain at most ${maximum} places.`,
        'occurrence_capacity',
      );
    const rows = await c.all('booking-sessions', identity, req);
    const existing = input.occurrenceId
      ? rows.find((row) => row.publicId === input.occurrenceId && row.offeringId === offeringId)
      : undefined;
    if (input.occurrenceId && !existing)
      throw new BookingError(404, 'This session occurrence was not found.', 'not_found');
    if (existing && input.expectedOccurrenceVersion !== (existing.version ?? 1))
      throw new BookingError(
        409,
        'This occurrence changed. Refresh before saving.',
        'version_conflict',
      );
    const startTime = new Date(start).toISOString(),
      endTime = new Date(end).toISOString();
    const sessionKey = createHash('sha256')
      .update(`${identity.businessId}:${offeringId}:${startTime}:${endTime}`)
      .digest('hex');
    if (rows.some((row) => row.id !== existing?.id && row.sessionKey === sessionKey))
      throw new BookingError(
        409,
        'This exact dated occurrence already exists.',
        'duplicate_occurrence',
      );
    if (existing) {
      const reservations = await c.all('reservations', identity, req);
      if (
        reservations.some(
          (row) =>
            (String(row.nexg?.sessionId) === String(existing.id) ||
              (row.nexg?.occurrenceId === existing.publicId &&
                row.nexg?.recordRole !== 'session_allocation')) &&
            ['held', 'confirmed'].includes(row.status),
        )
      )
        throw new BookingError(
          409,
          'This occurrence has live attendees. Resolve their bookings before changing it.',
          'occurrence_has_commitments',
        );
      if (existing.reservationId) {
        const anchor = reservations.find(
          (row) => String(row.id) === String(existing.reservationId),
        );
        if (anchor?.status === 'confirmed')
          await c.update('reservations', anchor.id, { status: 'cancelled' }, identity, req);
      }
    }
    await engine.validateOccurrence(identity, service, resources, start, end, req);
    const pool = resources.find(
      (resource) =>
        resource.capacityMode === 'per-guest' &&
        ['person', 'place'].includes(resource.nexg?.capacityUnit),
    )!;
    const extras = resources.filter((resource) => resource.id !== pool.id);
    let reservationId: string | null = null;
    const occurrenceId = existing?.publicId ?? publicId();
    const locationId = service.nexg?.locationId ?? 'primary';
    if (input.published && extras.length) {
      const anchor = await c.create(
        'reservations',
        {
          publicId: publicId(),
          service: service.id,
          resource: extras[0]!.id,
          startTime,
          endTime,
          status: 'confirmed',
          guest: { name: 'Session resource allocation', email: 'allocation@nexg.invalid' },
          guestCount: 1,
          items: extras
            .slice(1)
            .map((resource) => ({ resource: resource.id, service: service.id, guestCount: 1 })),
          nexg: {
            recordRole: 'session_allocation',
            occurrenceId,
            resourceIds: extras.map((resource) => resource.publicId),
            locationId,
            version: 1,
          },
        },
        identity,
        req,
      );
      reservationId = String(anchor.id);
    }
    const data = {
      publicId: occurrenceId,
      sessionKey,
      reservationId,
      offeringId,
      startTime,
      endTime,
      capacity,
      resourceIds,
      published: input.published,
      version: existing ? (existing.version ?? 1) + 1 : 1,
      locationId,
    };
    const row = existing
      ? await c.update('booking-sessions', existing.id, data, identity, req)
      : await c.create('booking-sessions', data, identity, req);
    await c.update(
      'services',
      service.id,
      { nexg: { ...service.nexg, version: offeringVersion + 1 } },
      identity,
      req,
    );
    await c.audit(
      identity,
      req,
      existing ? 'booking.occurrence.updated' : 'booking.occurrence.created',
      occurrenceId,
      { offeringId, version: data.version, published: data.published },
    );
    return { ...occurrenceView(row)!, offeringVersion: offeringVersion + 1 };
  });
}
