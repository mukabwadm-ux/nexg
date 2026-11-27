import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPayload } from '../src/payload.js';
import { BookingEngine } from '../src/engine.js';
import {
  platformAccept,
  platformClosure,
  platformDecline,
  platformDeparture,
  platformDriver,
  platformOfferings,
  platformRemoveClosure,
  platformResources,
  platformUpdateOffering,
} from '../src/api-platform.js';
import { BookingError, type Identity, type OfferingInput } from '../src/types.js';

// Each test file opens its own SQLite database; see booking.integration.test.ts.
process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = 'true';

function refused(status: number, code?: string) {
  return (error: unknown) =>
    error instanceof BookingError && error.status === status && (!code || error.code === code);
}

test('what NexG API may change for a business', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexg-api-platform-'));
  const payload = await createPayload({
    sqliteUrl: 'file:' + path.join(directory, 'test.db').replaceAll('\\', '/'),
    secret: 'api-platform-payload-secret-0123456789abcd',
    cacheKey: randomUUID(),
  });
  t.after(async () => {
    await payload.destroy();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => undefined,
    );
  });
  const engine = new BookingEngine(payload, true, () => Date.parse('2030-01-01T00:00:00Z'));
  const owner: Identity = {
    businessId: 'api-platform-business',
    userId: 'platform-owner',
    role: 'owner',
    expiresAt: Date.now() + 60_000,
  };
  const platform: Identity = { ...owner, userId: 'api_key_k1', role: 'platform' };
  const guest: Identity = { ...owner, userId: 'guest_platform', role: 'customer' };
  const schedule = { days: [0, 1, 2, 3, 4, 5, 6], start: '06:00', end: '22:00' };
  const offeringInput: OfferingInput = {
    name: 'Airport run',
    model: 'APPOINTMENT',
    durationMinutes: 60,
    resourceIds: [],
    priceMinor: 350000,
    currency: 'KES',
    intakeMode: 'instant_after_requirements',
    active: true,
    bookingEnabled: true,
    leadTimeMinutes: 0,
    horizonDays: 3650,
    paymentPolicyId: 'NO_PREPAYMENT_V1',
    changePolicyId: 'CHANGE_BEFORE_START_V1',
    policyVersion: 1,
  };

  await engine.configure(owner, { subcategoryId: 'haircare', published: true }, randomUUID());
  const van = (await engine.addResource(
    owner,
    { name: 'Van one', kind: 'staff', quantity: 1, schedule },
    randomUUID(),
  )) as any;
  const run = (await engine.addOffering(
    owner,
    { ...offeringInput, resourceIds: [van.id] },
    randomUUID(),
  )) as any;

  await t.test('only the NexG platform may use these', async () => {
    await assert.rejects(platformOfferings(engine, owner), refused(403));
    await assert.rejects(platformResources(engine, guest), refused(403));
    await assert.rejects(
      platformUpdateOffering(engine, owner, run.id, { expected_version: 1, price_cents: 1 }, 'k'),
      refused(403),
    );
  });

  await t.test('lists offerings and resources as the API shows them', async () => {
    const { items: offerings } = await platformOfferings(engine, platform);
    assert.equal(offerings.length, 1);
    assert.equal(offerings[0]!.id, run.id);
    assert.equal(offerings[0]!.price_cents, 350000);
    assert.equal(offerings[0]!.model, 'APPOINTMENT');
    assert.deepEqual(offerings[0]!.resource_ids, [van.id]);
    assert.deepEqual(offerings[0]!.departures, []);
    const { items: resources } = await platformResources(engine, platform);
    assert.equal(resources[0]!.id, van.id);
    assert.deepEqual(resources[0]!.schedule, schedule);
    assert.deepEqual(resources[0]!.closures, []);
  });

  await t.test('changes a price, refusing a stale version and unknown fields', async () => {
    const before = (await platformOfferings(engine, platform)).items[0]!;
    await assert.rejects(
      platformUpdateOffering(
        engine,
        platform,
        run.id,
        { expected_version: before.version + 5, price_cents: 400000 },
        randomUUID(),
      ),
      refused(409, 'version_conflict'),
    );
    await assert.rejects(
      platformUpdateOffering(
        engine,
        platform,
        run.id,
        { expected_version: before.version, name: 'Renamed' },
        randomUUID(),
      ),
      refused(422),
    );
    const after = await platformUpdateOffering(
      engine,
      platform,
      run.id,
      { expected_version: before.version, price_cents: 400000, booking_enabled: true },
      randomUUID(),
    );
    assert.equal(after.price_cents, 400000);
    assert.equal(after.version, before.version + 1);
  });

  await t.test('closes a resource for a time and opens it again', async () => {
    const before = (await platformResources(engine, platform)).items[0]!;
    const closed = await platformClosure(
      engine,
      platform,
      van.id,
      {
        expected_version: before.version,
        starts_at: '2030-01-05T08:00:00+03:00',
        ends_at: '2030-01-05T12:00:00+03:00',
        reason: 'Booked on our own website',
      },
      randomUUID(),
    );
    assert.equal(closed.closures.length, 1);
    assert.equal(closed.closures[0]!.reason, 'Booked on our own website');
    assert.equal(closed.closures[0]!.starts_at, '2030-01-05T05:00:00.000Z');
    const opened = await platformRemoveClosure(
      engine,
      platform,
      van.id,
      closed.closures[0]!.id,
      closed.version,
      randomUUID(),
    );
    assert.deepEqual(opened.closures, []);
    assert.equal(opened.version, closed.version + 1);
  });

  // Merchant-entered holds: no payment is required, so the business decides.
  const hold = async (startTime: string) =>
    (await engine.createBooking(
      owner,
      {
        offeringId: run.id,
        startTime,
        customer: { name: 'Held Guest', email: 'held.guest@example.test' },
        hold: true,
      },
      randomUUID(),
    )) as any;

  await t.test('accepts a waiting reservation', async () => {
    const waiting = await hold('2030-01-02T09:00:00+03:00');
    const current = await engine.platformReservation(platform, waiting.id);
    assert.equal(current.status, 'requested');
    await assert.rejects(
      platformAccept(engine, platform, waiting.id, { expected_version: current.version + 1 }, 'k1'),
      refused(409, 'version_conflict'),
    );
    const accepted = await platformAccept(
      engine,
      platform,
      waiting.id,
      { expected_version: current.version },
      randomUUID(),
    );
    assert.equal(accepted.status, 'confirmed');
    await assert.rejects(
      platformDecline(engine, platform, waiting.id, { expected_version: accepted.version }, 'k2'),
      refused(409, 'decline_not_allowed'),
    );
  });

  await t.test('declines a waiting, unpaid reservation', async () => {
    const waiting = await hold('2030-01-02T11:00:00+03:00');
    const current = await engine.platformReservation(platform, waiting.id);
    const declined = await platformDecline(
      engine,
      platform,
      waiting.id,
      { expected_version: current.version, reason: 'No van free' },
      randomUUID(),
    );
    assert.equal(declined.status, 'cancelled');
  });

  await t.test('a driver is set, shown to the customer, and cleared', async () => {
    const booked = (await engine.createBooking(
      guest,
      {
        offeringId: run.id,
        startTime: '2030-01-03T09:00:00+03:00',
        customer: { name: 'Online Guest' },
      },
      randomUUID(),
      true,
    )) as any;
    const id = booked.booking.id;
    const current = await engine.platformReservation(platform, id);
    await assert.rejects(
      platformDriver(
        engine,
        platform,
        id,
        {
          expected_version: current.version,
          driver: { first_name: 'Juma', vehicle: 'White Toyota Noah', phone: '0700000000' },
        },
        'd0',
      ),
      refused(422, 'invalid_driver'),
    );
    const assigned = await platformDriver(
      engine,
      platform,
      id,
      {
        expected_version: current.version,
        driver: { first_name: 'Juma', vehicle: 'White Toyota Noah', plate: 'kda 123a' },
      },
      randomUUID(),
    );
    assert.equal(assigned.version, current.version + 1);
    assert.deepEqual(
      { ...assigned.driver, assigned_at: undefined },
      {
        first_name: 'Juma',
        vehicle: 'White Toyota Noah',
        plate: 'KDA 123A',
        assigned_at: undefined,
      },
    );
    assert.ok(assigned.driver?.assigned_at);
    const seen = await engine.customerBooking(guest, id, booked.customerToken);
    assert.equal((seen as any).driver.firstName, 'Juma');
    assert.equal((seen as any).driver.plate, 'KDA 123A');
    const cleared = await platformDriver(
      engine,
      platform,
      id,
      { expected_version: assigned.version, driver: null },
      randomUUID(),
    );
    assert.equal(cleared.driver, null);
  });

  await t.test('adds a departure to a session offering', async () => {
    const classes: Identity = { ...owner, businessId: 'api-platform-sessions' };
    const sessions: Identity = { ...platform, businessId: classes.businessId };
    await engine.configure(classes, { subcategoryId: 'workshops' }, randomUUID());
    const pool = (await engine.addResource(
      classes,
      {
        name: 'Seats',
        kind: 'capacity_pool',
        quantity: 12,
        capacityUnit: 'place',
        quantityScale: 0,
        capacityMode: 'per-guest',
        schedule,
      },
      randomUUID(),
    )) as any;
    const guide = (await engine.addResource(
      classes,
      { name: 'Guide', kind: 'staff', quantity: 1, schedule },
      randomUUID(),
    )) as any;
    const tour = (await engine.addOffering(
      classes,
      {
        ...offeringInput,
        name: 'City walk',
        model: 'SESSION_CAPACITY',
        resourceIds: [pool.id, guide.id],
        capacity: 12,
        capacityUnit: 'place',
      },
      randomUUID(),
    )) as any;
    const offering = await platformDeparture(
      engine,
      sessions,
      tour.id,
      {
        expected_version: 1,
        starts_at: '2030-01-04T09:00:00+03:00',
        ends_at: '2030-01-04T10:00:00+03:00',
        capacity: 10,
        published: true,
      },
      randomUUID(),
    );
    assert.equal(offering.departures.length, 1);
    assert.equal(offering.departures[0]!.capacity, 10);
    assert.equal(offering.departures[0]!.starts_at, '2030-01-04T06:00:00.000Z');
  });
});
