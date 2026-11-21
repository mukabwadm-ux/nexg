import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { authenticatedStayCustomer, createStayTransport } from '../src/stay-transport.js';
import { createBookingServer } from '../src/server.js';
import { BookingError } from '../src/types.js';

function fixture() {
  const identity = {
    businessId: randomUUID(),
    userId: randomUUID(),
    role: 'customer',
    expiresAt: Date.now() + 240000,
    staysCustomer: {
      purpose: 'nexg.stays.customer.v1',
      verified: true,
      customer: { name: 'Fixture Guest', email: 'stay@example.test' },
    },
  };
  const quote = {
    propertyId: randomUUID(),
    unitId: randomUUID(),
    checkIn: '2030-02-01',
    checkOut: '2030-02-03',
    adults: 2,
    children: 0,
  };
  const quoteId = randomUUID();
  const hold = { quoteId, requestId: quoteId, expectedTotalMinor: 20000 };
  return { identity, quote, hold };
}

test('Stays bridge scope rejects guests, wrong purpose and unverified or ambiguous contact', () => {
  const { identity } = fixture();
  assert.deepEqual(authenticatedStayCustomer(identity), identity.staysCustomer.customer);
  for (const patch of [
    { userId: 'guest-session' },
    { role: 'owner' },
    { staysCustomer: undefined },
    { staysCustomer: { ...identity.staysCustomer, purpose: 'nexg.movies.customer.v1' } },
    { staysCustomer: { ...identity.staysCustomer, verified: false } },
    {
      staysCustomer: {
        ...identity.staysCustomer,
        customer: { name: 'Guest', email: 'stay@example.test', phone: '+254700000000' },
      },
    },
    { staysCustomer: { ...identity.staysCustomer, customer: { name: 'Guest' } } },
  ])
    assert.throws(() => authenticatedStayCustomer({ ...identity, ...patch }), {
      code: 'stay_authentication_required',
    });
});

test('Stays commands preserve exact input and separate trusted contact; fail closed without fallback', async () => {
  const { identity, quote, hold } = fixture();
  const engine = {} as any,
    calls: string[] = [],
    bookingId = randomUUID();
  const activity = {
    id: 'stay:' + bookingId,
    kind: 'stay',
    bookingId,
    status: 'confirmed',
    paymentStatus: 'paid',
  };
  const commands = {
    async quoteStay(e: unknown, actor: unknown, input: unknown, key: string) {
      assert.equal(e, engine);
      assert.equal(actor, identity);
      assert.deepEqual(input, quote);
      assert.equal(key, hold.requestId);
      calls.push('quote');
      return { quoteId: hold.quoteId };
    },
    async createStayHold(e: unknown, actor: unknown, input: unknown, customer: unknown) {
      assert.equal(e, engine);
      assert.equal(actor, identity);
      assert.deepEqual(input, hold);
      assert.deepEqual(customer, identity.staysCustomer.customer);
      calls.push('hold');
      return { id: bookingId, status: 'held' };
    },
    async readStayHold(e: unknown, actor: unknown, id: string) {
      assert.equal(e, engine);
      assert.equal(actor, identity);
      assert.equal(id, bookingId);
      calls.push('read');
      return { id, status: 'held' };
    },
    async readStayActivity(e: unknown, actor: unknown, id: string) {
      assert.equal(e, engine);
      assert.equal(actor, identity);
      assert.equal(id, bookingId);
      calls.push('activity');
      return activity;
    },
  };
  const transport = createStayTransport(commands as any);
  assert.deepEqual(await transport.quote(engine, identity, quote, hold.requestId), {
    quoteId: hold.quoteId,
  });
  assert.deepEqual(await transport.hold(engine, identity, hold, hold.requestId), {
    id: bookingId,
    status: 'held',
  });
  assert.deepEqual(await transport.read(engine, identity, bookingId), {
    id: bookingId,
    status: 'held',
  });
  assert.deepEqual(await transport.activity(engine, identity, bookingId), activity);
  await assert.rejects(() => transport.activity(engine, identity, 'not-a-booking'), {
    code: 'stay_activity_unavailable',
  });
  for (const key of [
    'userId',
    'businessId',
    'customer',
    'email',
    'firstName',
    'status',
    'paymentStatus',
    'authority',
  ]) {
    await assert.rejects(
      () => transport.quote(engine, identity, { ...quote, [key]: 'injected' }, hold.requestId),
      { code: 'invalid_stay_intent' },
    );
    await assert.rejects(
      () => transport.hold(engine, identity, { ...hold, [key]: 'injected' }, hold.requestId),
      { code: 'invalid_stay_intent' },
    );
  }
  await assert.rejects(() => transport.quote(engine, identity, quote), {
    code: 'invalid_idempotency_key',
  });
  await assert.rejects(() => transport.hold(engine, identity, hold, randomUUID()), {
    code: 'invalid_idempotency_key',
  });
  await assert.rejects(() => transport.read(engine, identity, 'not-a-booking'), {
    code: 'not_found',
  });
  assert.deepEqual(calls, ['quote', 'hold', 'read', 'activity']);
  commands.createStayHold = async () => {
    calls.push('unavailable');
    throw new BookingError(503, 'Source unavailable', 'stay_source_unavailable');
  };
  await assert.rejects(() => transport.hold(engine, identity, hold, hold.requestId), {
    code: 'stay_source_unavailable',
  });
  assert.deepEqual(calls, ['quote', 'hold', 'read', 'activity', 'unavailable']);
});

test('Stays availability uses coherent read-only transactions and exact query without leaking raw fields', async () => {
  const { identity, quote } = fixture();
  const calls: string[] = [];
  let fail = false;
  const query = new URLSearchParams(Object.entries(quote).map(([k, v]) => [k, String(v)]));
  const engine = {
    payload: {
      db: {
        name: 'postgres',
        async beginTransaction(options: unknown) {
          assert.deepEqual(options, { isolationLevel: 'repeatable read', accessMode: 'read only' });
          calls.push('begin');
          return 'snapshot';
        },
        async commitTransaction(tx: string) {
          assert.equal(tx, 'snapshot');
          calls.push('commit');
        },
        async rollbackTransaction(tx: string) {
          assert.equal(tx, 'snapshot');
          calls.push('rollback');
        },
      },
    },
    managementContext() {
      return {
        request(actor: unknown, transactionID: string) {
          assert.equal(actor, identity);
          return { transactionID };
        },
      };
    },
  } as any;
  const transport = createStayTransport({
    async readStayAvailability(e: unknown, actor: unknown, input: unknown, tx: any) {
      assert.equal(e, engine);
      assert.equal(actor, identity);
      assert.deepEqual(input, quote);
      assert.equal(tx.coherentSnapshot, true);
      assert.equal(tx.request.transactionID, 'snapshot');
      if (fail) throw new BookingError(409, 'Unavailable', 'stay_unavailable');
      return {
        ...quote,
        contractVersion: 1,
        authority: 'nexg-booking-engine',
        held: false,
        offeringId: randomUUID(),
        nights: 2,
        available: true,
        nightlyMinor: 10000,
        totalMinor: 20000,
        currency: 'KES',
        observedAt: '2030-01-01T00:00:00Z',
        resourceId: 'private-resource',
        guest: 'private-guest',
      };
    },
  } as any);
  const value = await transport.availability(engine, identity, query);
  assert.equal(value.available, true);
  assert.equal(value.held, false);
  assert.equal('resourceId' in value, false);
  assert.equal('guest' in value, false);
  assert.deepEqual(calls, ['begin', 'commit']);
  for (const suffix of ['&adults=2', '&authority=external', '&coherentSnapshot=true'])
    await assert.rejects(
      () => transport.availability(engine, identity, new URLSearchParams(query + suffix)),
      { code: 'invalid_stay_intent' },
    );
  for (const invalid of ['-1', '01', '1.5', 'Infinity', '1e2', '41']) {
    const params = new URLSearchParams(query);
    params.set('adults', invalid);
    await assert.rejects(() => transport.availability(engine, identity, params), {
      code: 'invalid_stay_intent',
    });
  }
  assert.deepEqual(calls, ['begin', 'commit']);
  fail = true;
  await assert.rejects(() => transport.availability(engine, identity, query), {
    code: 'stay_unavailable',
  });
  assert.deepEqual(calls, ['begin', 'commit', 'begin', 'rollback']);
  engine.payload.db.name = 'sqlite';
  await assert.rejects(() => transport.availability(engine, identity, query), {
    code: 'stay_snapshot_unavailable',
  });
});

test('Stays HTTP checks signed expiry, tenant, purpose, body fields and unsupported commands before core', async (t) => {
  const { identity, quote, hold } = fixture();
  const secret = 'synthetic-stay-http-boundary-only';
  const server = createBookingServer({ payload: { db: { name: 'sqlite' } } } as any, secret);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/v1/stays/${identity.businessId}`;
  function headers(actor: unknown = identity) {
    const encoded = Buffer.from(JSON.stringify(actor)).toString('base64url');
    return {
      'content-type': 'application/json',
      'idempotency-key': hold.requestId,
      'x-nexg-booking-context': encoded,
      'x-nexg-booking-signature': createHmac('sha256', secret).update(encoded).digest('hex'),
    };
  }
  const post = (path: string, value: unknown, actor: unknown = identity) =>
    fetch(base + path, { method: 'POST', headers: headers(actor), body: JSON.stringify(value) });
  assert.equal((await fetch(base + '/quote', { method: 'POST' })).status, 401);
  assert.equal(
    (await post('/quote', quote, { ...identity, expiresAt: Date.now() - 1 })).status,
    401,
  );
  assert.equal(
    (await post('/quote', quote, { ...identity, businessId: randomUUID() })).status,
    404,
  );
  assert.equal(
    (await post('/quote', quote, { ...identity, staysCustomer: undefined })).status,
    401,
  );
  assert.equal((await post('/quote', { ...quote, customer: 'injected' })).status, 422);
  assert.equal((await post('/holds', { ...hold, paymentStatus: 'paid' })).status, 422);
  assert.equal((await post('/holds', { ...hold, requestId: randomUUID() })).status, 422);
  assert.equal((await post('/quote?merchantId=override', quote)).status, 422);
  assert.equal((await fetch(base + '/quote', { headers: headers() })).status, 405);
  assert.equal((await post('/holds/' + randomUUID() + '/confirm', {})).status, 404);
  assert.equal(
    (await fetch(base + '/availability?propertyId=bad', { headers: headers() })).status,
    422,
  );
  const query = new URLSearchParams(Object.entries(quote).map(([k, v]) => [k, String(v)]));
  assert.equal((await fetch(base + '/availability?' + query, { headers: headers() })).status, 503);
  assert.equal((await post('/availability?' + query, {})).status, 405);
  assert.equal(
    (await fetch(base + '/holds/not-an-id/activity', { headers: headers() })).status,
    404,
  );
  assert.equal(
    (
      await fetch(base + '/holds/' + randomUUID() + '/activity?userId=override', {
        headers: headers(),
      })
    ).status,
    422,
  );
  assert.equal((await post('/holds/' + randomUUID() + '/activity', {})).status, 405);
  assert.equal((await fetch(base + '/holds/activity', { headers: headers() })).status, 404);
});
