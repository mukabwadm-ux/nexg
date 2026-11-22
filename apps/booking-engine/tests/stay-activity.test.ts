import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { projectStayActivity, readStayActivity } from '../src/stay-activity.js';
import { stayHoldView } from '../src/stays.js';
const now = Date.parse('2030-01-01T00:00:00Z'),
  identity = {
    businessId: randomUUID(),
    userId: randomUUID(),
    role: 'customer',
    expiresAt: now + 60000,
  };
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
      version: 2,
      expiresAt: null,
      paymentState: 'provider_verified',
      paidMinor: 20000,
      stayPayment: {
        state: 'settled',
        amountMinor: 20000,
        currency: 'KES',
        providerReference: 'private-provider-reference',
      },
      stayHold: {
        contractVersion: 1,
        quoteId: randomUUID(),
        propertyId: randomUUID(),
        unitId: randomUUID(),
        checkIn: '2030-01-02',
        checkOut: '2030-01-04',
        adults: 2,
        children: 1,
        nights: 2,
        nightlyMinor: 10000,
        totalMinor: 20000,
      },
    },
  };
}
const source = (r: any) => ({
  businessId: r.businessId,
  createdBy: r.nexg.createdBy,
  hold: stayHoldView(r, now),
});
test('stable confirmed Activity uses accepted dates/party/reference without invented property or private data', () => {
  const r = row(),
    before = JSON.stringify(r),
    a = projectStayActivity(identity, source(r));
  assert.equal(a.id, 'stay:' + r.publicId);
  assert.equal(a.bookingReference, r.publicId);
  assert.equal(a.checkIn, '2030-01-02');
  assert.equal(a.children, 1);
  assert.equal(a.timeZone, 'Africa/Nairobi');
  assert.deepEqual(projectStayActivity(identity, source(r)), a);
  assert.equal(JSON.stringify(r), before);
  for (const field of [
    'propertyName',
    'address',
    'coordinates',
    'guest',
    'email',
    'phone',
    'providerReference',
  ])
    assert.ok(!(field in a));
  assert.ok(!JSON.stringify(a).includes('private'));
});
test('unpaid, unverified, reconciliation, cross-actor and cross-tenant activity fail closed', () => {
  for (const change of [
    (r: any) => (r.status = 'held'),
    (r: any) => (r.nexg.paymentState = 'unpaid'),
    (r: any) => (r.nexg.paidMinor = 1),
    (r: any) => (r.nexg.stayPaymentReconciliation = { state: 'required', fundsObserved: true }),
    (r: any) => (r.nexg.createdBy = randomUUID()),
    (r: any) => (r.businessId = randomUUID()),
  ]) {
    const r = row();
    change(r);
    assert.throws(() => projectStayActivity(identity, source(r)), {
      code: 'stay_activity_unavailable',
    });
  }
  assert.throws(() => projectStayActivity({ ...identity, role: 'owner' }, source(row())));
});
test('invalid dates, party, price and resource identities cannot become confirmed activity', () => {
  for (const change of [
    (s: any) => (s.hold.checkIn = '2030-02-30'),
    (s: any) => (s.hold.startTime = '2030-01-03T12:00:00Z'),
    (s: any) => (s.hold.adults = 0),
    (s: any) => (s.hold.totalMinor = 1),
    (s: any) => (s.hold.unitId = 'unknown'),
  ]) {
    const s = source(row());
    change(s);
    assert.throws(() => projectStayActivity(identity, s));
  }
});
test('scoped reader uses actual settled record and refuses foreign or unknown-contract rows', async () => {
  const r = row();
  let reads = 0;
  const engine: any = {
    managementContext: () => ({
      own: async (collection: string, id: string, actor: any) => {
        reads++;
        assert.equal(collection, 'reservations');
        assert.equal(id, r.publicId);
        assert.equal(actor, identity);
        return r;
      },
      now: () => now,
    }),
  };
  assert.equal((await readStayActivity(engine, identity, r.publicId)).bookingId, r.publicId);
  assert.equal(reads, 1);
  r.nexg.createdBy = randomUUID();
  await assert.rejects(() => readStayActivity(engine, identity, r.publicId));
  r.nexg.createdBy = identity.userId;
  r.nexg.stayHold.contractVersion = 2;
  await assert.rejects(() => readStayActivity(engine, identity, r.publicId));
});
