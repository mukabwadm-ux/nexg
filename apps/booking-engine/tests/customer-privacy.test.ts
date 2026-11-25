import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, createHmac } from 'node:crypto';
import { createPayload } from '../src/payload.js';
import { BookingEngine } from '../src/engine.js';
import { createBookingServer } from '../src/server.js';
import { manageOffering } from '../src/management.js';
import {
  normalizeBookingCode,
  newBookingCode,
  sameReservationName,
} from '../src/customer-privacy.js';
import { normalizePublicDetails } from '../src/public-details.js';
import type { Identity, OfferingInput } from '../src/types.js';

process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = 'true';

test('booking codes and reservation names', () => {
  for (let i = 0; i < 200; i++) {
    const code = newBookingCode();
    assert.match(code, /^[A-HJKMNP-Z2-9]{6}$/);
    assert.equal(normalizeBookingCode(code.toLowerCase().slice(0, 3) + '-' + code.slice(3)), code);
  }
  assert.equal(normalizeBookingCode('ABC1EF'), null, '1 is never used');
  assert.equal(normalizeBookingCode('ABCDEFG'), null);
  assert.equal(normalizeBookingCode(42), null);
  assert.ok(sameReservationName('  Wanjiru  Kamau', 'wanjiru kamau'));
  assert.ok(sameReservationName('Zoë', 'zoe'));
  assert.ok(!sameReservationName('Wanjiru', 'Achieng'));
  assert.ok(!sameReservationName('', ''));
});

test('offering details are checked for their model', () => {
  assert.deepEqual(
    normalizePublicDetails('ASSET_INTERVAL', {
      rentalTerms: { depositMinor: 500000, minimumUnits: 1, terms: 'Full tank back.' },
    }).rentalTerms,
    {
      depositMinor: 500000,
      minimumUnits: 1,
      includedDistanceKm: undefined,
      pickupNote: undefined,
      terms: 'Full tank back.',
    },
  );
  assert.throws(
    () => normalizePublicDetails('APPOINTMENT', { rentalTerms: { terms: 'x' } }),
    (e: any) => e.code === 'invalid_public_details',
  );
  assert.deepEqual(
    normalizePublicDetails('REQUEST_QUOTE', { quoteRange: { minMinor: 100, maxMinor: 900 } })
      .quoteRange,
    { minMinor: 100, maxMinor: 900, note: undefined },
  );
  assert.throws(
    () => normalizePublicDetails('REQUEST_QUOTE', { quoteRange: { minMinor: 900, maxMinor: 100 } }),
    (e: any) => e.code === 'invalid_public_details',
  );
  assert.throws(
    () =>
      normalizePublicDetails('SESSION_CAPACITY', {
        ticketTypes: [
          { id: 'adult', name: 'Adult', priceMinor: 100 },
          { id: 'adult', name: 'Again', priceMinor: 100 },
        ],
      }),
    (e: any) => e.code === 'invalid_public_details',
  );
});

test('customer bookings: reference and name only, prepaid, codes, check-in, erasure', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexg-privacy-'));
  let now = Date.parse('2030-01-01T00:00:00Z');
  const payload = await createPayload({
    sqliteUrl: 'file:' + path.join(directory, 'test.db').replaceAll('\\', '/'),
    cacheKey: randomUUID(),
    secret: 'privacy-test-secret-is-long-and-not-production-123456789',
  });
  t.after(() => payload.destroy());
  const engine = new BookingEngine(payload, true, () => now);
  const owner: Identity = {
    businessId: 'privacy-salon',
    userId: 'owner-1',
    role: 'owner',
    expiresAt: Date.now() + 60000,
  };
  const wanjiru: Identity = {
    ...owner,
    role: 'customer',
    userId: `account_${randomUUID()}`,
  };
  const achieng: Identity = { ...owner, role: 'customer', userId: `app_guest_${randomUUID()}` };
  const platform: Identity = { ...owner, role: 'platform', userId: 'nexg-payments' };
  const key = () => randomUUID();
  let offering: any, free: any, ticketed: any;

  await engine.configure(owner, { subcategoryId: 'haircare', published: true }, key());
  const stylist = await engine.addResource(
    owner,
    {
      name: 'Stylist',
      kind: 'staff',
      quantity: 1,
      schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
    },
    key(),
  );
  const base: OfferingInput = {
    name: 'Braids',
    model: 'APPOINTMENT',
    durationMinutes: 60,
    resourceIds: [stylist.id],
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
  offering = await engine.addOffering(owner, base, key());
  free = await engine.addOffering(owner, { ...base, name: 'Consultation', priceMinor: 0 }, key());
  ticketed = await engine.addOffering(
    owner,
    {
      ...base,
      name: 'Class',
      ticketTypes: [
        { id: 'adult', name: 'Adult', priceMinor: 200000 },
        { id: 'child', name: 'Child', priceMinor: 80000, maxPerBooking: 1 },
      ],
    },
    key(),
  );

  const book = (who: Identity, startTime: string, extra: any = {}) =>
    engine.createBooking(
      who,
      {
        offeringId: offering.id,
        startTime,
        customer: { name: 'Wanjiru', email: 'w@example.test', phone: '+254700000000' },
        ...extra,
      },
      key(),
      true,
    ) as Promise<any>;

  let first: any;
  let code = '';
  await t.test('a customer booking keeps the reference and name, nothing else', async () => {
    first = await book(wanjiru, '2030-01-02T09:00:00+03:00');
    const stored = (
      await payload.find({
        collection: 'reservations',
        where: { publicId: { equals: first.booking.id } },
        overrideAccess: true,
      } as any)
    ).docs[0] as any;
    assert.deepEqual(stored.nexg.customer, { ref: wanjiru.userId, name: 'Wanjiru' });
    assert.equal(stored.guest?.email, `booking-${first.booking.id}@guest.nexg.invalid`);
    assert.equal(stored.guest?.phone ?? null, null);
    assert.equal(JSON.stringify(stored).includes('w@example.test'), false);
    assert.equal(JSON.stringify(stored).includes('+254700000000'), false);
    // The customer sees the name, never the reference; the code exists but
    // is shown only once the booking is paid.
    assert.deepEqual(first.booking.customer, { name: 'Wanjiru' });
    assert.match(stored.nexg.bookingCode, /^[A-HJKMNP-Z2-9]{6}$/);
    code = stored.nexg.bookingCode;
    assert.equal(first.booking.bookingCode, null);
    assert.equal(JSON.stringify(first).includes(wanjiru.userId), false);
  });

  await t.test('the shop sees no code and no token in its lists', async () => {
    const listed = (await engine.workspace(owner)).bookings.find(
      (b: any) => b.id === first.booking.id,
    )!;
    assert.equal('bookingCode' in listed, false);
    assert.equal('customerTokenHash' in listed, false);
    assert.equal(JSON.stringify(listed).includes(wanjiru.userId), false);
    assert.equal(listed.customer.name, 'Wanjiru');
  });

  await t.test('a customer booking is held until paid in full', async () => {
    assert.equal(first.booking.status, 'held');
    assert.equal(first.booking.paymentState, 'awaiting_payment');
    assert.equal(first.booking.pricing.dueNowMinor, 150000);
    assert.equal(first.booking.pricing.balanceMinor, 0);
    assert.equal(first.booking.acceptedPolicies.paymentPolicyId, 'NEXG_PREPAID_V1');
    assert.equal(first.booking.expiresAt, '2030-01-01T00:15:00.000Z');
    const quote = await engine.quote(
      wanjiru,
      { offeringId: offering.id, startTime: '2030-01-02T10:00:00+03:00' },
      true,
    );
    assert.equal(quote.dueNowMinor, 150000);
    assert.equal(quote.paymentPolicyId, 'NEXG_PREPAID_V1');
  });

  await t.test('the shop cannot confirm or mark paid a booking NexG collects', async () => {
    const listed = (await engine.workspace(owner)).bookings.find(
      (b: any) => b.id === first.booking.id,
    )!;
    await assert.rejects(
      () =>
        engine.changeBooking(
          owner,
          first.booking.id,
          'confirm',
          { expectedVersion: listed.version },
          key(),
        ),
      (e: any) => e.code === 'payment_required',
    );
    await assert.rejects(
      () =>
        engine.changeBooking(
          owner,
          first.booking.id,
          'record_payment',
          {
            expectedVersion: listed.version,
            amountMinor: 150000,
            method: 'cash',
            reference: 'R1',
            evidence: 'cash',
          },
          key(),
        ),
      (e: any) => e.code === 'payment_policy_required',
    );
  });

  await t.test('check-in by code refuses an unpaid booking', async () => {
    const found = await engine.bookingByCode(owner, code.toLowerCase());
    assert.equal(found.id, first.booking.id);
    assert.equal(found.paid, false);
    await assert.rejects(
      () => engine.arriveByCode(owner, code, {}, key()),
      (e: any) => e.code === 'payment_required',
    );
    await assert.rejects(
      () => engine.bookingByCode(owner, 'nope'),
      (e: any) => e.code === 'invalid_booking_code',
    );
    await assert.rejects(
      () => engine.bookingByCode(owner, 'ZZZZZZ'),
      (e: any) => e.code === 'booking_code_not_found',
    );
    await assert.rejects(
      () => engine.bookingByCode(wanjiru, code),
      (e: any) => e.status === 403,
    );
  });

  await t.test('only NexG settles a payment, for the exact amount', async () => {
    const pay = { provider: 'test', reference: 'PAY-1', amountMinor: 150000 };
    await assert.rejects(
      () => engine.settlePayment(owner, first.booking.id, pay, key()),
      (e: any) => e.status === 403,
    );
    await assert.rejects(
      () => engine.settlePayment(wanjiru, first.booking.id, pay, key()),
      (e: any) => e.status === 403,
    );
    await assert.rejects(
      () => engine.settlePayment(platform, first.booking.id, { ...pay, amountMinor: 1000 }, key()),
      (e: any) => e.code === 'payment_amount_mismatch',
    );
    const paid = (await engine.settlePayment(platform, first.booking.id, pay, key())) as any;
    assert.equal(paid.status, 'confirmed');
    assert.equal(paid.paymentState, 'provider_verified');
    assert.equal(paid.paidMinor, 150000);
    const again = (await engine.settlePayment(platform, first.booking.id, pay, key())) as any;
    assert.equal(again.paidMinor, 150000, 'the same payment twice counts once');
    const mine = (await engine.customerBooking(
      wanjiru,
      first.booking.id,
      first.customerToken,
    )) as any;
    assert.equal(mine.bookingCode, code, 'paid, the customer now sees the code');
  });

  await t.test('a booking is paid in full even when the business asks a deposit', async () => {
    // Owner, 25 Nov 2026: "booking means youve paid 100% same with reservations" (ends the 22 Nov deposits).
    const withDeposit = (await engine.addOffering(
      owner,
      {
        ...base,
        name: 'Braids with deposit',
        paymentPolicyId: 'MANUAL_COLLECTION_V1',
        reservationFee: {
          mode: 'fixed',
          amountMinor: 50000,
          treatment: 'credited_to_total',
          requiredBeforeConfirmation: true,
          refundTerms: 'The deposit is kept if you do not come.',
        },
      },
      key(),
    )) as any;
    const kamau: Identity = { ...owner, role: 'customer', userId: `account_${randomUUID()}` };
    const held = (await engine.createBooking(
      kamau,
      {
        offeringId: withDeposit.id,
        startTime: '2030-01-06T15:00:00+03:00',
        customer: { name: 'Kamau' },
      },
      key(),
      true,
    )) as any;
    assert.equal(held.booking.status, 'held');
    assert.equal(held.booking.pricing.dueNowMinor, 150000, 'the whole amount is due now');
    assert.equal(held.booking.pricing.balanceMinor, 0);
    assert.equal(held.booking.acceptedPolicies.paymentPolicyId, 'NEXG_PREPAID_V1');

    await assert.rejects(
      () =>
        engine.settlePayment(
          platform,
          held.booking.id,
          { provider: 'paystack', reference: 'DEP-0', amountMinor: 50000 },
          key(),
        ),
      (e: any) => e.code === 'payment_amount_mismatch',
      'a deposit alone no longer confirms a booking',
    );
    const paid = (await engine.settlePayment(
      platform,
      held.booking.id,
      { provider: 'paystack', reference: 'FULL-1', amountMinor: 150000 },
      key(),
    )) as any;
    assert.equal(paid.status, 'confirmed', 'the whole amount confirms the booking');
    assert.equal(paid.paidMinor, 150000);
    now += 60 * 60 * 1000;
    await assert.rejects(
      () =>
        engine.settlePayment(
          platform,
          held.booking.id,
          { provider: 'paystack', reference: 'BAL-2', amountMinor: 1 },
          key(),
        ),
      (e: any) => e.code === 'already_paid',
      'nothing more is taken once paid in full',
    );
    now -= 60 * 60 * 1000;
  });

  await t.test('check-in by code: the name must match, then it is recorded once', async () => {
    await assert.rejects(
      () => engine.arriveByCode(owner, code, { reservationName: 'Achieng' }, key()),
      (e: any) => e.code === 'reservation_name_mismatch',
    );
    const arrived = (await engine.arriveByCode(
      owner,
      code,
      { reservationName: 'wanjiru' },
      key(),
    )) as any;
    assert.equal(arrived.used, true);
    assert.equal(arrived.paymentState, 'provider_verified');
    assert.ok(arrived.arrivedAt);
    await assert.rejects(
      () => engine.arriveByCode(owner, code, {}, key()),
      (e: any) => e.code === 'booking_code_used',
      'a used code stops working',
    );
    const looked = (await engine.bookingByCode(owner, code)) as any;
    assert.equal(looked.used, true);
    assert.equal('customer' in looked, false, 'a used code no longer shows whose booking it was');
    const mine = (await engine.customerBooking(
      wanjiru,
      first.booking.id,
      first.customerToken,
    )) as any;
    assert.equal(mine.bookingCode, null, 'and the customer no longer has a code to show');
  });

  await t.test('wrong codes are limited, then lock for 15 minutes', async () => {
    const other: Identity = { ...owner, businessId: 'privacy-lockout' };
    for (let i = 0; i < 10; i++)
      await assert.rejects(
        () => engine.bookingByCode(other, 'ZZZZZ' + 'ABCDEFGHJK'[i]),
        (e: any) => e.code === 'booking_code_not_found' || e.code === 'not_found',
      );
    await assert.rejects(
      () => engine.bookingByCode(other, 'ZZZZZZ'),
      (e: any) => e.code === 'too_many_code_attempts' && e.status === 429,
    );
    // Only that business is locked.
    assert.equal(((await engine.bookingByCode(owner, code)) as any).used, true);
    now += 16 * 60000;
    await assert.rejects(
      () => engine.bookingByCode(other, 'ZZZZZZ'),
      (e: any) => e.code !== 'too_many_code_attempts',
    );
    now -= 16 * 60000;
  });

  await t.test(
    'an unpaid hold is released after 15 minutes and refuses a late payment',
    async () => {
      const late = await book(achieng, '2030-01-02T12:00:00+03:00', {
        customer: { name: 'Achieng' },
      });
      now += 16 * 60000;
      assert.equal(
        (await engine.customerBooking(achieng, late.booking.id, late.customerToken)).status,
        'expired',
      );
      await assert.rejects(
        () =>
          engine.settlePayment(
            platform,
            late.booking.id,
            { provider: 'test', reference: 'PAY-2', amountMinor: 150000 },
            key(),
          ),
        (e: any) => e.code === 'hold_expired',
      );
    },
  );

  await t.test('test payments: off unless switched on, and always marked', async () => {
    const r = await book(achieng, '2030-01-05T09:00:00+03:00', { customer: { name: 'Achieng' } });
    const test = { provider: 'simulated', reference: 'SIM-1' };
    await assert.rejects(
      () => engine.settlePayment(platform, r.booking.id, test, key()),
      (e: any) => e.code === 'simulated_payments_off',
    );
    const testing = new BookingEngine(payload, true, () => now, { simulatedPayments: true });
    const paid = (await testing.settlePayment(platform, r.booking.id, test, key())) as any;
    assert.equal(paid.status, 'confirmed');
    assert.equal(paid.paymentState, 'simulated');
    assert.equal(paid.paidMinor, 150000, 'for exactly the amount due');
    assert.equal(paid.paymentEvidence.at(-1).verification, 'simulated');
    const mine = (await engine.customerBooking(achieng, r.booking.id, r.customerToken)) as any;
    assert.match(mine.bookingCode, /^[A-HJKMNP-Z2-9]{6}$/, 'the customer gets their code');
    const looked = (await engine.bookingByCode(owner, mine.bookingCode)) as any;
    assert.equal(looked.testPayment, true, 'the shop sees it was a test payment');
  });

  await t.test('a free booking has nothing to pay and is confirmed', async () => {
    const r = (await engine.createBooking(
      achieng,
      {
        offeringId: free.id,
        startTime: '2030-01-03T09:00:00+03:00',
        customer: { name: 'Achieng' },
      },
      key(),
      true,
    )) as any;
    assert.equal(r.booking.status, 'confirmed');
    assert.equal(r.booking.paymentState, 'not_required');
  });

  await t.test('a name to reserve under is required', async () => {
    await assert.rejects(
      () => book(achieng, '2030-01-03T11:00:00+03:00', { customer: { email: 'a@example.test' } }),
      (e: any) => e.code === 'reservation_name_required',
    );
  });

  await t.test('ticket types: listed, priced and required', async () => {
    const catalog = await engine.publicCatalog(wanjiru);
    const listed = catalog.offerings.find((o: any) => o.id === ticketed.id)!;
    assert.deepEqual(
      listed.ticketTypes!.map((x: any) => [x.id, x.priceMinor]),
      [
        ['adult', 200000],
        ['child', 80000],
      ],
    );
    await assert.rejects(
      () =>
        engine.quote(
          wanjiru,
          { offeringId: ticketed.id, startTime: '2030-01-04T09:00:00+03:00' },
          true,
        ),
      (e: any) => e.code === 'ticket_type_required',
    );
    const q = await engine.quote(
      wanjiru,
      { offeringId: ticketed.id, startTime: '2030-01-04T09:00:00+03:00', ticketTypeId: 'child' },
      true,
    );
    assert.equal(q.totalMinor, 80000);
    const r = (await engine.createBooking(
      wanjiru,
      {
        offeringId: ticketed.id,
        startTime: '2030-01-04T09:00:00+03:00',
        ticketTypeId: 'child',
        expectedTotalMinor: 80000,
        customer: { name: 'Wanjiru' },
      },
      key(),
      true,
    )) as any;
    assert.equal(r.booking.priceMinor, 80000);
    assert.deepEqual(r.booking.ticketType, { id: 'child', name: 'Child' });
    // A shop edits an offering's details while it has no open bookings.
    const spare = await engine.addOffering(owner, { ...base, name: 'Spare' }, key());
    const refused = (await manageOffering(
      engine,
      owner,
      spare.id,
      { expectedVersion: 1, rentalTerms: { terms: 'x' } },
      key(),
    ).catch((e: any) => e)) as any;
    assert.equal(refused.code, 'invalid_public_details');
    const edited = (await manageOffering(
      engine,
      owner,
      spare.id,
      { expectedVersion: 1, ticketTypes: [{ id: 'vip', name: 'VIP', priceMinor: 500000 }] },
      key(),
    )) as any;
    assert.equal(edited.ticketTypes?.[0]?.id ?? edited.nexg?.ticketTypes?.[0]?.id, 'vip');
    const cleared = (await manageOffering(
      engine,
      owner,
      spare.id,
      { expectedVersion: 2, ticketTypes: null },
      key(),
    )) as any;
    assert.equal(cleared.ticketTypes ?? cleared.nexg?.ticketTypes, undefined);
  });

  await t.test(
    'forgetting a customer erases their name at this business, and only theirs',
    async () => {
      const before = await engine.workspace(owner);
      const achiengBookings = before.bookings.filter(
        (b: any) => b.customer?.name === 'Achieng',
      ).length;
      await assert.rejects(
        () => engine.forgetCustomer(owner, wanjiru.userId, key()),
        (e: any) => e.status === 403,
      );
      await assert.rejects(
        () => engine.forgetCustomer(platform, 'not-a-ref', key()),
        (e: any) => e.code === 'invalid_customer_ref',
      );
      const result = (await engine.forgetCustomer(platform, wanjiru.userId, key())) as any;
      assert.equal(result.forgotten, 2);
      const docs = (
        await payload.find({ collection: 'reservations', limit: 100, overrideAccess: true } as any)
      ).docs as any[];
      const text = JSON.stringify(docs);
      assert.equal(text.includes(wanjiru.userId), false, 'the reference is gone');
      assert.equal(text.includes('"Wanjiru"'), false, 'the name is gone');
      const ops = JSON.stringify(
        (
          await payload.find({
            collection: 'booking-operations',
            limit: 500,
            overrideAccess: true,
          } as any)
        ).docs,
      );
      assert.equal(ops.includes('Wanjiru'), false, 'cached results are cleared');
      const after = await engine.workspace(owner);
      assert.equal(
        after.bookings.filter((b: any) => b.customer?.name === 'Achieng').length,
        achiengBookings,
      );
      // The paid booking itself and its money survive, without the name.
      const kept = after.bookings.find((b: any) => b.id === first.booking.id)!;
      assert.equal(kept.paidMinor, 150000);
      assert.equal(kept.customer.name, 'Removed at the customer’s request');
    },
  );

  await t.test('HTTP: platform routes and code routes keep their roles', async () => {
    const secret = 'privacy-bridge-test-secret-123456789';
    const server = createBookingServer(engine, secret);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const base = 'http://127.0.0.1:' + (server.address() as any).port;
    const call = (route: string, who: Identity, init: RequestInit = {}) => {
      const context = Buffer.from(
        JSON.stringify({ ...who, expiresAt: Date.now() + 60000 }),
      ).toString('base64url');
      return fetch(base + route, {
        ...init,
        headers: {
          'x-nexg-booking-context': context,
          'x-nexg-booking-signature': createHmac('sha256', secret).update(context).digest('hex'),
          'idempotency-key': randomUUID(),
          'content-type': 'application/json',
        },
      });
    };
    assert.equal((await call(`/v1/codes/${code}`, owner)).status, 200);
    assert.equal((await call(`/v1/codes/${code}`, wanjiru)).status, 403);
    const forget = (who: Identity) =>
      call('/v1/platform/customers/forget', who, {
        method: 'POST',
        body: JSON.stringify({ ref: achieng.userId }),
      });
    assert.equal((await forget(owner)).status, 403);
    assert.equal((await forget(wanjiru)).status, 403);
    const ok = await forget(platform);
    assert.equal(ok.status, 200);
    assert.ok((await ok.json()).forgotten >= 1);
  });
});
