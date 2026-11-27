import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, createHmac } from 'node:crypto';
import { createPayload } from '../src/payload.js';
import { BookingEngine } from '../src/engine.js';
import { EventDelivery, EVENT_SIGNATURE_HEADER, retryDelayMs } from '../src/event-delivery.js';
import { BookingError, type Identity, type OfferingInput } from '../src/types.js';

// Each test file opens its own SQLite database; see booking.integration.test.ts.
process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = 'true';

const SECRET = 'api-reservations-test-secret-0123456789abcdef';
const EVENTS_URL = 'https://api.example.test/internal/booking-events';

function refused(status: number) {
  return (error: unknown) => error instanceof BookingError && error.status === status;
}

test('reservations for NexG API and the booking outbox sent to NexG', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexg-api-reservations-'));
  const payload = await createPayload({
    sqliteUrl: 'file:' + path.join(directory, 'test.db').replaceAll('\\', '/'),
    secret: 'api-reservations-payload-secret-0123456789',
    cacheKey: randomUUID(),
  });
  t.after(async () => {
    await payload.destroy();
    // Windows can hold the SQLite file a moment after it closes; a leftover temp folder is harmless.
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => undefined,
    );
  });
  const now = Date.parse('2030-01-01T00:00:00Z');
  const engine = new BookingEngine(payload, true, () => now);
  const owner: Identity = {
    businessId: 'api-reservations-business',
    userId: 'api-owner',
    role: 'owner',
    expiresAt: Date.now() + 60_000,
  };
  const platform: Identity = { ...owner, userId: 'api_key_test', role: 'platform' };
  const guest: Identity = { ...owner, userId: 'guest_api', role: 'customer' };
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
  const resource = (await engine.addResource(
    owner,
    { name: 'Van one', kind: 'staff', quantity: 1, schedule },
    randomUUID(),
  )) as any;
  const offering = (await engine.addOffering(
    owner,
    { ...offeringInput, resourceIds: [resource.id] },
    randomUUID(),
  )) as any;
  const entered = (await engine.createBooking(
    owner,
    {
      offeringId: offering.id,
      startTime: '2030-01-02T09:00:00+03:00',
      customer: { name: 'Walk In', email: 'walk.in@example.test', phone: '+254700000123' },
      notes: 'Two suitcases',
    },
    randomUUID(),
  )) as any;
  // A customer booking comes back with the customer's private token beside it.
  const online = (
    (await engine.createBooking(
      guest,
      {
        offeringId: offering.id,
        startTime: '2030-01-02T12:00:00+03:00',
        customer: { name: 'Online Guest' },
      },
      randomUUID(),
      true,
    )) as any
  ).booking;

  await t.test('only the NexG platform reads reservations', async () => {
    await assert.rejects(engine.platformReservations(owner), refused(403));
    await assert.rejects(engine.platformReservation(owner, entered.id), refused(403));
    await assert.rejects(engine.platformReservations(guest), refused(403));
  });

  await t.test('a reservation has the API fields and nothing private', async () => {
    const one = await engine.platformReservation(platform, entered.id);
    assert.equal(one.id, entered.id);
    assert.equal(one.kind, 'reservation');
    assert.equal(one.status, 'confirmed');
    assert.equal(one.stage, 'confirmed');
    assert.deepEqual(one.offering, { id: offering.id, name: 'Airport run', model: 'APPOINTMENT' });
    assert.deepEqual(one.resource_ids, [resource.id]);
    assert.equal(one.starts_at, '2030-01-02T06:00:00.000Z');
    assert.equal(one.guest_name, 'Walk In');
    assert.equal(one.notes, 'Two suitcases');
    assert.equal(one.currency, 'KES');
    assert.equal(one.booked_on, 'merchant');
    assert.ok(one.updated_at && one.created_at);
    const text = JSON.stringify(one);
    for (const hidden of [
      'walk.in@example.test',
      '+254700000123',
      'Token',
      'bookingCode',
      'acceptedConfiguration',
    ])
      assert.equal(text.includes(hidden), false, hidden);

    const mine = await engine.platformReservation(platform, online.id);
    assert.equal(mine.booked_on, 'nexg');
    assert.equal(mine.status, 'requested');
    assert.equal(mine.stage, 'held');
    assert.equal(mine.payment_state, 'awaiting_payment');
    assert.equal(mine.guest_name, 'Online Guest');

    await assert.rejects(
      engine.platformReservation({ ...platform, businessId: 'another-business' }, entered.id),
      refused(404),
    );
    await assert.rejects(engine.platformReservation(platform, 'no-such-booking'), refused(404));
  });

  await t.test('pages run oldest change first and the cursor carries on', async () => {
    const first = await engine.platformReservations(platform, { limit: 1 });
    assert.equal(first.items.length, 1);
    assert.ok(first.next_cursor);
    const second = await engine.platformReservations(platform, {
      limit: 1,
      cursor: first.next_cursor!,
    });
    assert.equal(second.items.length, 1);
    assert.notEqual(second.items[0]!.id, first.items[0]!.id);
    assert.equal(second.next_cursor, null);
    assert.ok(first.items[0]!.updated_at! <= second.items[0]!.updated_at!);
    const all = await engine.platformReservations(platform);
    assert.deepEqual(all.items.map((item) => item.id).sort(), [entered.id, online.id].sort());
    const later = await engine.platformReservations(platform, {
      updatedAfter: all.items[all.items.length - 1]!.updated_at!,
    });
    assert.deepEqual(later.items, []);
    await assert.rejects(engine.platformReservations(platform, { limit: 101 }), refused(400));
    await assert.rejects(engine.platformReservations(platform, { cursor: 'bm9wZQ' }), refused(400));
    await assert.rejects(
      engine.platformReservations(platform, { updatedAfter: 'yesterday' }),
      refused(400),
    );
  });

  await t.test(
    'the outbox goes to NexG signed, and only what NexG accepts is delivered',
    async () => {
      const outbox = async (state: string) =>
        (
          await payload.find({
            collection: 'booking-outbox',
            where: { state: { equals: state } },
            limit: 0,
            depth: 0,
            overrideAccess: true,
          } as any)
        ).docs as any[];
      const waiting = (await outbox('pending')).length;
      assert.ok(waiting >= 5, 'setup, resource, offering and both bookings are in the outbox');

      const down = new EventDelivery(payload, engine, {
        url: EVENTS_URL,
        secret: SECRET,
        batchSize: 100,
        fetchImpl: async () => new Response('unavailable', { status: 503 }),
      });
      const failedOnce = await down.tick();
      assert.equal(failedOnce.delivered, 0);
      assert.equal(failedOnce.failed, 0);
      const retried = await outbox('pending');
      assert.equal(retried.length, waiting);
      assert.ok(retried.every((row) => row.attempts === 1 && /503/.test(row.lastError)));
      assert.equal((await down.tick()).sent, 0, 'nothing is due again before the back-off');

      const posted: { url: string; init: RequestInit }[] = [];
      const delivery = new EventDelivery(payload, engine, {
        url: EVENTS_URL,
        secret: SECRET,
        batchSize: 100,
        now: () => Date.now() + retryDelayMs(1) + 1_000,
        fetchImpl: async (url, init) => {
          posted.push({ url: String(url), init: init! });
          const { events } = JSON.parse(String(init!.body));
          return Response.json({ accepted: events.map((event: any) => event.event_key) });
        },
      });
      const sent = await delivery.tick();
      assert.equal(sent.delivered, waiting);
      assert.equal((await outbox('pending')).length, 0);
      assert.equal(posted.length, 1);
      assert.equal(posted[0]!.url, EVENTS_URL);

      const body = String(posted[0]!.init.body);
      const header = (posted[0]!.init.headers as Record<string, string>)[EVENT_SIGNATURE_HEADER]!;
      const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
      assert.ok(match);
      assert.equal(
        match[2],
        createHmac('sha256', SECRET).update(`booking-events:${match[1]}.${body}`).digest('hex'),
      );

      const { events } = JSON.parse(body);
      const created = events.filter((event: any) => event.event_type === 'booking.created');
      assert.deepEqual(
        created.map((event: any) => event.reservation.id).sort(),
        [entered.id, online.id].sort(),
      );
      assert.ok(events.every((event: any) => event.business_id === owner.businessId));
      const setup = events.filter((event: any) => event.event_type !== 'booking.created');
      assert.ok(setup.length >= 3 && setup.every((event: any) => event.reservation === null));
      for (const hidden of ['Walk In', 'Online Guest', 'Two suitcases', 'walk.in@example.test'])
        assert.equal(body.includes(hidden), false, hidden);
    },
  );

  await t.test('a rejected event fails for good; an unacknowledged one is retried', async () => {
    const before = await engine.platformReservation(platform, entered.id);
    await engine.changeBooking(
      owner,
      entered.id,
      'cancel',
      { expectedVersion: before.version, reason: 'Flight moved' },
      randomUUID(),
    );
    const rows = (
      await payload.find({
        collection: 'booking-outbox',
        where: { state: { equals: 'pending' } },
        limit: 0,
        depth: 0,
        overrideAccess: true,
      } as any)
    ).docs as any[];
    assert.equal(rows.length, 1);
    const cancelled = await engine.platformReservation(platform, entered.id);
    assert.equal(cancelled.status, 'cancelled');

    let seen: any[] = [];
    const quiet = new EventDelivery(payload, engine, {
      url: EVENTS_URL,
      secret: SECRET,
      fetchImpl: async (_url, init) => {
        seen = JSON.parse(String(init!.body)).events;
        return Response.json({ accepted: [] });
      },
    });
    await quiet.tick();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].reservation.status, 'cancelled');
    const unanswered = (
      await payload.find({
        collection: 'booking-outbox',
        where: { eventKey: { equals: seen[0].event_key } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as any)
    ).docs[0] as any;
    assert.equal(unanswered.state, 'pending');
    assert.equal(unanswered.attempts, 1);

    const strict = new EventDelivery(payload, engine, {
      url: EVENTS_URL,
      secret: SECRET,
      now: () => Date.now() + retryDelayMs(1) + 1_000,
      fetchImpl: async (_url, init) => {
        const { events } = JSON.parse(String(init!.body));
        return Response.json({
          accepted: [],
          rejected: events.map((event: any) => ({
            event_key: event.event_key,
            reason: 'bad shape',
          })),
        });
      },
    });
    const result = await strict.tick();
    assert.equal(result.failed, 1);
    const failed = (
      await payload.find({
        collection: 'booking-outbox',
        where: { eventKey: { equals: seen[0].event_key } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as any)
    ).docs[0] as any;
    assert.equal(failed.state, 'failed');
    assert.equal(failed.lastError, 'bad shape');
  });

  await t.test('the sender refuses a bad address or a short secret', () => {
    assert.throws(() => new EventDelivery(payload, engine, { url: 'ftp://x', secret: SECRET }));
    assert.throws(() => new EventDelivery(payload, engine, { url: EVENTS_URL, secret: 'short' }));
  });
});
