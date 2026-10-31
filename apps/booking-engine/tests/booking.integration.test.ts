import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, createHmac } from 'node:crypto';
import { createPayload } from '../src/payload.js';
import { addOccurrence } from '../src/occurrences.js';
import { createClosure, manageResource, manageOffering } from '../src/management.js';
import { BookingEngine } from '../src/engine.js';
import { runSpecialistFixtures } from './specialist-fixtures.js';
import { createBookingServer } from '../src/server.js';
import type { Identity, OfferingInput } from '../src/types.js';

// These assertions use a real Payload Reserve plugin and durable SQLite database.
// They check user outcomes, transaction rollback and tenant boundaries.
test('native booking lifecycle, concurrency, scope and durable storage', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nexg-reserve-'));
  const sqliteUrl = 'file:' + path.join(directory, 'test.db').replaceAll('\\', '/');
  let now = Date.parse('2030-01-01T00:00:00Z');
  const payload = await createPayload({
    sqliteUrl,
    cacheKey: randomUUID(),
    secret: 'test-secret-is-long-and-not-production-123456789',
  });
  let payloadClosed = false;
  const engine = new BookingEngine(payload, true, () => now);
  const owner: Identity = {
    businessId: 'test-hair-a',
    userId: 'owner-a',
    role: 'owner',
    expiresAt: Date.now() + 60000,
  };
  const other: Identity = { ...owner, businessId: 'test-hair-b', userId: 'owner-b' };
  const customer = { name: 'A customer', email: 'customer@example.test' };
  let resource: any, offering: any, booking: any;
  const key = () => randomUUID();
  const create = (startTime: string, extra: any = {}) =>
    engine.createBooking(
      owner,
      { offeringId: offering.id, startTime, customer, ...extra },
      key(),
    ) as Promise<any>;
  try {
    await t.test('setup persists real resources and exact versioned policies', async () => {
      await engine.configure(owner, { subcategoryId: 'haircare', published: false }, key());
      resource = await engine.addResource(
        owner,
        {
          name: 'Stylist A',
          kind: 'staff',
          quantity: 1,
          schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
        },
        key(),
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
      offering = await engine.addOffering(owner, input, key());
      const workspace = await engine.workspace(owner);
      assert.equal(workspace.resources.length, 1);
      assert.equal(workspace.offerings[0].readiness.canConfirmNative, true);
      assert.equal(workspace.business.timezone, 'Africa/Nairobi');
    });
    await t.test('tenant and branch boundaries reject foreign records', async () => {
      await engine.configure(other, { subcategoryId: 'haircare' }, key());
      await assert.rejects(
        () =>
          engine.createBooking(
            other,
            { offeringId: offering.id, startTime: '2030-01-02T09:00:00+03:00', customer },
            key(),
          ),
        (e: any) => e.status === 404,
      );
      await assert.rejects(
        () =>
          engine.createBooking(
            { ...owner, branches: ['elsewhere'] },
            { offeringId: offering.id, startTime: '2030-01-02T09:00:00+03:00', customer },
            key(),
          ),
        (e: any) => e.status === 403,
      );
      assert.equal((await engine.workspace(other)).bookings.length, 0);
    });
    await t.test('last place has exactly one winner under concurrent writes', async () => {
      const results = await Promise.allSettled([
        create('2030-01-02T09:00:00+03:00'),
        create('2030-01-02T09:00:00+03:00'),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
      booking = (results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>)
        .value;
      assert.equal(booking.status, 'confirmed');
    });
    await t.test('same operation key is idempotent and changed input conflicts', async () => {
      const operationKey = key(),
        input = { offeringId: offering.id, startTime: '2030-01-02T11:00:00+03:00', customer };
      const first = (await engine.createBooking(owner, input, operationKey)) as any,
        second = (await engine.createBooking(owner, input, operationKey)) as any;
      assert.equal(first.id, second.id);
      await assert.rejects(
        () => engine.createBooking(owner, { ...input, notes: 'different' }, operationKey),
        (e: any) => e.code === 'idempotency_conflict',
      );
    });
    await t.test(
      'failed reschedule preserves original reservation and audit atomicity',
      async () => {
        const before = (await engine.workspace(owner)).bookings.find((b) => b.id === booking.id)!;
        await assert.rejects(() =>
          engine.changeBooking(
            owner,
            booking.id,
            'reschedule',
            { expectedVersion: before.version, startTime: '2030-01-02T11:00:00+03:00' },
            key(),
          ),
        );
        const after = (await engine.workspace(owner)).bookings.find((b) => b.id === booking.id)!;
        assert.equal(after.startTime, before.startTime);
        assert.equal(after.version, before.version);
      },
    );
    await t.test('expired hold releases capacity but cannot be confirmed', async () => {
      const held = await create('2030-01-03T09:00:00+03:00', { hold: true });
      assert.equal(held.status, 'held');
      now += 11 * 60000;
      await engine.expireHolds(owner);
      const expired = (await engine.workspace(owner)).bookings.find((b) => b.id === held.id)!;
      assert.equal(expired.status, 'expired');
      await assert.rejects(
        () =>
          engine.changeBooking(
            owner,
            held.id,
            'confirm',
            { expectedVersion: expired.version },
            key(),
          ),
        (e: any) => e.code === 'invalid_transition',
      );
      assert.equal((await create('2030-01-03T09:00:00+03:00')).status, 'confirmed');
    });
    await t.test('public page requires publication and private booking capability', async () => {
      const guest = { ...owner, role: 'customer', userId: 'public' };
      await assert.rejects(
        () => engine.publicCatalog(guest),
        (e: any) => e.code === 'not_published',
      );
      await engine.configure(owner, { subcategoryId: 'haircare', published: true }, key());
      const result = (await engine.createBooking(
        guest,
        { offeringId: offering.id, startTime: '2030-01-04T09:00:00+03:00', customer },
        key(),
        true,
      )) as any;
      assert.ok(result.customerToken);
      assert.equal(
        (await engine.customerBooking(guest, result.booking.id, result.customerToken)).id,
        result.booking.id,
      );
      await assert.rejects(
        () => engine.customerBooking(guest, result.booking.id, 'wrong-token'),
        (e: any) => e.status === 403,
      );
      assert.equal('customerTokenHash' in result.booking, false);
    });
    await t.test('nonblocking work has no fabricated calendar time or resource lock', async () => {
      await engine.configure(
        owner,
        {
          subcategoryId: 'haircare',
          published: true,
          canonicalAnswers: { Q_PRODUCTS_FOR_SALE: true },
        },
        key(),
      );
      const requestOffering = (await engine.addOffering(
        owner,
        {
          name: 'Product request',
          model: 'ORDER',
          resourceIds: [],
          priceMinor: 0,
          currency: 'KES',
          intakeMode: 'merchant_approval',
          active: true,
        },
        key(),
      )) as any;
      let request = (await engine.createBooking(
        owner,
        { offeringId: requestOffering.id, customer },
        key(),
      )) as any;
      assert.equal(request.startTime, null);
      assert.equal(request.status, 'pending');
      request = await engine.changeBooking(
        owner,
        request.id,
        'accept',
        { expectedVersion: request.version },
        key(),
      );
      assert.equal(request.status, 'accepted');
      request = await engine.changeBooking(
        owner,
        request.id,
        'start',
        { expectedVersion: request.version },
        key(),
      );
      assert.equal(request.status, 'in_progress');
      request = await engine.changeBooking(
        owner,
        request.id,
        'complete',
        {
          expectedVersion: request.version,
          completionEvidence: 'Merchant supplied order and recorded handover.',
        },
        key(),
      );
      assert.equal(request.status, 'completed');
    });
    await t.test(
      'reservation fees require actual merchant collection evidence and preserve accepted terms',
      async () => {
        const feeOffering = (await engine.addOffering(
          owner,
          {
            name: 'Fee appointment',
            model: 'APPOINTMENT',
            durationMinutes: 60,
            resourceIds: [resource.id],
            priceMinor: 200000,
            currency: 'KES',
            intakeMode: 'instant_after_requirements',
            active: true,
            bookingEnabled: true,
            leadTimeMinutes: 0,
            horizonDays: 3650,
            paymentPolicyId: 'MANUAL_COLLECTION_V1',
            changePolicyId: 'CHANGE_BEFORE_START_V1',
            policyVersion: 1,
            reservationFee: {
              mode: 'percentage',
              percentageBps: 2500,
              treatment: 'credited_to_total',
              requiredBeforeConfirmation: true,
              refundTerms: 'Merchant reviews refund requests before work starts.',
            },
          },
          key(),
        )) as any;
        const input = {
          offeringId: feeOffering.id,
          startTime: '2030-01-05T09:00:00+03:00',
          customer,
        };
        const quote = await engine.quote(owner, input);
        assert.equal(quote.serviceSubtotalMinor, 200000);
        assert.equal(quote.reservationFeeMinor, 50000);
        assert.equal(quote.totalDueMinor, 200000);
        assert.equal(quote.dueNowMinor, 50000);
        assert.equal(quote.balanceMinor, 150000);
        let held = (await engine.createBooking(
          owner,
          { ...input, expectedTotalMinor: 200000 },
          key(),
        )) as any;
        assert.equal(held.status, 'held');
        await assert.rejects(
          () =>
            engine.changeBooking(
              owner,
              held.id,
              'confirm',
              { expectedVersion: held.version },
              key(),
            ),
          (e: any) => e.code === 'payment_required',
        );
        await assert.rejects(
          () =>
            engine.changeBooking(
              { ...owner, role: 'manager' },
              held.id,
              'record_payment',
              {
                expectedVersion: held.version,
                amountMinor: 50000,
                method: 'cash',
                reference: 'Receipt 01',
                evidence: 'Cash physically collected.',
              },
              key(),
            ),
          (e: any) => e.status === 403,
        );
        held = await engine.changeBooking(
          owner,
          held.id,
          'record_payment',
          {
            expectedVersion: held.version,
            amountMinor: 50000,
            method: 'cash',
            reference: 'Receipt 01',
            evidence: 'Cash physically collected by owner.',
          },
          key(),
        );
        assert.equal(held.paymentState, 'merchant_recorded');
        assert.equal(held.paidMinor, 50000);
        assert.equal(held.paymentEvidence[0].verification, 'merchant_asserted');
        let confirmed = await engine.changeBooking(
          owner,
          held.id,
          'confirm',
          { expectedVersion: held.version },
          key(),
        );
        assert.equal(confirmed.status, 'confirmed');
        assert.equal(confirmed.acceptedReservationFee.percentageBps, 2500);
        let cancelled = await engine.changeBooking(
          owner,
          held.id,
          'cancel',
          { expectedVersion: confirmed.version },
          key(),
        );
        assert.equal(cancelled.refundState, 'review_required');
        cancelled = await engine.changeBooking(
          owner,
          held.id,
          'record_refund',
          {
            expectedVersion: cancelled.version,
            amountMinor: 50000,
            reference: 'Refund receipt 01',
            evidence: 'Owner returned collected cash to customer.',
          },
          key(),
        );
        assert.equal(cancelled.refundState, 'merchant_recorded_refunded');
      },
    );
    await t.test(
      'actual table selection validates party size, parallel tables and exclusive overlap',
      async () => {
        try {
          const restaurant = {
            ...owner,
            businessId: 'test-restaurant',
            userId: 'restaurant-owner',
          };
          await engine.configure(restaurant, { subcategoryId: 'restaurant' }, key());
          const small = (await engine.addResource(
            restaurant,
            {
              name: 'Table 2',
              kind: 'space',
              quantity: 2,
              partyCapacity: 2,
              schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '23:00' },
            },
            key(),
          )) as any;
          const large = (await engine.addResource(
            restaurant,
            {
              name: 'Table 6',
              kind: 'space',
              quantity: 6,
              partyCapacity: 6,
              schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '23:00' },
            },
            key(),
          )) as any;
          await engine.configure(
            restaurant,
            {
              subcategoryId: 'restaurant',
              canonicalAnswers: {
                BQ_OFFERS_TABLE_RESERVATIONS: true,
                Q_DATA_AUTHORITY: [
                  {
                    data_class: 'reservations',
                    authority: 'NEXG_AUTHORITATIVE',
                    owner_reference: 'nexg-booking-engine',
                    scope: { business_id: restaurant.businessId },
                  },
                ],
                BQ_SPACE_POLICY: {
                  spaces: [
                    {
                      resource_id: small.id,
                      minimum_party_size: 1,
                      maximum_party_size: 2,
                      active: true,
                    },
                    {
                      resource_id: large.id,
                      minimum_party_size: 1,
                      maximum_party_size: 6,
                      active: true,
                    },
                  ],
                  combinations: [],
                  turnover_minutes: 15,
                },
              },
            },
            key(),
          );
          const space = (await engine.addOffering(
            restaurant,
            {
              name: 'Dining reservation',
              model: 'SPACE_RESERVATION',
              durationMinutes: 90,
              resourceIds: [small.id, large.id],
              resourceSelectionMode: 'choose_one',
              priceMinor: 0,
              currency: 'KES',
              intakeMode: 'instant_after_requirements',
              active: true,
              bookingEnabled: true,
              leadTimeMinutes: 0,
              horizonDays: 3650,
              paymentPolicyId: 'NO_PREPAYMENT_V1',
              changePolicyId: 'CHANGE_BEFORE_START_V1',
              policyVersion: 1,
            },
            key(),
          )) as any;
          const input = {
            offeringId: space.id,
            startTime: '2030-01-06T12:00:00+03:00',
            quantity: 4,
            customer,
          };
          await assert.rejects(
            () => engine.createBooking(restaurant, { ...input, resourceIds: [small.id] }, key()),
            (e: any) => e.code === 'party_capacity',
          );
          assert.equal(
            (
              (await engine.createBooking(
                restaurant,
                { ...input, resourceIds: [large.id] },
                key(),
              )) as any
            ).status,
            'confirmed',
          );
          await assert.rejects(() =>
            engine.createBooking(restaurant, { ...input, resourceIds: [large.id] }, key()),
          );
          assert.equal(
            (
              (await engine.createBooking(
                restaurant,
                { ...input, quantity: 2, resourceIds: [small.id] },
                key(),
              )) as any
            ).status,
            'confirmed',
          );
          const combined = (await engine.addOffering(
            restaurant,
            {
              name: 'Approved joined tables',
              model: 'SPACE_RESERVATION',
              durationMinutes: 90,
              resourceIds: [small.id, large.id],
              resourceSelectionMode: 'all_required',
              priceMinor: 0,
              currency: 'KES',
              intakeMode: 'instant_after_requirements',
              active: true,
              bookingEnabled: true,
              leadTimeMinutes: 0,
              horizonDays: 3650,
              paymentPolicyId: 'NO_PREPAYMENT_V1',
              changePolicyId: 'CHANGE_BEFORE_START_V1',
              policyVersion: 1,
            },
            key(),
          )) as any;
          const joint = {
            offeringId: combined.id,
            startTime: '2030-01-07T12:00:00+03:00',
            quantity: 7,
            customer,
          };
          await assert.rejects(
            () => engine.createBooking(restaurant, joint, key()),
            (error: any) => error.code === 'invalid_space_combination',
          );
          await engine.configure(
            restaurant,
            {
              subcategoryId: 'restaurant',
              canonicalAnswers: {
                BQ_OFFERS_TABLE_RESERVATIONS: true,
                Q_DATA_AUTHORITY: [
                  {
                    data_class: 'reservations',
                    authority: 'NEXG_AUTHORITATIVE',
                    owner_reference: 'nexg-booking-engine',
                    scope: { business_id: restaurant.businessId },
                  },
                ],
                BQ_SPACE_POLICY: {
                  spaces: [
                    {
                      resource_id: small.id,
                      minimum_party_size: 1,
                      maximum_party_size: 2,
                      active: true,
                    },
                    {
                      resource_id: large.id,
                      minimum_party_size: 1,
                      maximum_party_size: 6,
                      active: true,
                    },
                  ],
                  combinations: [
                    {
                      combination_id: 'joined-2-and-6',
                      resource_ids: [small.id, large.id],
                      minimum_party_size: 7,
                      maximum_party_size: 8,
                    },
                  ],
                  turnover_minutes: 15,
                },
              },
            },
            key(),
          );
          await assert.rejects(
            () => engine.createBooking(restaurant, { ...joint, quantity: 6 }, key()),
            (error: any) => error.code === 'invalid_space_combination',
          );
          assert.equal(
            ((await engine.createBooking(restaurant, joint, key())) as any).status,
            'confirmed',
          );
          await assert.rejects(() =>
            engine.createBooking(
              restaurant,
              { ...joint, startTime: '2030-01-07T13:40:00+03:00' },
              key(),
            ),
          );
          assert.equal(
            (
              (await engine.createBooking(
                restaurant,
                { ...joint, startTime: '2030-01-07T13:45:00+03:00' },
                key(),
              )) as any
            ).status,
            'confirmed',
          );
        } catch (error: any) {
          console.error(
            'Table reservation regression:',
            error.message,
            JSON.stringify(error.data ?? {}),
          );
          throw error;
        }
      },
    );
    await t.test('physical rental stays occupied when overdue until explicit return', async () => {
      const rental = { ...owner, businessId: 'test-rental', userId: 'rental-owner' };
      await engine.configure(rental, { subcategoryId: 'car_rental' }, key());
      const vehicle = (await engine.addResource(
        rental,
        {
          name: 'Car A',
          kind: 'vehicle',
          quantity: 1,
          schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
        },
        key(),
      )) as any;
      const service = (await engine.addOffering(
        rental,
        {
          name: 'Daily rental',
          model: 'ASSET_INTERVAL',
          durationMinutes: 1440,
          minDurationMinutes: 1440,
          maxDurationMinutes: 43200,
          resourceIds: [vehicle.id],
          priceMinor: 400000,
          currency: 'KES',
          pricingBasis: 'per_duration',
          durationUnitMinutes: 1440,
          intakeMode: 'instant_after_requirements',
          active: true,
          bookingEnabled: true,
          leadTimeMinutes: 0,
          horizonDays: 3650,
          paymentPolicyId: 'NO_PREPAYMENT_V1',
          changePolicyId: 'CHANGE_BEFORE_START_V1',
          policyVersion: 1,
        },
        key(),
      )) as any;
      const driver = (await engine.addResource(
        rental,
        {
          name: 'Driver working Monday and Wednesday',
          kind: 'staff',
          quantity: 1,
          schedule: { days: [1, 3], start: '08:00', end: '20:00' },
        },
        key(),
      )) as any;
      const drivenService = (await engine.addOffering(
        rental,
        {
          name: 'Rental with driver',
          model: 'ASSET_INTERVAL',
          durationMinutes: 1440,
          minDurationMinutes: 1440,
          maxDurationMinutes: 43200,
          resourceIds: [vehicle.id, driver.id],
          withDriver: true,
          priceMinor: 400000,
          currency: 'KES',
          intakeMode: 'instant_after_requirements',
          active: true,
          bookingEnabled: true,
          leadTimeMinutes: 0,
          horizonDays: 3650,
          paymentPolicyId: 'NO_PREPAYMENT_V1',
          changePolicyId: 'CHANGE_BEFORE_START_V1',
          policyVersion: 1,
        },
        key(),
      )) as any;
      await assert.rejects(
        () =>
          engine.createBooking(
            rental,
            {
              offeringId: drivenService.id,
              startTime: '2030-01-07T09:00:00+03:00',
              endTime: '2030-01-09T09:00:00+03:00',
              customer,
            },
            key(),
          ),
        (error: any) => error.code === 'outside_schedule',
      );
      let hire = (await engine.createBooking(
        rental,
        {
          offeringId: service.id,
          startTime: '2030-01-07T09:00:00+03:00',
          endTime: '2030-01-08T09:00:00+03:00',
          customer,
        },
        key(),
      )) as any;
      const priorNow = now;
      now = Date.parse('2030-01-07T09:00:00+03:00');
      hire = await engine.changeBooking(
        rental,
        hire.id,
        'check_out',
        { expectedVersion: hire.version },
        key(),
      );
      assert.equal(hire.custodyState, 'in_use');
      now = Date.parse('2030-01-09T09:00:00+03:00');
      await assert.rejects(
        () =>
          engine.changeBooking(
            rental,
            hire.id,
            'complete',
            { expectedVersion: hire.version, completionEvidence: 'Scheduled time ended.' },
            key(),
          ),
        (e: any) => e.code === 'custody_release_required',
      );
      await assert.rejects(
        () =>
          engine.createBooking(
            rental,
            {
              offeringId: service.id,
              startTime: '2030-01-10T09:00:00+03:00',
              endTime: '2030-01-11T09:00:00+03:00',
              customer,
            },
            key(),
          ),
        (e: any) => e.code === 'overdue_occupancy',
      );
      hire = await engine.changeBooking(
        rental,
        hire.id,
        'return',
        {
          expectedVersion: hire.version,
          completionEvidence: 'Car physically returned and inspected.',
        },
        key(),
      );
      assert.equal(hire.custodyState, 'released');
      assert.equal(hire.status, 'completed');
      now = priorNow;
    });
    await t.test(
      'published dated sessions enforce aggregate capacity and share one staff allocation',
      async () => {
        const classes = { ...owner, businessId: 'test-classes', userId: 'class-owner' };
        await engine.configure(classes, { subcategoryId: 'workshops' }, key());
        const pool = (await engine.addResource(
          classes,
          {
            name: 'Workshop places',
            kind: 'capacity_pool',
            quantity: 3,
            capacityUnit: 'place',
            quantityScale: 0,
            capacityMode: 'per-guest',
            schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
          },
          key(),
        )) as any;
        const teacher = (await engine.addResource(
          classes,
          {
            name: 'Teacher',
            kind: 'staff',
            quantity: 1,
            schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
          },
          key(),
        )) as any;
        const session = (await engine.addOffering(
          classes,
          {
            name: 'Workshop',
            model: 'SESSION_CAPACITY',
            durationMinutes: 60,
            resourceIds: [pool.id, teacher.id],
            capacity: 2,
            capacityUnit: 'place',
            priceMinor: 10000,
            currency: 'KES',
            intakeMode: 'instant_after_requirements',
            active: true,
            bookingEnabled: true,
            leadTimeMinutes: 0,
            horizonDays: 3650,
            paymentPolicyId: 'NO_PREPAYMENT_V1',
            changePolicyId: 'CHANGE_BEFORE_START_V1',
            policyVersion: 1,
          },
          key(),
        )) as any;
        assert.deepEqual((await engine.availability(classes, session.id, '2030-01-15')).slots, []);
        const input = {
          offeringId: session.id,
          startTime: '2030-01-15T09:00:00+03:00',
          endTime: '2030-01-15T10:00:00+03:00',
          customer,
        };
        await assert.rejects(
          () => engine.createBooking(classes, input, key()),
          (e: any) => e.code === 'published_occurrence_required',
        );
        const occurrence = await addOccurrence(
          engine,
          classes,
          session.id,
          {
            expectedVersion: 1,
            startTime: input.startTime,
            endTime: input.endTime,
            capacity: 2,
            published: true,
          },
          key(),
        );
        assert.equal(
          (await engine.availability(classes, session.id, '2030-01-15')).slots.length,
          1,
        );
        const a = (await engine.createBooking(
          classes,
          { ...input, occurrenceId: occurrence.id },
          key(),
        )) as any;
        const b = (await engine.createBooking(
          classes,
          { ...input, occurrenceId: occurrence.id },
          key(),
        )) as any;
        assert.equal(a.status, 'confirmed');
        assert.equal(b.status, 'confirmed');
        await assert.rejects(
          () => engine.createBooking(classes, { ...input, occurrenceId: occurrence.id }, key()),
          (e: any) => e.code === 'session_capacity',
        );
        assert.deepEqual((await engine.availability(classes, session.id, '2030-01-15')).slots, []);
        await engine.changeBooking(classes, a.id, 'cancel', { expectedVersion: a.version }, key());
        assert.equal(
          (await engine.availability(classes, session.id, '2030-01-15')).slots[0]
            ?.remainingCapacity,
          1,
        );
      },
    );
    await t.test('HTTP rejects forged signatures and customer workspace access', async () => {
      const secret = 'bridge-secret-for-test',
        server = createBookingServer(engine, secret);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const port = (server.address() as any).port,
          url = 'http://127.0.0.1:' + port;
        assert.equal((await fetch(url + '/v1/workspace')).status, 401);
        const context = Buffer.from(
          JSON.stringify({ ...owner, role: 'customer', expiresAt: Date.now() + 60000 }),
        ).toString('base64url');
        const signature = createHmac('sha256', secret).update(context).digest('hex');
        assert.equal(
          (
            await fetch(url + '/v1/workspace', {
              headers: { 'x-nexg-booking-context': context, 'x-nexg-booking-signature': signature },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await fetch(url + '/v1/workspace', {
              headers: {
                'x-nexg-booking-context': context,
                'x-nexg-booking-signature': '00'.repeat(32),
              },
            })
          ).status,
          401,
        );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
    await t.test('closures are actual unavailability and edits preserve commitments', async () => {
      await assert.rejects(
        () =>
          manageResource(engine, owner, resource.id, { expectedVersion: 1, quantity: 2 }, key()),
        (e: any) => e.code === 'resource_has_commitments',
      );
      await assert.rejects(
        () =>
          createClosure(
            engine,
            owner,
            resource.id,
            {
              expectedVersion: 1,
              startTime: '2030-01-02T09:00:00+03:00',
              endTime: '2030-01-02T10:00:00+03:00',
              reason: 'Conflicting closure',
            },
            key(),
          ),
        (e: any) => e.code === 'closure_conflict',
      );
      const closed = (await createClosure(
        engine,
        owner,
        resource.id,
        {
          expectedVersion: 1,
          startTime: '2030-01-12T08:00:00+03:00',
          endTime: '2030-01-12T20:00:00+03:00',
          reason: 'Planned maintenance',
        },
        key(),
      )) as any;
      assert.equal(closed.version, 2);
      await assert.rejects(
        () => create('2030-01-12T09:00:00+03:00'),
        (e: any) => e.code === 'outside_schedule',
      );
    });
    await t.test(
      'cached mutations still require current branch and private customer capability',
      async () => {
        const operationKey = key(),
          input = { offeringId: offering.id, startTime: '2030-01-13T09:00:00+03:00', customer };
        await engine.createBooking(owner, input, operationKey);
        await assert.rejects(
          () => engine.createBooking({ ...owner, branches: ['elsewhere'] }, input, operationKey),
          (e: any) => e.status === 403,
        );
        const guest = { ...owner, userId: 'public', role: 'customer' },
          publicResult = (await engine.createBooking(
            guest,
            { offeringId: offering.id, startTime: '2030-01-14T09:00:00+03:00', customer },
            key(),
            true,
          )) as any;
        const mutationKey = key(),
          cancelInput = { expectedVersion: publicResult.booking.version };
        await engine.changeBooking(
          guest,
          publicResult.booking.id,
          'cancel',
          cancelInput,
          mutationKey,
          publicResult.customerToken,
        );
        await assert.rejects(
          () =>
            engine.changeBooking(
              guest,
              publicResult.booking.id,
              'cancel',
              cancelInput,
              mutationKey,
              'wrong-token',
            ),
          (e: any) => e.status === 403,
        );
      },
    );
    await t.test(
      'accepted configuration stays private and survives later onboarding and authority changes',
      async () => {
        try {
          const merchant = {
            ...owner,
            businessId: 'test-accepted-configuration',
            userId: 'snapshot-owner',
          };
          await engine.configure(
            merchant,
            { subcategoryId: 'haircare', answers: { home_visits: false }, published: true },
            key(),
          );
          const stylist = (await engine.addResource(
            merchant,
            {
              name: 'Snapshot stylist',
              kind: 'staff',
              quantity: 1,
              schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
            },
            key(),
          )) as any;
          const service = (await engine.addOffering(
            merchant,
            {
              name: 'Accepted appointment',
              model: 'APPOINTMENT',
              durationMinutes: 60,
              resourceIds: [stylist.id],
              priceMinor: 100000,
              currency: 'KES',
              intakeMode: 'instant_after_requirements',
              active: true,
              bookingEnabled: true,
              leadTimeMinutes: 0,
              horizonDays: 3650,
              paymentPolicyId: 'NO_PREPAYMENT_V1',
              changePolicyId: 'CHANGE_BEFORE_START_V1',
              policyVersion: 1,
            },
            key(),
          )) as any;
          const guest = { ...merchant, role: 'customer', userId: 'snapshot-customer' };
          const created = (await engine.createBooking(
            guest,
            {
              offeringId: service.id,
              startTime: '2030-01-16T09:00:00+03:00',
              customer,
              hold: true,
            },
            key(),
            true,
          )) as any;
          assert.equal('acceptedConfiguration' in created.booking, false);
          const closedIntake = (await manageOffering(
            engine,
            merchant,
            service.id,
            { expectedVersion: service.version ?? 1, active: false, bookingEnabled: false },
            key(),
          )) as any;
          assert.equal(closedIntake.active, false);
          assert.equal(closedIntake.bookingEnabled, false);

          const originalRevision = created.booking.configurationRevision;
          const changed = await engine.configure(
            merchant,
            {
              subcategoryId: 'restaurant',
              published: false,
              canonicalAnswers: {
                Q_DATA_AUTHORITY: ['reservations', 'pricing'].map((data_class) => ({
                  data_class,
                  authority: 'EXTERNAL_AUTHORITATIVE',
                  owner_reference: 'merchant-existing-erp',
                  scope: { business_id: merchant.businessId },
                })),
              },
            },
            key(),
          );
          assert.notEqual(changed.revision, originalRevision);
          const quoteInput = { startTime: '2030-01-16T11:00:00+03:00', quantity: 1 };
          const currentQuote = await engine.quote(merchant, {
            offeringId: service.id,
            ...quoteInput,
          });
          assert.equal(currentQuote.sourceRequired, true);
          const acceptedQuote = await engine.quoteBooking(merchant, created.booking.id, quoteInput);
          assert.equal(acceptedQuote.binding, true);
          assert.equal(acceptedQuote.sourceRequired, false);
          assert.equal(acceptedQuote.totalMinor, 100000);
          assert.equal('acceptedConfiguration' in acceptedQuote, false);
          const customerQuote = await engine.quoteBooking(
            guest,
            created.booking.id,
            quoteInput,
            created.customerToken,
          );
          assert.equal(customerQuote.binding, true);
          await assert.rejects(
            () => engine.quoteBooking(guest, created.booking.id, quoteInput, 'wrong-token'),
            (error: any) => error.status === 403,
          );

          let accepted = await engine.changeBooking(
            merchant,
            created.booking.id,
            'confirm',
            { expectedVersion: created.booking.version },
            key(),
          );
          assert.equal(accepted.status, 'confirmed');
          accepted = await engine.changeBooking(
            merchant,
            accepted.id,
            'reschedule',
            { expectedVersion: accepted.version, startTime: '2030-01-16T11:00:00+03:00' },
            key(),
          );
          assert.equal(accepted.startTime, '2030-01-16T08:00:00.000Z');
          assert.equal(accepted.configurationRevision, originalRevision);
          assert.equal('acceptedConfiguration' in accepted, false);
          const publicView = await engine.customerBooking(
            guest,
            accepted.id,
            created.customerToken,
          );
          assert.equal('acceptedConfiguration' in publicView, false);
          const merchantView = (await engine.workspace(merchant)).bookings.find(
            (item) => item.id === accepted.id,
          )!;
          assert.equal('acceptedConfiguration' in merchantView, false);
          const req = { payload, context: { nexgBusinessId: merchant.businessId } } as any;
          const stored = await payload.find({
            collection: 'reservations',
            where: {
              and: [
                { businessId: { equals: merchant.businessId } },
                { publicId: { equals: accepted.id } },
              ],
            },
            overrideAccess: false,
            depth: 0,
            req,
          } as any);
          const snapshot = (stored.docs[0] as any).nexg.acceptedConfiguration;
          assert.equal(snapshot.subcategoryId, 'haircare');
          assert.equal(snapshot.answers.home_visits, false);
          assert.equal(snapshot.revision, originalRevision);
          await assert.rejects(
            () =>
              engine.createBooking(
                merchant,
                { offeringId: service.id, startTime: '2030-01-17T09:00:00+03:00', customer },
                key(),
              ),
            (error: any) => error.code === 'inactive_offering',
          );
          const requestOffering = (await engine.addOffering(
            merchant,
            {
              name: 'Externally priced request',
              model: 'ORDER',
              resourceIds: [],
              priceMinor: 100000,
              currency: 'KES',
              intakeMode: 'merchant_approval',
              active: true,
              paymentPolicyId: 'MANUAL_COLLECTION_V1',
              changePolicyId: 'CHANGE_BEFORE_START_V1',
              policyVersion: 1,
              reservationFee: {
                mode: 'fixed',
                amountMinor: 10000,
                treatment: 'credited_to_total',
                requiredBeforeConfirmation: false,
                refundTerms: 'Subject to authoritative price confirmation.',
              },
            },
            key(),
          )) as any;
          let request = (await engine.createBooking(
            merchant,
            { offeringId: requestOffering.id, customer },
            key(),
          )) as any;
          assert.equal(request.pricing.sourceRequired, true);
          request = await engine.changeBooking(
            merchant,
            request.id,
            'reschedule',
            { expectedVersion: request.version, startTime: '2030-01-18T09:00:00+03:00' },
            key(),
          );
          assert.equal(request.pricing.sourceRequired, true);
          assert.equal(request.pricing.indicative, true);
          await assert.rejects(
            () =>
              engine.changeBooking(
                merchant,
                request.id,
                'accept',
                { expectedVersion: request.version },
                key(),
              ),
            (error: any) => error.code === 'source_price_required',
          );
          await assert.rejects(
            () =>
              engine.changeBooking(
                merchant,
                request.id,
                'record_payment',
                {
                  expectedVersion: request.version,
                  amountMinor: 10000,
                  method: 'cash',
                  reference: 'Unconfirmed source receipt',
                  evidence: 'Must not record against unknown authoritative price.',
                },
                key(),
              ),
            (error: any) => error.code === 'source_price_required',
          );
        } catch (error: any) {
          console.error(
            'Accepted configuration regression:',
            error.code,
            error.message,
            JSON.stringify(error.data ?? {}),
          );
          throw error;
        }
      },
    );
    await t.test(
      'public HTTP responses keep private onboarding and operational setup confidential',
      async () => {
        const merchant = { ...owner, businessId: 'test-public-privacy', userId: 'privacy-owner' };
        const privateAnswers = 'PRIVATE_ONBOARDING_SENTINEL';
        const privateSetup = 'PRIVATE_OFFERING_SETUP_SENTINEL';
        const privateFee = 'PRIVATE_FEE_ROUTING_SENTINEL';
        const privateArea = 'PRIVATE_DISPATCH_NOTE_SENTINEL';
        const privateStaff = 'PRIVATE_BUNDLE_STAFF_SENTINEL';
        await engine.configure(
          merchant,
          {
            subcategoryId: 'haircare',
            published: true,
            canonicalAnswers: { Q_LICENSE_NUMBER: privateAnswers },
          },
          key(),
        );
        const staff = (await engine.addResource(
          merchant,
          {
            name: privateStaff,
            kind: 'staff',
            quantity: 1,
            schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
          },
          key(),
        )) as any;
        const input = {
          name: 'Public appointment',
          description: 'A publicly described service.',
          model: 'APPOINTMENT',
          durationMinutes: 60,
          resourceIds: [staff.id],
          priceMinor: 100000,
          currency: 'KES',
          intakeMode: 'instant_after_requirements',
          active: true,
          bookingEnabled: true,
          leadTimeMinutes: 0,
          paymentPolicyId: 'NO_PREPAYMENT_V1',
          changePolicyId: 'CHANGE_BEFORE_START_V1',
          policyVersion: 1,
          resourceSelectionMode: 'all_required',
          additionalSetup: { privateNotes: privateSetup },
          reservationFee: {
            mode: 'no_fee',
            treatment: 'credited_to_total',
            requiredBeforeConfirmation: false,
            refundTerms: 'No reservation fee.',
            privateReceiptRouting: privateFee,
          },
          serviceArea: { areas: ['Nairobi'], privateDispatchNote: privateArea },
        } as any;
        const service = (await engine.addOffering(merchant, input, key())) as any;
        const publicStaff = (await engine.addResource(
          merchant,
          {
            name: 'Public stylist choice',
            kind: 'staff',
            quantity: 1,
            schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
          },
          key(),
        )) as any;
        const choice = (await engine.addOffering(
          merchant,
          {
            ...input,
            name: 'Choose your stylist',
            resourceIds: [publicStaff.id],
            resourceSelectionMode: 'choose_one',
          },
          key(),
        )) as any;
        const merchantAvailability = await engine.availability(merchant, service.id, '2030-01-20');
        assert.ok('readiness' in merchantAvailability);
        assert.ok(JSON.stringify(merchantAvailability).includes(privateAnswers));
        assert.ok(JSON.stringify(await engine.workspace(merchant)).includes(privateSetup));
        const secret = 'privacy-http-secret-is-long-enough-123456789';
        const server = createBookingServer(engine, secret);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
          const address = server.address() as { port: number };
          const base = 'http://127.0.0.1:' + address.port + '/v1/public/' + merchant.businessId;
          const context = Buffer.from(
            JSON.stringify({
              ...merchant,
              userId: 'privacy-customer',
              role: 'customer',
              expiresAt: Date.now() + 60000,
            }),
          ).toString('base64url');
          const headers = {
            'x-nexg-booking-context': context,
            'x-nexg-booking-signature': createHmac('sha256', secret).update(context).digest('hex'),
          };
          const catalogueResponse = await fetch(base + '/catalog', { headers });
          assert.equal(catalogueResponse.status, 200);
          const catalogue = (await catalogueResponse.json()) as any;
          const availabilityResponse = await fetch(
            base + '/availability?offeringId=' + service.id + '&date=2030-01-20',
            { headers },
          );
          assert.equal(availabilityResponse.status, 200);
          const availability = (await availabilityResponse.json()) as any;
          assert.deepEqual(availability.slots, []);
          assert.equal(availability.setupRequired, true);
          const publicJson = JSON.stringify({ catalogue, availability });
          for (const privateValue of [
            privateAnswers,
            privateSetup,
            privateFee,
            privateArea,
            privateStaff,
            staff.id,
          ])
            assert.equal(
              publicJson.includes(privateValue),
              false,
              privateValue + ' must remain private',
            );
          for (const privateKey of [
            'readiness',
            'normalizedAnswers',
            'sourceAnswers',
            'canonicalAnswers',
            'additionalSetup',
            'privateReceiptRouting',
            'privateDispatchNote',
            'authority',
            'configurationRevision',
            'paymentPolicyId',
          ])
            assert.equal(
              publicJson.includes('"' + privateKey + '"'),
              false,
              privateKey + ' must remain private',
            );
          const publicOffering = catalogue.offerings.find((entry: any) => entry.id === service.id);
          assert.equal(publicOffering.active, true);
          assert.equal(publicOffering.model, 'APPOINTMENT');
          assert.equal(publicOffering.priceMinor, 100000);
          assert.equal(publicOffering.description, 'A publicly described service.');
          assert.deepEqual(publicOffering.eligibleResources, []);
          assert.equal('resourceIds' in publicOffering, false);
          assert.deepEqual(publicOffering.serviceArea, { areas: ['Nairobi'] });
          assert.deepEqual(publicOffering.reservationFee, {
            mode: 'no_fee',
            treatment: 'credited_to_total',
            requiredBeforeConfirmation: false,
            refundTerms: 'No reservation fee.',
          });
          assert.deepEqual(
            catalogue.offerings.find((entry: any) => entry.id === choice.id).eligibleResources,
            [{ id: publicStaff.id, name: 'Public stylist choice', kind: 'staff' }],
          );
        } finally {
          await new Promise<void>((resolve) => server.close(() => resolve()));
        }
      },
    );
    await t.test(
      'source-owned customer offerings capture an undated request without a native promise',
      async () => {
        const merchant = {
          ...owner,
          businessId: 'test-external-capture',
          userId: 'external-owner',
        };
        await engine.configure(
          merchant,
          {
            subcategoryId: 'haircare',
            published: true,
            canonicalAnswers: {
              Q_DATA_AUTHORITY: ['reservations', 'pricing'].map((data_class) => ({
                data_class,
                authority: 'EXTERNAL_AUTHORITATIVE',
                owner_reference: 'existing-merchant-system',
                scope: { business_id: merchant.businessId },
              })),
            },
          },
          key(),
        );
        const staff = (await engine.addResource(
          merchant,
          {
            name: 'Externally scheduled stylist',
            kind: 'staff',
            quantity: 1,
            schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
          },
          key(),
        )) as any;
        const service = (await engine.addOffering(
          merchant,
          {
            name: 'Source-confirmed service',
            model: 'APPOINTMENT',
            durationMinutes: 60,
            resourceIds: [staff.id],
            priceMinor: 100000,
            currency: 'KES',
            pricingBasis: 'per_duration',
            durationUnitMinutes: 60,
            intakeMode: 'instant_after_requirements',
            active: true,
            bookingEnabled: true,
            leadTimeMinutes: 0,
            horizonDays: 3650,
            paymentPolicyId: 'MANUAL_COLLECTION_V1',
            changePolicyId: 'CHANGE_BEFORE_START_V1',
            policyVersion: 1,
            reservationFee: {
              mode: 'fixed',
              amountMinor: 10000,
              treatment: 'credited_to_total',
              requiredBeforeConfirmation: true,
              refundTerms: 'Terms confirmed after the source approves scope.',
            },
          },
          key(),
        )) as any;
        const guest = { ...merchant, userId: 'external-customer', role: 'customer' };
        const catalogue = await engine.publicCatalog(guest);
        assert.equal(catalogue.offerings[0]!.executionMode, 'request_capture');
        const quote = await engine.quote(guest, { offeringId: service.id }, true);
        assert.equal(quote.binding, false);
        assert.equal(quote.sourceRequired, true);
        assert.equal(quote.indicative, true);
        assert.equal(quote.basis, 'indicative');
        assert.equal(quote.dueNowMinor, 0);
        assert.equal(quote.reservationFeeMinor, 0);
        const result = (await engine.createBooking(
          guest,
          { offeringId: service.id, customer, expectedTotalMinor: quote.totalMinor },
          key(),
          true,
        )) as any;
        assert.equal(result.booking.status, 'pending');
        assert.equal(result.booking.executionMode, 'request_capture');
        assert.equal(result.booking.startTime, null);
        assert.equal(result.booking.endTime, null);
        assert.equal(result.booking.pricing.indicative, true);
        assert.equal(result.booking.paymentState, 'not_required');
        assert.equal('acceptedConfiguration' in result.booking, false);
        const storedReservations = await payload.find({
          collection: 'reservations',
          where: { businessId: { equals: merchant.businessId } },
          overrideAccess: false,
          depth: 0,
          req: { payload, context: { nexgBusinessId: merchant.businessId } },
        } as any);
        assert.equal(storedReservations.docs.length, 0);
        await assert.rejects(
          () =>
            engine.changeBooking(
              merchant,
              result.booking.id,
              'confirm',
              { expectedVersion: result.booking.version },
              key(),
            ),
          (error: any) =>
            error.code === 'source_confirmation_required' ||
            error.code === 'source_price_required' ||
            error.code === 'execution_adapter_required',
        );
      },
    );
    await runSpecialistFixtures({
      t,
      engine,
      payload,
      owner,
      customer,
      key,
      clock: {
        now: () => now,
        set: (value: number) => {
          now = value;
        },
      },
    });
    await t.test('audit and durable outbox are committed with confirmed records', async () => {
      const req = { payload, context: { nexgBusinessId: owner.businessId } } as any;
      const events = await payload.find({
        collection: 'booking-outbox',
        overrideAccess: false,
        req,
        limit: 0,
      } as any);
      assert.ok(events.docs.length > 0);
      assert.ok(events.docs.every((d: any) => d.state === 'pending'));
      console.log('[native-lifecycle] closing primary database before restart');
      await payload.destroy();
      payloadClosed = true;
      globalThis.gc?.();
      await new Promise<void>((resolve) => setImmediate(resolve));
      const reopened = await createPayload({
        sqliteUrl,
        cacheKey: randomUUID(),
        secret: 'test-secret-is-long-and-not-production-123456789',
      });
      try {
        const persisted = new BookingEngine(reopened, true, () => now);
        assert.ok((await persisted.workspace(owner)).bookings.some((b) => b.id === booking.id));
      } finally {
        console.log('[native-lifecycle] closing restarted database');
        await reopened.destroy();
        globalThis.gc?.();
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    });
  } finally {
    if (!payloadClosed) await payload.destroy();
    // libsql native transaction handles are finalized by GC after COMMIT/ROLLBACK.
    globalThis.gc?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const resolvedDirectory = path.resolve(directory);
    assert.equal(path.dirname(resolvedDirectory), path.resolve(tmpdir()));
    assert.ok(path.basename(resolvedDirectory).startsWith('nexg-reserve-'));
    await rm(resolvedDirectory, {
      recursive: true,
      force: true,
      maxRetries: 1,
      retryDelay: 25,
    }).catch((error: any) => {
      if (error.code !== 'EBUSY') throw error;
    });
  }
});
