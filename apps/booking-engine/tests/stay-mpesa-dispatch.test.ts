import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createStayMpesaPilot, type StayMpesaFixtureAdapter } from '../src/stay-mpesa-dispatch.js';
Object.assign(process.env, { NODE_ENV: 'test' });
const now = Date.parse('2030-01-01T00:00:00Z');
const identity = {
  businessId: 'merchant',
  userId: 'fixture-worker',
  role: 'owner',
  expiresAt: now + 999999,
};
const checkout = {
  merchantId: 'merchant',
  actorId: 'customer',
  bookingId: 'booking',
  attemptId: 'attempt',
  phone: '254712345678',
};
const signature = (data: any) =>
  createHmac('sha256', 'synthetic-test-only-provider-key')
    .update(JSON.stringify(data))
    .digest('hex');
const signed = (data: any) => ({ data, signature: signature(data) });
function verified(raw: any) {
  if (
    !raw ||
    typeof raw.signature !== 'string' ||
    raw.signature.length !== 64 ||
    !timingSafeEqual(Buffer.from(raw.signature, 'hex'), Buffer.from(signature(raw.data), 'hex'))
  )
    throw Error('fixture provider verification failed');
  return raw.data;
}
/** Synthetic transactional fixture, not Daraja or a live database. */
function fixture() {
  let clock = now,
    sends = 0,
    sendMode = 'ok',
    failAccepted = false,
    tail = Promise.resolve();
  const state: any = {
    docs: [
      {
        id: 1,
        publicId: 'booking',
        businessId: 'merchant',
        status: 'held',
        nexg: {
          version: 2,
          createdBy: 'customer',
          locationId: 'primary',
          expiresAt: new Date(now + 900000).toISOString(),
          stayHold: { contractVersion: 1, totalMinor: 24000, currency: 'KES' },
          stayPaymentPreparation: {
            contractVersion: 1,
            state: 'prepared',
            attemptId: 'attempt',
            actorId: 'customer',
            amountMinor: 24000,
            currency: 'KES',
            preparedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + 900000).toISOString(),
          },
        },
      },
    ],
    audits: [],
    ops: new Map(),
  };
  const req = { transactionID: 'fixture' };
  const c = {
    now: () => clock,
    own: async (_c: string, id: string, i: any, r?: any) => {
      if (r) assert.equal(r, req);
      const d = state.docs.find((d: any) => d.publicId === id && d.businessId === i.businessId);
      if (!d) throw Error('not found');
      return d;
    },
    all: async (_c: string, i: any, r?: any) => {
      if (r) assert.equal(r, req);
      return state.docs.filter((d: any) => d.businessId === i.businessId);
    },
    update: async (_c: string, id: number, data: any, _i: any, r: any) => {
      assert.equal(r, req);
      if (failAccepted && data.nexg?.stayMpesaDispatch?.state === 'accepted')
        throw Error('database write failed');
      Object.assign(
        state.docs.find((d: any) => d.id === id),
        data,
      );
    },
    audit: async (_i: any, r: any, event: string, recordId: string, detail: any) => {
      assert.equal(r, req);
      state.audits.push({ event, recordId, detail });
    },
    command: async (i: any, key: string, op: string, body: any, fn: any) => {
      const task = tail.then(async () => {
        const k = i.userId + op + key,
          hash = JSON.stringify(body),
          old = state.ops.get(k);
        if (old) {
          if (hash !== old.hash) throw Error('idempotency_conflict');
          return old.result;
        }
        const before = structuredClone({ docs: state.docs, audits: state.audits });
        try {
          const result = await fn(req);
          state.ops.set(k, { hash, result });
          return result;
        } catch (e) {
          state.docs = before.docs;
          state.audits = before.audits;
          throw e;
        }
      });
      tail = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
  };
  const adapter: StayMpesaFixtureAdapter = {
    mode: 'fixture',
    authorizeCheckout: async (raw) => {
      if (raw !== 'fixture-session') throw Error('unauthenticated');
      return checkout;
    },
    send: async (request) => {
      sends++;
      assert.equal(request.amountKes, 240);
      if (sendMode === 'timeout') throw Error('unknown after sending private-secret');
      if (sendMode === 'late') clock = now + 900000;
      return signed({
        providerAccountId: sendMode === 'wrong-account' ? 'other' : 'account',
        attemptId: request.attemptId,
        checkoutRequestId: 'checkout-id',
        merchantRequestId: 'merchant-request',
      });
    },
    verifyAccepted: async (raw) => verified(raw),
    verifyEvent: async (raw) => verified(raw),
  };
  const engine = { managementContext: () => c } as any;
  const options = {
    enabled: true,
    environment: 'fixture' as const,
    fixtureMarker: 'synthetic-stay-mpesa-v1' as const,
    identity,
    providerAccountId: 'account',
    adapter,
  };
  const pilot = createStayMpesaPilot(engine, options, async () => {});
  const event = (extra: any = {}) =>
    signed({
      providerAccountId: 'account',
      checkoutRequestId: 'checkout-id',
      merchantRequestId: 'merchant-request',
      eventId: 'event',
      status: 'settled',
      amountMinor: 24000,
      currency: 'KES',
      occurredAt: new Date(now).toISOString(),
      ...extra,
    });
  return {
    state,
    pilot,
    event,
    engine,
    options,
    sends: () => sends,
    mode: (v: string) => (sendMode = v),
    failAccepted: () => (failAccepted = true),
  };
}
test('default-off and production hard gate invoke no adapter/provider', async () => {
  const f = fixture();
  await assert.rejects(() =>
    createStayMpesaPilot(f.engine, { ...f.options, enabled: false }).dispatch('fixture-session'),
  );
  assert.equal(f.sends(), 0);
  Object.assign(process.env, { NODE_ENV: 'production' });
  try {
    await assert.rejects(() => f.pilot.dispatch('fixture-session'));
  } finally {
    Object.assign(process.env, { NODE_ENV: 'test' });
  }
  assert.equal(f.sends(), 0);
});
test('concurrent calls/replays cause one send; claim durable before adapter and exact amount retained', async () => {
  const f = fixture();
  const results = await Promise.all([
    f.pilot.dispatch('fixture-session'),
    f.pilot.dispatch('fixture-session'),
  ]);
  assert.equal(f.sends(), 1);
  assert.ok(results.some((r) => r.status === 'accepted'));
  assert.equal(f.state.docs[0].nexg.stayPayment.providerReference, 'checkout-id');
  await f.pilot.dispatch('fixture-session');
  assert.equal(f.sends(), 1);
  assert.equal(f.state.docs[0].nexg.paidMinor, undefined);
  assert.equal(f.state.audits[0].event, 'stay.mpesa.dispatch.claimed');
  assert.ok(!JSON.stringify(results).includes(checkout.phone));
  assert.ok(!JSON.stringify(results).includes('checkout-id'));
});
test('fractional KES, unprepared attempt and wrong actor never dispatch', async () => {
  for (const change of [
    (f: any) => {
      f.state.docs[0].nexg.stayPaymentPreparation.amountMinor = 24001;
      f.state.docs[0].nexg.stayHold.totalMinor = 24001;
    },
    (f: any) => delete f.state.docs[0].nexg.stayPaymentPreparation,
    (f: any) => (f.state.docs[0].nexg.createdBy = 'other'),
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(() => f.pilot.dispatch('fixture-session'));
    assert.equal(f.sends(), 0);
  }
});
test('timeout/unverified response never resends or invents paid/available outcome', async () => {
  for (const mode of ['timeout', 'wrong-account']) {
    const f = fixture();
    f.mode(mode);
    assert.equal((await f.pilot.dispatch('fixture-session')).status, 'reconciliation');
    assert.equal((await f.pilot.dispatch('fixture-session')).status, 'reconciliation');
    assert.equal(f.sends(), 1);
    assert.equal(f.state.docs[0].nexg.stayPayment, undefined);
    assert.equal((await f.pilot.reconcile(f.event())).reason, 'unmatched_provider_event');
    assert.equal(f.state.docs[0].nexg.paidMinor, undefined);
  }
});
test('accepted-result persistence failure preserves claim and never sends second STK', async () => {
  const f = fixture();
  f.failAccepted();
  await assert.rejects(() => f.pilot.dispatch('fixture-session'), /database write failed/);
  assert.equal(f.state.docs[0].nexg.stayMpesaDispatch.state, 'dispatching');
  assert.equal((await f.pilot.dispatch('fixture-session')).status, 'reconciliation');
  assert.equal(f.sends(), 1);
});
test('authenticated exact provider evidence settles only stored account and IDs with replay protection', async () => {
  const f = fixture();
  await f.pilot.dispatch('fixture-session');
  const result = await f.pilot.reconcile(f.event());
  assert.equal(result.outcome, 'confirmed');
  assert.equal(f.state.docs[0].nexg.paidMinor, 24000);
  const before = JSON.stringify(f.state.docs);
  await f.pilot.reconcile(f.event());
  assert.equal(JSON.stringify(f.state.docs), before);
  await assert.rejects(() => f.pilot.reconcile({ ...f.event(), signature: '0'.repeat(64) }));
  await assert.rejects(() => f.pilot.reconcile(f.event({ providerAccountId: 'other' })));
  assert.equal(
    (await f.pilot.reconcile(f.event({ merchantRequestId: 'wrong', eventId: 'different' })))
      .outcome,
    'reconciliation',
  );
  assert.equal(f.sends(), 1);
});
test('late accepted result binds evidence but late funds reconcile, never resurrect', async () => {
  const f = fixture();
  f.mode('late');
  assert.equal((await f.pilot.dispatch('fixture-session')).status, 'reconciliation');
  assert.equal(f.state.docs[0].nexg.stayPayment.providerReference, 'checkout-id');
  assert.equal((await f.pilot.reconcile(f.event())).outcome, 'reconciliation');
  assert.equal(f.state.docs[0].status, 'held');
  assert.equal(f.state.docs[0].nexg.stayPaymentReconciliation.fundsObserved, true);
});
test('missing/excess provider amount cannot be synthesized from requested amount', async () => {
  for (const amountMinor of [undefined, 24001]) {
    const f = fixture();
    await f.pilot.dispatch('fixture-session');
    assert.equal((await f.pilot.reconcile(f.event({ amountMinor }))).outcome, 'reconciliation');
    assert.equal(f.state.docs[0].status, 'held');
    assert.equal(f.state.docs[0].nexg.paidMinor, undefined);
    assert.equal(f.state.docs[0].nexg.stayPaymentReconciliation.state, 'required');
  }
});
