import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createPayload } from '../src/payload.js';
import { BookingEngine } from '../src/engine.js';
import { createBookingServer } from '../src/server.js';
import {
  platformClosure,
  platformCreateOffering,
  platformCreateResource,
} from '../src/api-platform.js';
import type { Identity } from '../src/types.js';

// Each test file opens its own SQLite database; see booking.integration.test.ts.
process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = 'true';

test('a NexG API test key tries setup changes without saving them', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexg-api-sandbox-'));
  const payload = await createPayload({
    sqliteUrl: 'file:' + path.join(directory, 'test.db').replaceAll('\\', '/'),
    secret: 'api-sandbox-payload-secret-0123456789abcdef',
    cacheKey: randomUUID(),
  });
  const secret = 'api-sandbox-bridge-secret-0123456789';
  const engine = new BookingEngine(payload, true, () => Date.parse('2030-01-01T00:00:00Z'));
  const server = createBookingServer(engine, secret);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await payload.destroy();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => undefined,
    );
  });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;

  const owner: Identity = {
    businessId: 'api-sandbox-business',
    userId: 'sandbox-owner',
    role: 'owner',
    expiresAt: Date.now() + 60_000,
  };
  const live: Identity = { ...owner, userId: 'api_key_live1', role: 'platform' };
  const test: Identity = { ...live, userId: 'api_key_test1', sandbox: true };
  const schedule = { days: [0, 1, 2, 3, 4, 5, 6], start: '06:00', end: '22:00' };
  await engine.configure(owner, { subcategoryId: 'haircare', published: true }, randomUUID());
  const driver = await platformCreateResource(
    engine,
    live,
    { name: 'Driver Achieng', kind: 'staff', quantity: 1, schedule },
    randomUUID(),
  );
  const run = await platformCreateOffering(
    engine,
    live,
    {
      name: 'Airport run',
      model: 'APPOINTMENT',
      duration_minutes: 60,
      price_cents: 450000,
      resource_ids: [driver.id],
      lead_time_minutes: 0,
    },
    randomUUID(),
  );

  const call = (who: Identity, route: string, init: RequestInit = {}, key = randomUUID()) => {
    const context = Buffer.from(
      JSON.stringify({ ...who, expiresAt: Date.now() + 60_000 }),
    ).toString('base64url');
    return fetch(base + route, {
      ...init,
      headers: {
        'x-nexg-booking-context': context,
        'x-nexg-booking-signature': createHmac('sha256', secret).update(context).digest('hex'),
        'idempotency-key': key,
        'content-type': 'application/json',
      },
    });
  };
  const json = async (response: Response) => (await response.json()) as any;
  const saved = async () => {
    const offerings = await json(await call(live, '/v1/platform/offerings'));
    const resources = await json(await call(live, '/v1/platform/resources'));
    const events = await payload.count({
      collection: 'booking-outbox' as any,
      overrideAccess: true,
    });
    const operations = await payload.count({
      collection: 'booking-operations' as any,
      overrideAccess: true,
    });
    return {
      offerings: offerings.items,
      resources: resources.items,
      events: events.totalDocs,
      operations: operations.totalDocs,
    };
  };

  await t.test('reads the real offerings and resources', async () => {
    const offerings = await json(await call(test, '/v1/platform/offerings'));
    assert.deepEqual(
      offerings.items.map((item: { id: string }) => item.id),
      [run.id],
    );
    const resources = await json(await call(test, '/v1/platform/resources'));
    assert.equal(resources.items[0].id, driver.id);
  });

  await t.test('answers a change as it would be, and saves nothing', async () => {
    const before = await saved();
    const price = await call(test, `/v1/platform/offerings/${run.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ expected_version: run.version, price_cents: 520000 }),
    });
    assert.equal(price.status, 200);
    const tried = await json(price);
    assert.equal(tried.price_cents, 520000);
    assert.equal(tried.version, run.version + 1);

    const closed = await call(test, `/v1/platform/resources/${driver.id}/closures`, {
      method: 'POST',
      body: JSON.stringify({
        expected_version: driver.version,
        starts_at: '2030-01-03T09:00:00+03:00',
        ends_at: '2030-01-03T12:00:00+03:00',
        reason: 'Service',
      }),
    });
    assert.equal(closed.status, 200);
    assert.equal((await json(closed)).closures.length, 1);

    const made = await call(test, '/v1/platform/resources', {
      method: 'POST',
      body: JSON.stringify({ name: 'Van two', kind: 'vehicle', quantity: 1, schedule }),
    });
    assert.equal(made.status, 201);
    assert.equal((await json(made)).name, 'Van two');

    const after = await saved();
    assert.deepEqual(after, before, 'no offering, resource, operation or event was saved');
    assert.equal(after.offerings[0].price_cents, 450000);
    assert.equal(after.resources.length, 1);
  });

  await t.test('checks the same rules as a live key', async () => {
    const stale = await call(test, `/v1/platform/offerings/${run.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ expected_version: run.version + 5, price_cents: 1 }),
    });
    assert.equal(stale.status, 409);
    const unknown = await call(test, `/v1/platform/resources/${driver.id}/closures/none`, {
      method: 'DELETE',
    });
    assert.ok(unknown.status >= 400);
  });

  await t.test('opens a real closure only in its answer', async () => {
    const real = await platformClosure(
      engine,
      live,
      driver.id,
      {
        expected_version: driver.version,
        starts_at: '2030-01-04T09:00:00+03:00',
        ends_at: '2030-01-04T12:00:00+03:00',
        reason: 'Leave',
      },
      randomUUID(),
    );
    const closure = real.closures[0]!;
    const opened = await call(
      test,
      `/v1/platform/resources/${driver.id}/closures/${closure.id}?expected_version=${real.version}`,
      { method: 'DELETE' },
    );
    assert.equal(opened.status, 200);
    assert.equal((await json(opened)).closures.length, 0);
    const still = (await saved()).resources[0];
    assert.equal(still.closures.length, 1);
    assert.equal(still.version, real.version);
  });

  await t.test('reaches no reservation, payment or customer', async () => {
    for (const [route, init] of [
      ['/v1/platform/reservations', {}],
      ['/v1/platform/reservations/any', {}],
      ['/v1/platform/reservations', { method: 'POST', body: '{}' }],
      ['/v1/platform/reservations/any/driver', { method: 'PUT', body: '{}' }],
      ['/v1/platform/bookings/any/settle', { method: 'POST', body: '{}' }],
      ['/v1/platform/customers/forget', { method: 'POST', body: '{}' }],
    ] as const) {
      const response = await call(test, route, init);
      assert.equal(response.status, 403, route);
      assert.match(await response.text(), /sandbox_not_allowed/);
    }
  });
});
