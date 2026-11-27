import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPayload } from '../src/payload.js';
import { BookingEngine } from '../src/engine.js';
import {
  platformCancel,
  platformCheckIn,
  platformComplete,
  platformCreateOffering,
  platformCreateReservation,
  platformCreateResource,
  platformReschedule,
  platformStart,
} from '../src/api-platform.js';
import { BookingError, type Identity } from '../src/types.js';

// Each test file opens its own SQLite database; see booking.integration.test.ts.
process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = 'true';

function refused(status: number, code?: string) {
  return (error: unknown) =>
    error instanceof BookingError && error.status === status && (!code || error.code === code);
}

test('a business runs its bookings from its own system', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexg-api-steps-'));
  const payload = await createPayload({
    sqliteUrl: 'file:' + path.join(directory, 'test.db').replaceAll('\\', '/'),
    secret: 'api-steps-payload-secret-0123456789abcdefgh',
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
    businessId: 'api-steps-business',
    userId: 'steps-owner',
    role: 'owner',
    expiresAt: Date.now() + 60_000,
  };
  const platform: Identity = { ...owner, userId: 'api_key_k2', role: 'platform' };
  const guest: Identity = { ...owner, userId: 'guest_steps', role: 'customer' };
  const schedule = { days: [0, 1, 2, 3, 4, 5, 6], start: '04:00', end: '23:00' };
  await engine.configure(owner, { subcategoryId: 'haircare', published: true }, randomUUID());

  const driver = await platformCreateResource(
    engine,
    platform,
    { name: 'Driver Juma', kind: 'staff', quantity: 1, schedule },
    randomUUID(),
  );
  const run = await platformCreateOffering(
    engine,
    platform,
    {
      name: 'City run',
      model: 'APPOINTMENT',
      duration_minutes: 60,
      price_cents: 350000,
      resource_ids: [driver.id],
      lead_time_minutes: 0,
    },
    randomUUID(),
  );

  await t.test('makes a resource and an offering with NexG’s standard terms', async () => {
    assert.equal(driver.name, 'Driver Juma');
    assert.deepEqual(driver.schedule, schedule);
    assert.equal(run.price_cents, 350000);
    assert.deepEqual(run.resource_ids, [driver.id]);
    assert.equal(run.booking_enabled, true);
    await assert.rejects(
      platformCreateOffering(engine, platform, { name: 'No price', model: 'APPOINTMENT' }, 'k0'),
      refused(422),
    );
  });

  await t.test('records a booking taken by phone, without returning the contact', async () => {
    const taken = await platformCreateReservation(
      engine,
      platform,
      {
        offering_id: run.id,
        starts_at: '2030-01-02T09:00:00+03:00',
        guest: { name: 'Phone Guest', phone: '+254700111222' },
        notes: 'Booked by phone',
      },
      randomUUID(),
    );
    assert.equal(taken.booked_on, 'merchant');
    assert.equal(taken.status, 'confirmed');
    assert.equal(taken.guest_name, 'Phone Guest');
    assert.equal(JSON.stringify(taken).includes('+254700111222'), false);

    const moved = await platformReschedule(
      engine,
      platform,
      taken.id,
      { expected_version: taken.version, starts_at: '2030-01-02T11:00:00+03:00' },
      randomUUID(),
    );
    assert.equal(moved.starts_at, '2030-01-02T08:00:00.000Z');
    assert.equal(moved.version, taken.version + 1);

    const started = await platformStart(
      engine,
      platform,
      taken.id,
      { expected_version: moved.version },
      randomUUID(),
    );
    assert.equal(started.status, 'in_progress');
    await assert.rejects(
      platformComplete(engine, platform, taken.id, { expected_version: started.version }, 'k1'),
      refused(422),
    );
    const done = await platformComplete(
      engine,
      platform,
      taken.id,
      { expected_version: started.version, note: 'Dropped at the hotel at 10:42' },
      randomUUID(),
    );
    assert.equal(done.status, 'completed');
    await assert.rejects(
      platformReschedule(
        engine,
        platform,
        taken.id,
        { expected_version: done.version, starts_at: '2030-01-03T09:00:00+03:00' },
        'k2',
      ),
      refused(409),
    );
  });

  // A customer booking on NexG, paid through NexG.
  const paidBooking = async (startTime: string, reference: string) => {
    const made = (await engine.createBooking(
      guest,
      { offeringId: run.id, startTime, customer: { name: 'Online Guest' } },
      randomUUID(),
      true,
    )) as any;
    await engine.settlePayment(
      platform,
      made.booking.id,
      { provider: 'paystack', reference, amountMinor: 350000 },
      randomUUID(),
    );
    return made as { booking: { id: string }; customerToken: string };
  };

  await t.test(
    'cancels a paid booking, flagging the refund and telling the customer why',
    async () => {
      const made = await paidBooking('2030-01-03T09:00:00+03:00', 'PSK-STEP-1');
      const current = await engine.platformReservation(platform, made.booking.id);
      assert.equal(current.status, 'confirmed');
      assert.equal(current.paid_cents, 350000);
      await assert.rejects(
        platformCancel(
          engine,
          platform,
          made.booking.id,
          { expected_version: current.version },
          'k3',
        ),
        refused(422),
      );
      const cancelled = await platformCancel(
        engine,
        platform,
        made.booking.id,
        { expected_version: current.version, reason: 'The vehicle broke down.' },
        randomUUID(),
      );
      assert.equal(cancelled.status, 'cancelled');
      assert.equal(cancelled.refund_state, 'review_required');
      const seen = (await engine.customerBooking(
        guest,
        made.booking.id,
        made.customerToken,
      )) as any;
      assert.equal(seen.cancelReason, 'The vehicle broke down.');
    },
  );

  await t.test('checks a customer in with their booking code and name', async () => {
    const made = await paidBooking('2030-01-04T09:00:00+03:00', 'PSK-STEP-2');
    const code = ((await engine.customerBooking(guest, made.booking.id, made.customerToken)) as any)
      .bookingCode as string;
    assert.match(code, /^[A-Z0-9]{6}$/);
    await assert.rejects(
      platformCheckIn(engine, platform, { code, name: 'Somebody Else' }, randomUUID()),
      refused(409, 'reservation_name_mismatch'),
    );
    const arrived = await platformCheckIn(
      engine,
      platform,
      { code, name: 'Online Guest' },
      randomUUID(),
    );
    assert.equal(arrived.id, made.booking.id);
    assert.equal(arrived.status, 'in_progress');
    assert.ok(arrived.checked_in_at);
    assert.equal(JSON.stringify(arrived).includes(code), false, 'the code is never returned');
  });

  await t.test('keeps a transfer’s flight number the way airlines print it', async () => {
    // A transfer business: its specialty allows transfers.
    const transfers: Identity = { ...owner, businessId: 'api-steps-transfers' };
    const transferApi: Identity = { ...platform, businessId: transfers.businessId };
    await engine.configure(
      transfers,
      { subcategoryId: 'airport_pickup', published: true },
      randomUUID(),
    );
    const van = await platformCreateResource(
      engine,
      transferApi,
      { name: 'Van one', kind: 'vehicle', quantity: 1, schedule },
      randomUUID(),
    );
    const chauffeur = await platformCreateResource(
      engine,
      transferApi,
      { name: 'Driver Otieno', kind: 'staff', quantity: 1, schedule },
      randomUUID(),
    );
    const transfer = await platformCreateOffering(
      engine,
      transferApi,
      {
        name: 'JKIA to Westlands',
        model: 'TRANSFER',
        duration_minutes: 60,
        price_cents: 450000,
        // A transfer needs a vehicle and a driver together.
        resource_ids: [van.id, chauffeur.id],
        service_areas: ['JKIA', 'Westlands'],
        transport_included: true,
        lead_time_minutes: 0,
      },
      randomUUID(),
    );
    const trip = {
      pickup_area: 'JKIA',
      pickup_address: 'Terminal 1A arrivals',
      dropoff_area: 'Westlands',
      dropoff_address: 'Woodvale Grove',
    };
    await assert.rejects(
      platformCreateReservation(
        engine,
        transferApi,
        {
          offering_id: transfer.id,
          starts_at: '2030-01-05T06:30:00+03:00',
          guest: { name: 'Amina', email: 'amina@example.test' },
          trip: { ...trip, flight_number: 'not a flight' },
        },
        'k4',
      ),
      refused(422, 'invalid_flight_number'),
    );
    const booked = await platformCreateReservation(
      engine,
      transferApi,
      {
        offering_id: transfer.id,
        starts_at: '2030-01-05T06:30:00+03:00',
        guest: { name: 'Amina', email: 'amina@example.test' },
        trip: { ...trip, flight_number: 'kq101' },
      },
      randomUUID(),
    );
    assert.equal(booked.trip?.flight_number, 'KQ 101');
    assert.equal(booked.trip?.pickup_area, 'JKIA');
  });
});
