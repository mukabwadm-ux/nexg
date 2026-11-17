import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readStayActivityList } from '../src/stay-activity-list.js';

const identity = {
  businessId: randomUUID(),
  userId: randomUUID(),
  role: 'customer',
  expiresAt: Date.now() + 60000,
};
const transaction = { request: { transactionID: 'snapshot' }, coherentSnapshot: true as const };
function row(): any {
  return {
    publicId: randomUUID(),
    businessId: identity.businessId,
    status: 'confirmed',
    startTime: '2030-01-02T12:00:00Z',
    endTime: '2030-01-04T07:00:00Z',
    guest: { email: 'private@example.test' },
    nexg: {
      model: 'ASSET_INTERVAL',
      createdBy: identity.userId,
      offeringId: randomUUID(),
      paymentState: 'provider_verified',
      paidMinor: 20000,
      stayPayment: {
        state: 'settled',
        amountMinor: 20000,
        currency: 'KES',
        providerReference: 'private',
      },
      stayHold: {
        contractVersion: 1,
        quoteId: randomUUID(),
        propertyId: randomUUID(),
        unitId: randomUUID(),
        checkIn: '2030-01-02',
        checkOut: '2030-01-04',
        adults: 2,
        children: 0,
        nights: 2,
        nightlyMinor: 10000,
        totalMinor: 20000,
      },
    },
  };
}
function engine(docs: any[], options: { hasNextPage?: boolean; error?: Error } = {}): any {
  return {
    managementContext: () => ({
      now: () => Date.parse('2030-01-01T00:00:00Z'),
      request: (actor: any, tx: any) => {
        assert.equal(actor, identity);
        assert.equal(tx, 'snapshot');
        return {
          context: { actor },
          transactionID: tx,
          payload: {
            find: async (q: any) => {
              assert.equal(q.collection, 'reservations');
              assert.deepEqual(q.where, {
                and: [
                  { businessId: { equals: identity.businessId } },
                  { status: { equals: 'confirmed' } },
                ],
              });
              assert.equal(q.overrideAccess, false);
              assert.equal(q.depth, 0);
              assert.equal(q.limit, 1001);
              if (options.error) throw options.error;
              return { docs, hasNextPage: options.hasNextPage ?? false };
            },
          },
        };
      },
    }),
  };
}
test('account list projects only durable verified owned confirmed stays without private fields', async () => {
  const prior = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'test' });
  try {
    const valid = row(),
      excluded = [];
    for (const change of [
      (r: any) => (r.businessId = randomUUID()),
      (r: any) => (r.nexg.createdBy = randomUUID()),
      (r: any) => (r.status = 'held'),
      (r: any) => (r.nexg.paymentState = 'unpaid'),
      (r: any) => (r.nexg.stayHold.contractVersion = 2),
      (r: any) => (r.nexg.stayPaymentReconciliation = { state: 'required', fundsObserved: true }),
    ]) {
      const r = row();
      change(r);
      excluded.push(r);
    }
    const result = await readStayActivityList(engine([valid, ...excluded]), identity, transaction);
    assert.equal(result.complete, true);
    assert.equal(result.scope, 'tenant');
    assert.equal(result.source, 'nexg-booking-engine');
    assert.deepEqual(
      result.items.map((item) => item.bookingId),
      [valid.publicId],
    );
    assert.ok(!JSON.stringify(result).includes('private'));
    assert.deepEqual((await readStayActivityList(engine([]), identity, transaction)).items, []);
  } finally {
    if (prior === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: prior });
  }
});
test('list fails closed on overflow, duplicate identity, storage error, missing snapshot or production', async () => {
  const prior = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'test' });
  try {
    await assert.rejects(
      () => readStayActivityList(engine([], { hasNextPage: true }), identity, transaction),
      { code: 'stay_activity_scope_limit' },
    );
    const r = row();
    await assert.rejects(() => readStayActivityList(engine([r, r]), identity, transaction), {
      code: 'stay_activity_identity_conflict',
    });
    await assert.rejects(
      () =>
        readStayActivityList(
          engine([], { error: new Error('storage failed') }),
          identity,
          transaction,
        ),
      /storage failed/,
    );
    await assert.rejects(() => readStayActivityList(engine([]), identity, {} as any), {
      code: 'stay_snapshot_required',
    });
    await assert.rejects(
      () => readStayActivityList(engine([]), { ...identity, role: 'owner' }, transaction),
      { code: 'forbidden' },
    );
    Object.assign(process.env, { NODE_ENV: 'production' });
    await assert.rejects(() => readStayActivityList(engine([]), identity, transaction), {
      code: 'stay_pilot_disabled',
    });
  } finally {
    if (prior === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: prior });
  }
});
