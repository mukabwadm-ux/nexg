import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createPayload } from '../src/payload.js';
import { BookingEngine } from '../src/engine.js';
import { createBookingServer } from '../src/server.js';
import type { Identity } from '../src/types.js';

delete process.env.BOOKING_DATABASE_URL;
delete process.env.BOOKING_DB_PUSH;
const fixtureURL = process.env.BOOKING_TEST_POSTGRES_URL ? new URL(process.env.BOOKING_TEST_POSTGRES_URL) : undefined;
if (fixtureURL && (fixtureURL.protocol !== 'postgres:' || fixtureURL.hostname !== '127.0.0.1' ||
    fixtureURL.pathname !== '/nexg_movies_test' || fixtureURL.username !== 'nexg_fixture' || fixtureURL.search || fixtureURL.hash))
  throw new Error('Movies HTTP PG test requires the isolated loopback fixture.');

test('actual PostgreSQL signed Movies availability and holds across two Payload connections', { skip: !fixtureURL }, async () => {
  Object.assign(process.env, { NODE_ENV: 'test', PAYLOAD_FORCE_DRIZZLE_PUSH: 'true' });
  const { default: pg } = await import('pg');
  const name = 'nexg_movies_test_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: fixtureURL!.toString() });
  await admin.connect();
  try { await admin.query('CREATE DATABASE "' + name + '"'); } finally { await admin.end(); }
  const url = new URL(fixtureURL!); url.pathname = '/' + name;
  const secret = 'synthetic-movies-http-pg-only-123456789';
  let payload: Awaited<ReturnType<typeof createPayload>> | undefined;
  let peer: typeof payload;
  const servers: ReturnType<typeof createBookingServer>[] = [];
  try {
    payload = await createPayload({ postgresUrl: url.toString(), push: true, cacheKey: randomUUID(), secret });
    peer = await createPayload({ postgresUrl: url.toString(), push: false, cacheKey: randomUUID(), secret });
    assert.notEqual(payload.db, peer.db);
    const now = Date.parse('2030-01-01T00:00:00Z');
    const engine = new BookingEngine(payload, false, () => now), second = new BookingEngine(peer, false, () => now);
    const owner: Identity = { businessId: randomUUID(), userId: randomUUID(), role: 'owner', expiresAt: Date.now() + 240000 };
    const docs = async (collection: string) => (await payload!.find({ collection: collection as any, limit: 1000, depth: 0, overrideAccess: true })).docs as any[];
    const update = (collection: string, id: any, data: any) => payload!.update({ collection: collection as any, id, data, overrideAccess: true, context: { nexgSystem: true }, depth: 0 });
    // Synthetic trusted publication fixture only; never imports merchant/production records.
    await engine.configure(owner, { subcategoryId: 'haircare', published: false }, randomUUID());
    const seats: { code: string; type: 'standard'; resourceId: string }[] = [];
    for (const code of ['A1', 'A2']) {
      const resource: any = await engine.addResource(owner, { name: 'HTTP fixture seat ' + code, kind: 'asset', quantity: 1,
        schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' } }, randomUUID());
      seats.push({ code, type: 'standard', resourceId: resource.id });
    }
    const offering: any = await engine.addOffering(owner, { name: 'HTTP fixture showing', model: 'APPOINTMENT', durationMinutes: 120,
      resourceIds: seats.map(s => s.resourceId), priceMinor: 10000, currency: 'KES', intakeMode: 'instant_after_requirements',
      active: true, bookingEnabled: true, leadTimeMinutes: 0, horizonDays: 3650, paymentPolicyId: 'NO_PREPAYMENT_V1',
      changePolicyId: 'CHANGE_BEFORE_START_V1', policyVersion: 1 }, randomUUID());
    const business = (await docs('businesses'))[0], service = (await docs('services'))[0];
    await update('services', service.id, { nexg: { ...service.nexg, model: 'SESSION_CAPACITY' } });
    await update('businesses', business.id, { configuration: { ...business.configuration, categoryKey: 'experiences', subcategoryId: 'cinemas', published: true,
      canonicalAnswers: { Q_DATA_AUTHORITY: ['reservations', 'availability', 'resources', 'pricing'].map(data_class =>
        ({ data_class, authority: 'NEXG_AUTHORITATIVE', owner_reference: 'nexg-booking-engine', scope: { business_id: owner.businessId, offering_id: offering.id } })) } } });
    const showingId = randomUUID(), screenId = randomUUID(), occurrenceId = randomUUID();
    await payload.create({ collection: 'booking-sessions', overrideAccess: true, context: { nexgSystem: true }, data: {
      businessId: owner.businessId, sessionKey: randomUUID(), publicId: occurrenceId, capacity: 2, resourceIds: seats.map(s => s.resourceId),
      movies: { contractVersion: 1, merchantId: owner.businessId, filmId: randomUUID(), showingId, screenId, pricesMinor: { standard: 10000 }, seats },
      published: true, version: 1, locationId: 'primary', offeringId: offering.id, startTime: '2030-01-02T12:00:00Z', endTime: '2030-01-02T14:00:00Z',
    } } as any);
    const bases: string[] = [];
    for (const instance of [engine, second]) {
      const server = createBookingServer(instance, secret); servers.push(server);
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      const address = server.address(); assert.ok(address && typeof address !== 'string');
      bases.push(`http://127.0.0.1:${address.port}/v1/movies/${owner.businessId}`);
    }
    const actorId = randomUUID();
    function headers(requestId?: string) {
      const encoded = Buffer.from(JSON.stringify({ businessId: owner.businessId, userId: actorId, role: 'customer', expiresAt: Date.now() + 240000,
        moviesCustomer: { purpose: 'nexg.movies.customer.v1', verified: true, customer: { name: 'HTTP fixture customer', email: 'fixture@example.test' } } })).toString('base64url');
      return { 'content-type': 'application/json', 'x-nexg-booking-context': encoded,
        'x-nexg-booking-signature': createHmac('sha256', secret).update(encoded).digest('hex'), ...(requestId ? { 'idempotency-key': requestId } : {}) };
    }
    const query = new URLSearchParams({ showingId, screenId, occurrenceId, offeringId: offering.id });
    const counts = async () => Promise.all(['reservations', 'booking-operations', 'booking-audit', 'booking-outbox'].map(async c => (await docs(c)).length));
    const before = await counts();
    let response = await fetch(bases[0] + '/availability?' + query, { headers: headers() });
    assert.equal(response.status, 200); let view = await response.json();
    assert.deepEqual(view.seats.map((s: any) => s.status), ['available', 'available']);
    assert.deepEqual(await counts(), before, 'availability must not write');
    const requestId = randomUUID(), intent = { showingId, screenId, occurrenceId, offeringId: offering.id, seatIds: ['A1'], requestId, expectedTotalMinor: 10000 };
    response = await fetch(bases[1] + '/holds', { method: 'POST', headers: headers(requestId), body: JSON.stringify(intent) });
    assert.equal(response.status, 201); const hold = await response.json(); assert.equal(hold.status, 'held');
    const afterHold = await counts();
    response = await fetch(bases[0] + '/availability?' + query, { headers: headers() });
    assert.equal(response.status, 200); view = await response.json();
    assert.deepEqual(view.seats, [{ seatId: 'A1', type: 'standard', status: 'unavailable' }, { seatId: 'A2', type: 'standard', status: 'available' }]);
    assert.deepEqual(await counts(), afterHold, 'occupancy read must not write');
    assert.ok(seats.every(s => !JSON.stringify(view).includes(s.resourceId)));
    response = await fetch(bases[0] + '/holds/' + hold.id, { headers: headers() });
    assert.equal(response.status, 200); assert.equal((await response.json()).id, hold.id);
    response = await fetch(bases[0] + '/holds', { method: 'POST', headers: headers(requestId), body: JSON.stringify(intent) });
    assert.equal(response.status, 201); assert.equal((await response.json()).id, hold.id);
    assert.deepEqual(await counts(), afterHold, 'replay across connections must not allocate twice');
  } finally {
    for (const server of servers) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    try { await peer?.destroy(); } finally {
      try { await payload?.destroy(); } finally {
        const cleanup = new pg.Client({ connectionString: fixtureURL!.toString() }); await cleanup.connect();
        try { await cleanup.query('DROP DATABASE "' + name + '" WITH (FORCE)'); } finally { await cleanup.end(); }
      }
    }
  }
});
