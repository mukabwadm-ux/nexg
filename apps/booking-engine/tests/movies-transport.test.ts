import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createBookingServer } from '../src/server.js';
import type { BookingEngine } from '../src/engine.js';
import { BookingError, type Identity } from '../src/types.js';

test('Movies HTTP transport requires verified signed customer scope without guest fallback', async t => {
  const businessId = randomUUID(), userId = randomUUID(), id = randomUUID();
  const secret = 'synthetic-movies-transport-test-only';
  const identity = { businessId, userId, role: 'customer', expiresAt: Date.now() + 240000,
    moviesCustomer: { purpose: 'nexg.movies.customer.v1', verified: true, customer: { name: 'Fixture User', email: 'fixture@example.test' } } };
  const intent = { showingId: randomUUID(), screenId: randomUUID(), occurrenceId: randomUUID(), offeringId: randomUUID(), seatIds: ['A1'], requestId: randomUUID(), expectedTotalMinor: 50000 };
  const row = { id: 1, publicId: id, businessId, status: 'held', startTime: '2030-01-01T12:00:00Z', endTime: '2030-01-01T14:00:00Z',
    guestName: 'Private Name', guestEmail: 'private@example.test',
    nexg: { createdBy: userId, expiresAt: '2030-01-01T11:55:00Z', version: 1,
      movieHold: { contractVersion: 1, showingId: intent.showingId, screenId: intent.screenId, occurrenceId: intent.occurrenceId, filmId: randomUUID(), seatIds: ['A1'], totalMinor: 50000 } } };
  let creates = 0, unavailable = false;
  const engine = { payload: { db: { name: 'sqlite' } }, async createMovieHold(actor: Identity, input: unknown, customer: unknown) {
    creates++; if (unavailable) throw new BookingError(503, 'Native source unavailable', 'source_unavailable');
    assert.equal(actor.userId, userId); assert.equal(actor.businessId, businessId);
    assert.deepEqual(input, intent); assert.deepEqual(customer, identity.moviesCustomer.customer);
    return { id, status: 'held' };
  }, managementContext() { return { now: () => Date.parse('2029-01-01T00:00:00Z'),
    async own(collection: string, requestedId: string, actor: Identity) {
      assert.equal(collection, 'reservations');
      if (requestedId !== id || actor.businessId !== businessId) throw new BookingError(404, 'Not found', 'not_found');
      return row;
    } }; } } as unknown as BookingEngine;
  const server = createBookingServer(engine, secret);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/v1/movies/${businessId}/holds`;
  function headers(claim: unknown = identity) {
    const encoded = Buffer.from(JSON.stringify(claim)).toString('base64url');
    return { 'content-type': 'application/json', 'idempotency-key': intent.requestId,
      'x-nexg-booking-context': encoded, 'x-nexg-booking-signature': createHmac('sha256', secret).update(encoded).digest('hex') };
  }
  const post = (claim: unknown = identity, value: unknown = intent, extra: Record<string,string> = {}) => fetch(base, { method: 'POST', headers: { ...headers(claim), ...extra }, body: JSON.stringify(value) });
  await t.test('accepts verified bridge scope and supplies contact separately', async () => {
    const response = await post(); assert.equal(response.status, 201); assert.equal(creates, 1);
  });
  await t.test('rejects absent signature, tampering, expiry, and excessive lifetime', async () => {
    assert.equal((await fetch(base, { method: 'POST' })).status, 401);
    assert.equal((await post(identity, intent, { 'x-nexg-booking-signature': '00'.repeat(32) })).status, 401);
    assert.equal((await post({ ...identity, expiresAt: Date.now() - 1000 })).status, 401);
    assert.equal((await post({ ...identity, expiresAt: Date.now() + 600000 })).status, 401);
  });
  await t.test('rejects generic guest, manager, absent purpose and unverified contact claims', async () => {
    for (const patch of [{ userId: 'guest-cookie' }, { role: 'owner' }, { moviesCustomer: undefined },
      { moviesCustomer: { ...identity.moviesCustomer, verified: false } },
      { moviesCustomer: { ...identity.moviesCustomer, purpose: 'other' } },
      { moviesCustomer: { ...identity.moviesCustomer, customer: { name: 'Fixture' } } }])
      assert.ok((await post({ ...identity, ...patch })).status >= 400);
  });
  await t.test('rejects client-supplied identity, contact, authority and unmatched idempotency key', async () => {
    for (const key of ['customer', 'userId', 'businessId', 'moviesCustomer', 'authority', 'email'])
      assert.equal((await post(identity, { ...intent, [key]: 'injected' })).status, 422);
    assert.equal((await post(identity, intent, { 'idempotency-key': randomUUID() })).status, 422);
    assert.equal((await post(identity, intent, { 'idempotency-key': '' })).status, 422);
    assert.equal(creates, 1);
  });
  await t.test('tenant mismatch fails before engine write', async () => {
    assert.equal((await post({ ...identity, businessId: randomUUID() })).status, 404); assert.equal(creates, 1);
  });
  await t.test('read returns only hold view and projects expiry', async () => {
    const response = await fetch(`${base}/${id}`, { headers: headers() }); assert.equal(response.status, 200);
    const value = await response.json(); assert.equal(value.id, id); assert.equal(value.status, 'held');
    for (const key of ['guestName', 'guestEmail', 'nexg', 'businessId', 'createdBy', 'customer']) assert.equal(key in value, false);
    row.nexg.expiresAt = '2028-01-01T00:00:00Z';
    assert.equal((await (await fetch(`${base}/${id}`, { headers: headers() })).json()).status, 'expired');
  });
  await t.test('read forbids another actor, tenant, non-Movies row and unsupported actions', async () => {
    assert.equal((await fetch(`${base}/${id}`, { headers: headers({ ...identity, userId: randomUUID() }) })).status, 404);
    const other = randomUUID();
    assert.equal((await fetch(base.replace(businessId, other) + `/${id}`, { headers: headers({ ...identity, businessId: other }) })).status, 404);
    row.nexg.movieHold.contractVersion = 2;
    assert.equal((await fetch(`${base}/${id}`, { headers: headers() })).status, 404);
    assert.equal((await fetch(base, { headers: headers() })).status, 405);
    assert.equal((await fetch(`${base}/${id}/cancel`, { method: 'POST', headers: headers() })).status, 404);
  });
  await t.test('unavailable native source fails closed without a retry or guest fallback', async () => {
    unavailable = true;
    const before = creates, response = await post();
    assert.equal(response.status, 503); assert.equal(creates, before + 1);
    assert.equal((await response.json()).type, 'urn:nexg:booking:source_unavailable');
  });
  await t.test('availability requires exact unique identifiers and proven snapshot support', async () => {
    const url = base.replace('/holds', '/availability');
    const query = new URLSearchParams({ showingId: intent.showingId, screenId: intent.screenId,
      occurrenceId: intent.occurrenceId, offeringId: intent.offeringId });
    for (const suffix of ['', `?${query}&showingId=${intent.showingId}`, `?${query}&customer=injected`, `?${query}&coherentSnapshot=true`])
      assert.equal((await fetch(url + suffix, { headers: headers() })).status, 422);
    const response = await fetch(`${url}?${query}`, { headers: headers() });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).type, 'urn:nexg:booking:movie_snapshot_unavailable');
    assert.equal((await fetch(`${url}?${query}`, { method: 'POST', headers: headers() })).status, 405);
    assert.equal((await fetch(`${url}?${query}`, { headers: headers({ ...identity, moviesCustomer: undefined }) })).status, 401);
    assert.equal((await fetch(`${url}?${query}`, { headers: headers({ ...identity, businessId: randomUUID() }) })).status, 404);
  });
  await t.test('availability uses repeatable-read read-only transaction, strips resource IDs and rolls back failure', async () => {
    const resourceId = randomUUID(), calls: string[] = [];
    const configuration = { categoryKey: 'experiences', subcategoryId: 'cinemas', published: true,
      canonicalAnswers: { Q_DATA_AUTHORITY: ['reservations', 'availability', 'resources', 'pricing'].map(data_class =>
        ({ data_class, authority: 'NEXG_AUTHORITATIVE', owner_reference: 'nexg-booking-engine', scope: { business_id: businessId, offering_id: intent.offeringId } })) } };
    const occurrence = { businessId, publicId: intent.occurrenceId, offeringId: intent.offeringId, published: true,
      locationId: 'primary', version: 2, startTime: '2030-01-02T12:00:00Z', endTime: '2030-01-02T14:00:00Z', resourceIds: [resourceId],
      movies: { contractVersion: 1, merchantId: businessId, showingId: intent.showingId, screenId: intent.screenId,
        filmId: randomUUID(), pricesMinor: { standard: 50000 }, seats: [{ code: 'A1', resourceId, type: 'standard' }] } };
    const offering = { businessId, publicId: intent.offeringId, active: true, nexg: { bookingEnabled: true,
      model: 'SESSION_CAPACITY', locationId: 'primary', resourceIds: [resourceId] } };
    const resources = [{ businessId, id: 55, publicId: resourceId, active: true, quantity: 1,
      capacityMode: 'per-reservation', resourceType: 'asset', nexg: { locationId: 'primary', schedule: {} } }];
    const collections: Record<string, unknown[]> = { businesses: [{ businessId, configuration }],
      'booking-sessions': [occurrence], resources, reservations: [] };
    (engine as any).payload.db = { name: 'postgres', async beginTransaction(options: unknown) {
      assert.deepEqual(options, { isolationLevel: 'repeatable read', accessMode: 'read only' }); calls.push('begin'); return 'snapshot-fixture';
    }, async commitTransaction(tx: string) { assert.equal(tx, 'snapshot-fixture'); calls.push('commit'); },
    async rollbackTransaction(tx: string) { assert.equal(tx, 'snapshot-fixture'); calls.push('rollback'); } };
    (engine as any).managementContext = () => ({ now: () => Date.parse('2029-01-01T00:00:00Z'), scheduleAllows: () => true,
      request(actor: Identity, transactionID: string) { assert.equal(actor.businessId, businessId); return { transactionID }; },
      async all(collection: string, actor: Identity, req: any) { assert.equal(actor.businessId, businessId); assert.equal(req.transactionID, 'snapshot-fixture'); return collections[collection]; },
      async own(collection: string, requestedId: string, actor: Identity, req: any) {
        assert.equal(collection, 'services'); assert.equal(requestedId, intent.offeringId);
        assert.equal(actor.userId, userId); assert.equal(req.transactionID, 'snapshot-fixture'); return offering;
      } });
    const query = new URLSearchParams({ showingId: intent.showingId, screenId: intent.screenId, occurrenceId: intent.occurrenceId, offeringId: intent.offeringId });
    const url = base.replace('/holds', '/availability') + '?' + query;
    const response = await fetch(url, { headers: headers() }); assert.equal(response.status, 200);
    const value = await response.json();
    assert.deepEqual(value.seats, [{ seatId: 'A1', type: 'standard', status: 'available' }]);
    assert.equal(value.offeringId, intent.offeringId); assert.equal(value.version, 2);
    assert.equal(JSON.stringify(value).includes(resourceId), false); assert.deepEqual(calls, ['begin', 'commit']);
    occurrence.published = false;
    assert.equal((await fetch(url, { headers: headers() })).status, 409);
    assert.deepEqual(calls, ['begin', 'commit', 'begin', 'rollback']);
  });
});
