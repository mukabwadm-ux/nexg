import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createPayload } from '../src/payload.js';
import { createBookingServer } from '../src/server.js';
import { assertStayHoldReady } from '../src/stays.js';
import {
  bindStayPaymentAttempt,
  bindPreparedStayPaymentAttempt,
  createStaySettlementReceiver,
  type StaySettlementProof,
} from '../src/stay-settlement.js';
import { prepareStayPaymentAttempt } from '../src/stay-payment-preparation.js';
import { setupStayFixture } from './stay-fixture.js';

delete process.env.BOOKING_DATABASE_URL;
delete process.env.BOOKING_DB_PUSH;
const fixtureURL = process.env.BOOKING_TEST_POSTGRES_URL
  ? new URL(process.env.BOOKING_TEST_POSTGRES_URL)
  : undefined;
if (
  fixtureURL &&
  (!['postgres:', 'postgresql:'].includes(fixtureURL.protocol) ||
    fixtureURL.hostname !== '127.0.0.1' ||
    !(
      (fixtureURL.pathname === '/nexg_stays_test' && fixtureURL.username === 'nexg_fixture') ||
      (fixtureURL.pathname === '/nexg_stays_pr' && fixtureURL.username === 'nexg_stays_pr')
    ) ||
    fixtureURL.search ||
    fixtureURL.hash)
)
  throw new Error('Stays HTTP PG tests require the dedicated isolated loopback fixture.');

test(
  'actual PostgreSQL Stays HTTP quote, hold, private read and simulated verified settlement',
  { skip: !fixtureURL },
  async () => {
    Object.assign(process.env, { NODE_ENV: 'test', PAYLOAD_FORCE_DRIZZLE_PUSH: 'true' });
    const { default: pg } = await import('pg');
    const name = 'nexg_stays_test_' + randomUUID().replaceAll('-', '');
    const admin = new pg.Client({ connectionString: fixtureURL!.toString() });
    await admin.connect();
    try {
      await admin.query('CREATE DATABASE "' + name + '"');
    } finally {
      await admin.end();
    }
    const url = new URL(fixtureURL!);
    url.pathname = '/' + name;
    const secret = 'synthetic-stays-http-pg-only-123456789';
    let payload: Awaited<ReturnType<typeof createPayload>> | undefined;
    let server: ReturnType<typeof createBookingServer> | undefined;
    try {
      payload = await createPayload({
        postgresUrl: url.toString(),
        push: true,
        cacheKey: randomUUID(),
        secret,
      });
      const now = Date.parse('2030-01-01T00:00:00Z');
      const f = await setupStayFixture(payload, false, () => now);
      server = createBookingServer(f.engine, secret);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/v1/stays/${f.owner.businessId}`;
      function headers(key?: string, actorId = f.guest.userId) {
        const encoded = Buffer.from(
          JSON.stringify({
            ...f.guest,
            userId: actorId,
            expiresAt: Date.now() + 240000,
            staysCustomer: {
              purpose: 'nexg.stays.customer.v1',
              verified: true,
              customer: f.customer,
            },
          }),
        ).toString('base64url');
        return {
          'content-type': 'application/json',
          'x-nexg-booking-context': encoded,
          'x-nexg-booking-signature': createHmac('sha256', secret).update(encoded).digest('hex'),
          ...(key ? { 'idempotency-key': key } : {}),
        };
      }
      async function post(path: string, value: unknown, key: string) {
        return fetch(base + path, {
          method: 'POST',
          headers: headers(key),
          body: JSON.stringify(value),
        });
      }
      async function availability(input = f.input) {
        const query = new URLSearchParams(Object.entries(input).map(([k, v]) => [k, String(v)]));
        const before = await Promise.all(
          ['reservations', 'booking-operations', 'booking-audit', 'booking-outbox'].map(
            async (c) => (await f.docs(c)).length,
          ),
        );
        const response = await fetch(base + '/availability?' + query, { headers: headers() });
        assert.equal(response.status, 200);
        const view = await response.json();
        assert.equal(view.contractVersion, 1);
        assert.equal(view.authority, 'nexg-booking-engine');
        assert.equal(view.held, false);
        assert.equal(view.propertyId, input.propertyId);
        assert.equal(view.unitId, input.unitId);
        const after = await Promise.all(
          ['reservations', 'booking-operations', 'booking-audit', 'booking-outbox'].map(
            async (c) => (await f.docs(c)).length,
          ),
        );
        assert.deepEqual(
          after,
          before,
          'availability GET must not create quotes, holds, audit or outbox records',
        );
        return view;
      }
      async function createHold(input = f.input) {
        const quoteResponse = await post('/quote', input, randomUUID());
        assert.equal(quoteResponse.status, 200);
        const quote = await quoteResponse.json();
        assert.equal(quote.totalMinor, 20000);
        assert.equal(quote.nights, 2);
        const intent = {
          quoteId: quote.quoteId,
          requestId: quote.quoteId,
          expectedTotalMinor: quote.totalMinor,
        };
        const holdResponse = await post('/holds', intent, quote.quoteId);
        assert.equal(holdResponse.status, 201);
        const hold = await holdResponse.json();
        assert.equal(hold.status, 'held');
        assert.equal(hold.paymentStatus, 'unpaid');
        return { quote, intent, hold };
      }
      assert.equal((await availability()).available, true);
      const { quote, intent, hold } = await createHold();
      assert.equal(
        (await fetch(base + '/holds/' + hold.id + '/activity', { headers: headers() })).status,
        404,
        'an unpaid hold must not appear as confirmed Activity',
      );
      assert.equal((await availability()).available, false);
      assert.equal(
        (await availability({ ...f.input, checkIn: '2030-01-04', checkOut: '2030-01-06' }))
          .available,
        true,
        'adjacent room nights remain available after the prior checkout',
      );
      assert.equal(hold.expiresAt, '2030-01-01T00:15:00.000Z');
      assert.equal((await f.docs('reservations')).length, 1);
      let response = await post('/holds', intent, quote.quoteId);
      assert.equal(response.status, 201);
      assert.equal((await response.json()).id, hold.id);
      assert.equal((await f.docs('reservations')).length, 1);
      for (const id of [hold.id, quote.quoteId]) {
        response = await fetch(base + '/holds/' + id, { headers: headers() });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).id, hold.id);
      }
      assert.equal(
        (await fetch(base + '/holds/' + hold.id, { headers: headers(undefined, randomUUID()) }))
          .status,
        404,
      );
      const overlappingQuote = await post('/quote', f.input, randomUUID());
      assert.equal(overlappingQuote.status, 409);

      // Test-only verified adapter. No real provider call or customer-accessible payment endpoint.
      const receiver = createStaySettlementReceiver(f.engine, {
        verify: async (raw) => ({ identity: f.owner, proof: raw as StaySettlementProof }),
        canConfirm: async (identity, doc, req) => {
          await assertStayHoldReady(f.engine, identity, doc, req);
          return true;
        },
      });
      const binding = {
        attemptId: randomUUID(),
        provider: 'fixture-only',
        providerAccountId: 'fixture-account',
        providerReference: 'fixture-reference-' + randomUUID(),
      };
      const preparation = { bookingId: hold.id, attemptId: binding.attemptId };
      const prepared = await prepareStayPaymentAttempt(
        f.engine,
        f.guest,
        preparation,
        binding.attemptId,
      );
      assert.equal(prepared.status, 'prepared');
      assert.equal(prepared.attemptId, binding.attemptId);
      assert.equal(prepared.amountMinor, hold.totalMinor);
      assert.equal(prepared.currency, 'KES');
      const preparedDoc = (await f.docs('reservations')).find((row) => row.publicId === hold.id);
      assert.equal(preparedDoc.status, 'held');
      assert.equal(preparedDoc.nexg.stayPaymentPreparation.state, 'prepared');
      assert.equal(
        preparedDoc.nexg.stayPayment,
        undefined,
        'preparation must not dispatch or invent a provider binding',
      );
      assert.equal(
        preparedDoc.nexg.paidMinor ?? 0,
        0,
        'preparation does not charge or settle funds',
      );
      const preparedCounts = await Promise.all(
        ['booking-operations', 'booking-audit', 'booking-outbox'].map(
          async (c) => (await f.docs(c)).length,
        ),
      );
      assert.deepEqual(
        await prepareStayPaymentAttempt(f.engine, f.guest, preparation, binding.attemptId),
        prepared,
      );
      assert.deepEqual(
        await Promise.all(
          ['booking-operations', 'booking-audit', 'booking-outbox'].map(
            async (c) => (await f.docs(c)).length,
          ),
        ),
        preparedCounts,
      );
      await bindPreparedStayPaymentAttempt(f.engine, f.owner, hold.id, binding, randomUUID());
      assert.equal(
        (await prepareStayPaymentAttempt(f.engine, f.guest, preparation, binding.attemptId)).status,
        'bound',
      );
      const proof: StaySettlementProof = {
        ...binding,
        merchantId: f.owner.businessId,
        bookingId: hold.id,
        eventId: randomUUID(),
        amountMinor: hold.totalMinor,
        currency: 'KES',
        status: 'settled',
        occurredAt: new Date(now).toISOString(),
      };
      const outcome = await receiver(proof);
      assert.equal(outcome.outcome, 'confirmed');
      assert.equal(outcome.reason, 'settlement_accepted');
      assert.deepEqual(await receiver(proof), outcome, 'verified event replay must be idempotent');
      response = await fetch(base + '/holds/' + hold.id, { headers: headers() });
      assert.equal(response.status, 200);
      const booked = await response.json();
      assert.equal(booked.status, 'confirmed');
      assert.equal(booked.paymentStatus, 'paid');
      assert.equal(booked.refundDue, false);
      assert.equal(JSON.stringify(booked).includes(binding.providerReference), false);
      assert.equal(JSON.stringify(booked).includes(f.customer.email), false);
      response = await fetch(base + '/holds/' + hold.id + '/activity', { headers: headers() });
      assert.equal(response.status, 200);
      const activity = await response.json();
      assert.equal(activity.id, 'stay:' + hold.id);
      assert.equal(activity.kind, 'stay');
      assert.equal(activity.source, 'nexg-booking-engine');
      assert.equal(activity.bookingId, hold.id);
      assert.equal(activity.bookingReference, hold.id);
      assert.equal(activity.status, 'confirmed');
      assert.equal(activity.paymentStatus, 'paid');
      assert.equal(activity.checkIn, quote.checkIn);
      assert.equal(activity.checkOut, quote.checkOut);
      assert.equal(activity.startTime, hold.startTime);
      assert.equal(activity.endTime, hold.endTime);
      assert.equal(activity.timeZone, 'Africa/Nairobi');
      assert.equal(activity.totalMinor, hold.totalMinor);
      assert.equal(activity.currency, 'KES');
      assert.equal(JSON.stringify(activity).includes(f.customer.email), false);
      assert.equal(JSON.stringify(activity).includes(binding.providerReference), false);
      assert.equal(
        (
          await fetch(base + '/holds/' + hold.id + '/activity', {
            headers: headers(undefined, randomUUID()),
          })
        ).status,
        404,
      );

      const uncertain = await createHold({
        ...f.input,
        checkIn: '2030-02-05',
        checkOut: '2030-02-07',
      });
      const pendingBinding = {
        ...binding,
        attemptId: randomUUID(),
        providerReference: 'fixture-unknown-' + randomUUID(),
      };
      await bindStayPaymentAttempt(
        f.engine,
        f.owner,
        uncertain.hold.id,
        pendingBinding,
        randomUUID(),
      );
      const unresolved = await receiver({
        ...proof,
        ...pendingBinding,
        bookingId: uncertain.hold.id,
        eventId: randomUUID(),
        status: 'unknown',
      });
      assert.equal(unresolved.outcome, 'reconciliation');
      response = await fetch(base + '/holds/' + uncertain.hold.id, { headers: headers() });
      assert.equal(response.status, 200);
      const pending = await response.json();
      assert.notEqual(pending.status, 'confirmed');
      assert.notEqual(pending.paymentStatus, 'paid');
    } finally {
      if (server)
        await new Promise<void>((resolve) => {
          server!.close(() => resolve());
          server!.closeAllConnections();
        });
      try {
        await payload?.destroy();
      } finally {
        const cleanup = new pg.Client({ connectionString: fixtureURL!.toString() });
        await cleanup.connect();
        try {
          await cleanup.query('DROP DATABASE "' + name + '" WITH (FORCE)');
        } finally {
          await cleanup.end();
        }
      }
    }
  },
);
