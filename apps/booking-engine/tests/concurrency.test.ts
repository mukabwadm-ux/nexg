import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPayload } from '../src/payload.js';
import { BookingEngine } from '../src/engine.js';
import type { Identity, OfferingInput } from '../src/types.js';

process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = 'true';

// Runs on SQLite by default. With BOOKING_TEST_POSTGRES_URL set it runs against
// PostgreSQL, where writes are not serialized in-process and the database row
// lock alone must stop double booking.
const testPostgres = process.env.BOOKING_TEST_POSTGRES_URL;

test('many simultaneous bookings for one place produce exactly one booking', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexg-concurrency-'));
  let options: Record<string, unknown> = {
    sqliteUrl: 'file:' + path.join(directory, 'test.db').replaceAll('\\', '/'),
  };
  let drop = async () => undefined as void;
  if (testPostgres) {
    const { default: pg } = await import('pg');
    const name = 'nexg_booking_test_' + randomUUID().replaceAll('-', '');
    const admin = new pg.Client({ connectionString: testPostgres });
    await admin.connect();
    await admin.query(`create database "${name}"`);
    await admin.end();
    const url = new URL(testPostgres);
    url.pathname = '/' + name;
    options = { postgresUrl: url.toString(), push: true };
    drop = async () => {
      const client = new pg.Client({ connectionString: testPostgres });
      await client.connect();
      await client.query(`drop database if exists "${name}" with (force)`);
      await client.end();
    };
  }
  const payload = await createPayload({
    ...options,
    cacheKey: randomUUID(),
    secret: 'concurrency-test-secret-is-not-production-123456789',
  });
  const now = Date.parse('2030-01-01T00:00:00Z');
  const engine = new BookingEngine(payload, !testPostgres, () => now);
  const owner: Identity = {
    businessId: 'concurrency-salon',
    userId: 'owner',
    role: 'owner',
    expiresAt: Date.now() + 600000,
  };
  try {
    await engine.configure(owner, { subcategoryId: 'haircare', published: false }, randomUUID());
    const resource: any = await engine.addResource(
      owner,
      {
        name: 'Only stylist',
        kind: 'staff',
        quantity: 1,
        schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
      },
      randomUUID(),
    );
    const input: OfferingInput = {
      name: 'Hair styling',
      model: 'APPOINTMENT',
      durationMinutes: 60,
      resourceIds: [resource.id],
      priceMinor: 150000,
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
    const offering: any = await engine.addOffering(owner, input, randomUUID());
    const attempts = 8;
    for (const hour of ['09', '11', '13', '15', '17']) {
      const results = await Promise.allSettled(
        Array.from({ length: attempts }, (_, index) =>
          engine.createBooking(
            owner,
            {
              offeringId: offering.id,
              startTime: `2030-01-02T${hour}:00:00+03:00`,
              customer: { name: `Customer ${index}`, email: `c${index}@example.test` },
            },
            randomUUID(),
          ),
        ),
      );
      const won = results.filter((result) => result.status === 'fulfilled');
      assert.equal(won.length, 1, `exactly one booking at ${hour}:00`);
      // Losers are refused by Payload Reserve's conflict check; none may slip through.
      assert.equal(results.length - won.length, attempts - 1);
    }
    const bookings = (await engine.workspace(owner)).bookings.filter(
      (booking: any) => booking.status === 'confirmed',
    );
    assert.equal(bookings.length, 5);
  } finally {
    await payload.destroy();
    await drop();
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});
