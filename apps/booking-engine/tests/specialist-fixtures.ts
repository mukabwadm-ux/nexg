import assert from 'node:assert/strict';
import type { BookingEngine } from '../src/engine.js';
import type { Identity } from '../src/types.js';
import { addOccurrence } from '../src/occurrences.js';

/** Run against the same real Payload/Reserve instance as the core integration
 * suite. Each scenario owns a separate business and real capacity records. */
export async function runSpecialistFixtures({
  t,
  engine,
  payload,
  owner,
  customer,
  key,
  clock,
}: {
  t: any;
  engine: BookingEngine;
  payload: any;
  owner: Identity;
  customer: any;
  key: () => string;
  clock: { now: () => number; set: (value: number) => void };
}) {
  const savedTime = clock.now();
  const initialTime = Date.parse('2030-01-01T00:00:00Z');
  const at = (value: string) => clock.set(Date.parse(value));
  const identity = async (name: string, subcategoryId: string) => {
    const merchant = {
      ...owner,
      businessId: `specialist-${name}`,
      userId: `owner-${name}`,
      branches: null,
    };
    await engine.configure(merchant, { subcategoryId, published: true }, key());
    return merchant;
  };
  const resource = async (
    merchant: Identity,
    name: string,
    kind = 'staff',
    quantity = 1,
    unit = 'place',
    scale = 0,
  ) =>
    engine.addResource(
      merchant,
      {
        name,
        kind,
        quantity,
        capacityUnit: unit,
        quantityScale: scale,
        ...(kind === 'capacity_pool' ? { capacityMode: 'per-guest' as const } : {}),
        schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
      },
      key(),
    ) as Promise<any>;
  const offering = async (
    merchant: Identity,
    model: any,
    resourceIds: string[],
    specialistSetup: any,
    extra: any = {},
  ) =>
    engine.addOffering(
      merchant,
      {
        name: `Native ${model}`,
        model,
        resourceIds,
        durationMinutes: 60,
        priceMinor: 100000,
        currency: 'KES',
        intakeMode: 'merchant_approval',
        active: true,
        bookingEnabled: true,
        leadTimeMinutes: 0,
        horizonDays: 3650,
        paymentPolicyId: 'NO_PREPAYMENT_V1',
        changePolicyId: 'CHANGE_BEFORE_START_V1',
        policyVersion: 1,
        specialistSetup,
        ...extra,
      } as any,
      key(),
    ) as Promise<any>;
  const create = (merchant: Identity, service: any, specialist: any, extra: any = {}) =>
    engine.createBooking(
      merchant,
      { offeringId: service.id, customer, specialist, ...extra } as any,
      key(),
    ) as Promise<any>;
  const step = (
    merchant: Identity,
    booking: any,
    command: string,
    extra: any = {},
    operationKey = key(),
  ) =>
    engine.changeBooking(
      merchant,
      booking.id,
      'workflow',
      { expectedVersion: booking.version, command, ...extra },
      operationKey,
    ) as Promise<any>;
  const approval = (priceMinor = 100000) => ({
    version: 1,
    acceptedBy: customer.email,
    acceptedAt: new Date(clock.now()).toISOString(),
    priceMinor,
  });
  const reservations = async (merchant: Identity) => {
    const rows = (
      await payload.find({
        collection: 'reservations',
        where: { businessId: { equals: merchant.businessId } },
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
    ).docs as any[];
    for (const row of rows) {
      if (row.nexg?.recordRole !== 'specialist_allocation') continue;
      assert.equal(
        Date.parse(row.startTime),
        Date.parse(row.nexg.startTime),
        'Reserve must persist the exact accepted role start.',
      );
      assert.equal(
        Date.parse(row.endTime),
        Date.parse(row.nexg.endTime),
        'Reserve must persist the exact accepted role end, including long work windows.',
      );
    }
    return rows;
  };
  const state = (booking: any) => booking.specialist?.state;
  try {
    await t.test(
      'private tour commits every real resource and preserves supplier evidence boundaries',
      async () => {
        clock.set(initialTime);
        const merchant = await identity('tour-private', 'city_tours');
        const guide = await resource(merchant, 'Actual guide');
        const vehicle = await resource(merchant, 'Actual tour vehicle', 'vehicle', 6);
        const setup = {
          model: 'TOUR',
          version: 1,
          mode: 'private',
          itinerary: 'Nairobi museum and city itinerary',
          itineraryVersion: 1,
          resourceIds: [guide.id, vehicle.id],
          minimumParticipants: 1,
          maximumParticipants: 6,
          supplierComponents: [
            {
              id: 'museum',
              description: 'Museum admission',
              evidenceKind: 'authorized_manual_reference',
            },
          ],
        };
        const service = await offering(merchant, 'TOUR', [guide.id, vehicle.id], setup);
        const input = {
          model: 'TOUR',
          itineraryVersion: 1,
          startTime: '2030-01-02T09:00:00+03:00',
          endTime: '2030-01-02T12:00:00+03:00',
        };
        const customerIdentity = { ...merchant, role: 'customer', userId: 'tour-private-guest' };
        const publicResult = (await engine.createBooking(
          customerIdentity,
          { offeringId: service.id, specialist: input, quantity: 2, customer } as any,
          key(),
          true,
        )) as any;
        await assert.rejects(() =>
          engine.changeBooking(
            customerIdentity,
            publicResult.booking.id,
            'workflow',
            {
              expectedVersion: publicResult.booking.version,
              command: 'AcceptTourScope',
              approval: approval(),
            },
            key(),
            'wrong-customer-token',
          ),
        );
        const acceptedPublic = (await engine.changeBooking(
          customerIdentity,
          publicResult.booking.id,
          'workflow',
          {
            expectedVersion: publicResult.booking.version,
            command: 'AcceptTourScope',
            approval: approval(),
          },
          key(),
          publicResult.customerToken,
        )) as any;
        await assert.rejects(() =>
          engine.changeBooking(
            customerIdentity,
            publicResult.booking.id,
            'workflow',
            {
              expectedVersion: acceptedPublic.version,
              command: 'ConfirmTour',
              supplierConfirmations: [
                {
                  componentId: 'museum',
                  reference: 'CUSTOMER-CANNOT-COMMIT',
                  verification: 'merchant_asserted',
                },
              ],
            },
            key(),
            publicResult.customerToken,
          ),
        );
        let first = await create(merchant, service, input, { quantity: 4 });
        assert.equal(state(first), 'ITINERARY_REVIEW');
        assert.equal((await reservations(merchant)).length, 0);
        first = await step(merchant, first, 'AcceptTourScope', { approval: approval() });
        await assert.rejects(() =>
          step(merchant, first, 'ConfirmTour', {
            supplierConfirmations: [
              {
                componentId: 'museum',
                reference: 'FAKE-PROVIDER',
                verification: 'provider_verified',
              },
            ],
          }),
        );
        assert.equal((await reservations(merchant)).length, 0);
        await assert.rejects(() => step(merchant, first, 'ConfirmTour'));
        first = await step(merchant, first, 'ConfirmTour', {
          supplierConfirmations: [
            {
              componentId: 'museum',
              reference: 'LOCAL-MUSEUM-ACCEPTANCE',
              verification: 'merchant_asserted',
            },
          ],
        });
        assert.equal(state(first), 'READY_TO_DEPART');
        assert.ok((await reservations(merchant)).some((row) => row.status === 'confirmed'));
        let conflicting = await create(merchant, service, input, { quantity: 2 });
        conflicting = await step(merchant, conflicting, 'AcceptTourScope', {
          approval: approval(),
        });
        const count = (await reservations(merchant)).length;
        await assert.rejects(() =>
          step(merchant, conflicting, 'ConfirmTour', {
            supplierConfirmations: [
              {
                componentId: 'museum',
                reference: 'OTHER-LOCAL-REFERENCE',
                verification: 'merchant_asserted',
              },
            ],
          }),
        );
        assert.equal(
          (await reservations(merchant)).length,
          count,
          'Failed tour must not leave partial guide/vehicle claims.',
        );
        at('2030-01-02T09:00:00+03:00');
        first = await step(merchant, first, 'StartTour', {
          evidence: 'Guide recorded the group departure.',
        });
        await assert.rejects(() =>
          step(merchant, first, 'RequestSpecialistCancellation', {
            evidence: 'Do not erase started work.',
          }),
        );
        at('2030-01-02T12:00:00+03:00');
        first = await step(merchant, first, 'SubmitTourCompletion', {
          evidence: 'Guide submitted visit completion evidence.',
        });
        first = await step(merchant, first, 'CompleteTour', {
          evidence: 'Merchant reviewed completion.',
        });
        assert.equal(state(first), 'COMPLETED');
      },
    );

    await t.test(
      'shared tour consumes dated departure places while sharing one guide anchor',
      async () => {
        clock.set(initialTime);
        const merchant = await identity('tour-shared', 'city_tours');
        const guide = await resource(merchant, 'Shared departure guide');
        const pool = await resource(
          merchant,
          'Actual dated departure places',
          'capacity_pool',
          3,
          'place',
        );
        const setup = {
          model: 'TOUR',
          version: 1,
          supplierComponents: [],
          mode: 'shared',
          itinerary: 'Published shared Nairobi city departure',
          itineraryVersion: 1,
          resourceIds: [guide.id],
          poolResourceId: pool.id,
          minimumParticipants: 1,
          maximumParticipants: 3,
        };
        const service = await offering(merchant, 'TOUR', [guide.id, pool.id], setup, {
          durationMinutes: 120,
          capacity: 3,
        });
        const occurrence = (await addOccurrence(
          engine,
          merchant,
          service.id,
          {
            expectedVersion: service.version,
            startTime: '2030-01-02T14:00:00+03:00',
            endTime: '2030-01-02T16:00:00+03:00',
            capacity: 3,
            published: true,
          },
          key(),
        )) as any;
        const input = { model: 'TOUR', occurrenceId: occurrence.id, itineraryVersion: 1 };
        let group = await create(merchant, service, input, { quantity: 2 });
        group = await step(merchant, group, 'AcceptTourScope', { approval: approval() });
        group = await step(merchant, group, 'ConfirmTour');
        assert.equal(state(group), 'READY_TO_DEPART');
        const requests = await Promise.all([
          create(merchant, service, input),
          create(merchant, service, input),
        ]);
        const approved = [];
        for (const booking of requests)
          approved.push(await step(merchant, booking, 'AcceptTourScope', { approval: approval() }));
        const attempts = await Promise.allSettled(
          approved.map((booking) => step(merchant, booking, 'ConfirmTour')),
        );
        assert.equal(
          attempts.filter((result) => result.status === 'fulfilled').length,
          1,
          'The last published departure place has one winner.',
        );
        const rows = await reservations(merchant);
        assert.equal(
          rows.filter(
            (row) => row.nexg?.recordRole === 'session_allocation' && row.status === 'confirmed',
          ).length,
          1,
          'One departure shares one actual guide commitment.',
        );
        const publicCatalogue = await engine.publicCatalog({
          ...merchant,
          role: 'customer',
          userId: 'tour-customer',
        });
        const publicOffering = publicCatalogue.offerings.find(
          (entry: any) => entry.id === service.id,
        );
        assert.ok(publicOffering);
        assert.equal(
          JSON.stringify(publicOffering).includes(guide.id),
          false,
          'The public descriptor must not expose internal guide resource bindings.',
        );
      },
    );

    await t.test(
      'firm collection-processing-return claims all legs atomically and releases only with actual return',
      async () => {
        clock.set(initialTime);
        const merchant = await identity('linked-firm', 'laundry');
        const van = await resource(merchant, 'Collection and return van', 'vehicle');
        const processing = await resource(
          merchant,
          'Laundry kg workload',
          'capacity_pool',
          10,
          'kg',
        );
        const setup = {
          model: 'LINKED_WINDOWS',
          version: 1,
          supplierComponents: [],
          promiseMode: 'FIRM_PRE_ACCEPTED',
          incomingMethod: 'MERCHANT_COLLECTION',
          outgoingMethod: 'MERCHANT_RETURN',
          incomingResourceIds: [van.id],
          outgoingResourceIds: [van.id],
          processingResourceId: processing.id,
          processingUnit: 'kg',
          quantityScale: 0,
          minimumProcessingMinutes: 60,
          maximumProcessingMinutes: 240,
          calendarBasis: 'elapsed',
          workingDays: [0, 1, 2, 3, 4, 5, 6],
          opens: '08:00',
          closes: '20:00',
        };
        const service = await offering(merchant, 'LINKED_WINDOWS', [van.id, processing.id], setup);
        const input = {
          model: 'LINKED_WINDOWS',
          incoming: {
            startTime: '2030-01-02T08:00:00+03:00',
            endTime: '2030-01-02T09:00:00+03:00',
          },
          processing: {
            startTime: '2030-01-02T09:00:00+03:00',
            endTime: '2030-01-02T12:00:00+03:00',
          },
          outgoing: {
            startTime: '2030-01-02T12:00:00+03:00',
            endTime: '2030-01-02T13:00:00+03:00',
          },
          workload: { quantityMinor: 6, unit: 'kg', scale: 0 },
        };
        let booking = await create(merchant, service, input);
        booking = await step(merchant, booking, 'AcceptLinkedScope', { approval: approval() });
        booking = await step(merchant, booking, 'ConfirmCollectionLeg');
        assert.equal(state(booking), 'COLLECTION_CONFIRMED');
        assert.equal(
          (await reservations(merchant)).filter((row) => row.status === 'confirmed').length,
          3,
        );
        let other = await create(merchant, service, input);
        other = await step(merchant, other, 'AcceptLinkedScope', { approval: approval() });
        const before = (await reservations(merchant)).length;
        await assert.rejects(() => step(merchant, other, 'ConfirmCollectionLeg'));
        assert.equal(
          (await reservations(merchant)).length,
          before,
          'Conflicting last role must roll back every new child claim.',
        );
        at('2030-01-02T08:00:00+03:00');
        booking = await step(merchant, booking, 'ConfirmGoodsCollected', {
          evidence: 'Driver recorded actual collection of the customer goods.',
        });
        at('2030-01-02T09:00:00+03:00');
        booking = await step(merchant, booking, 'ReceiveForProcessing', {
          evidence: 'Six kg of customer goods received.',
        });
        await assert.rejects(() =>
          step(merchant, booking, 'RequestSpecialistCancellation', {
            evidence: 'Goods are still held.',
          }),
        );
        booking = await step(merchant, booking, 'ApproveProcessingPrice', { approval: approval() });
        booking = await step(merchant, booking, 'StartProcessing', {
          evidence: 'Processing team started work.',
        });
        at('2030-01-02T12:00:00+03:00');
        booking = await step(merchant, booking, 'FinishProcessing', {
          evidence: 'Processing and quality checks completed.',
        });
        booking = await step(merchant, booking, 'ConfirmReturnLeg', {
          evidence: 'Driver accepted the scheduled return.',
        });
        at('2030-01-02T13:00:00+03:00');
        booking = await step(merchant, booking, 'CompleteReturn', {
          evidence: 'Customer acknowledged actual return of goods.',
        });
        assert.equal(state(booking), 'COMPLETED');
        assert.equal(
          (await reservations(merchant)).filter((row) => ['held', 'confirmed'].includes(row.status))
            .length,
          0,
        );
      },
    );

    await t.test(
      'assessment collection leaves return uncommitted until workload and exact price approval',
      async () => {
        clock.set(initialTime);
        const merchant = await identity('linked-assessment', 'dry_cleaning');
        const van = await resource(merchant, 'Incoming van', 'vehicle');
        const pool = await resource(merchant, 'Assessed item pool', 'capacity_pool', 10, 'item');
        const setup = {
          model: 'LINKED_WINDOWS',
          version: 1,
          supplierComponents: [],
          promiseMode: 'ASSESSMENT_REQUIRED',
          incomingMethod: 'MERCHANT_COLLECTION',
          outgoingMethod: 'CUSTOMER_COLLECTION',
          incomingResourceIds: [van.id],
          outgoingResourceIds: [],
          processingResourceId: pool.id,
          processingUnit: 'item',
          quantityScale: 0,
          minimumProcessingMinutes: 60,
          maximumProcessingMinutes: 240,
          calendarBasis: 'elapsed',
          workingDays: [0, 1, 2, 3, 4, 5, 6],
          opens: '08:00',
          closes: '20:00',
        };
        const service = await offering(merchant, 'LINKED_WINDOWS', [van.id, pool.id], setup);
        let booking = await create(merchant, service, {
          model: 'LINKED_WINDOWS',
          incoming: {
            startTime: '2030-01-03T08:00:00+03:00',
            endTime: '2030-01-03T09:00:00+03:00',
          },
        });
        booking = await step(merchant, booking, 'ConfirmCollectionLeg');
        assert.equal(
          (await reservations(merchant)).filter((row) => row.status === 'confirmed').length,
          1,
        );
        assert.equal(booking.specialist.details.outgoing, undefined);
        at('2030-01-03T08:00:00+03:00');
        booking = await step(merchant, booking, 'ConfirmGoodsCollected', {
          evidence: 'Driver recorded actual collection for assessment.',
        });
        at('2030-01-03T09:00:00+03:00');
        booking = await step(merchant, booking, 'ReceiveForProcessing', {
          evidence: 'Items received for inspection.',
        });
        assert.equal(state(booking), 'ASSESSMENT_PENDING');
        await assert.rejects(() =>
          step(merchant, booking, 'StartProcessing', {
            evidence: 'Cannot start without assessment approval.',
          }),
        );
        booking = await step(merchant, booking, 'ApproveProcessingPrice', {
          approval: approval(),
          processing: {
            startTime: '2030-01-03T09:00:00+03:00',
            endTime: '2030-01-03T11:00:00+03:00',
          },
          outgoing: {
            startTime: '2030-01-03T11:00:00+03:00',
            endTime: '2030-01-03T12:00:00+03:00',
          },
          workload: { quantityMinor: 3, unit: 'item', scale: 0 },
        });
        assert.equal(state(booking), 'PRICE_APPROVED');
        const claims = await reservations(merchant);
        assert.equal(
          claims.length,
          2,
          'Incoming history and the assessed processing claim both persist.',
        );
        assert.equal(
          claims.filter((row) => row.status === 'confirmed').length,
          1,
          'Only processing remains live; customer collection does not invent a return vehicle claim.',
        );
      },
    );

    await t.test(
      'custom production commits measured workload and due promise with approval and quality stages',
      async () => {
        clock.set(initialTime);
        const merchant = await identity('production', 'cakes');
        const pool = await resource(
          merchant,
          'Cake production workload',
          'capacity_pool',
          5,
          'job',
        );
        const setup = {
          model: 'PRODUCTION_DUE',
          version: 1,
          supplierComponents: [],
          capacityPoolId: pool.id,
          capacityUnit: 'job',
          quantityScale: 0,
          preparationLeadMinutes: 120,
          cutoffLocalTime: '18:00',
          workingDays: [0, 1, 2, 3, 4, 5, 6],
          approvalMode: 'required',
          handoffResourceIds: [],
        };
        const service = await offering(merchant, 'PRODUCTION_DUE', [pool.id], setup);
        const input = {
          model: 'PRODUCTION_DUE',
          specification: 'Accepted four decorated cakes, exact flavour and sizes.',
          specificationVersion: 1,
          productionStartTime: '2030-01-04T08:00:00+03:00',
          dueTime: '2030-01-04T17:00:00+03:00',
          workload: { quantityMinor: 4, unit: 'job', scale: 0 },
        };
        await assert.rejects(() =>
          create(merchant, service, { ...input, dueTime: '2030-01-04T19:00:00+03:00' }),
        );
        let booking = await create(merchant, service, input);
        await assert.rejects(() => step(merchant, booking, 'CommitProduction'));
        booking = await step(merchant, booking, 'IssueSpecialistQuote', {
          scopeVersion: 1,
          serviceSubtotalMinor: 175000,
          evidence: 'Merchant priced the exact accepted four-cake specification.',
        });
        assert.equal(booking.pricing.totalMinor, 175000);
        await assert.rejects(() =>
          step(merchant, booking, 'AcceptProductionScope', { approval: approval() }),
        );
        booking = await step(merchant, booking, 'AcceptProductionScope', {
          approval: approval(175000),
        });
        booking = await step(merchant, booking, 'CommitProduction');
        assert.equal(state(booking), 'PRODUCTION_COMMITTED');
        await assert.rejects(() =>
          step(merchant, booking, 'IssueSpecialistQuote', {
            scopeVersion: 1,
            serviceSubtotalMinor: 200000,
            evidence: 'Cannot silently reprice committed production.',
          }),
        );
        let excess = await create(merchant, service, {
          ...input,
          workload: { quantityMinor: 2, unit: 'job', scale: 0 },
        });
        excess = await step(merchant, excess, 'AcceptProductionScope', { approval: approval() });
        await assert.rejects(() => step(merchant, excess, 'CommitProduction'));
        at('2030-01-04T08:00:00+03:00');
        booking = await step(merchant, booking, 'StartProduction', {
          evidence: 'Production team started the accepted specification.',
        });
        booking = await step(merchant, booking, 'SubmitProductionResult', {
          evidence: 'Finished cakes submitted for quality review.',
        });
        booking = await step(merchant, booking, 'ReturnProductionForCorrection', {
          evidence: 'Correct the inscription before handover.',
        });
        booking = await step(merchant, booking, 'SubmitProductionResult', {
          evidence: 'Corrected inscription submitted.',
        });
        booking = await step(merchant, booking, 'ApproveProductionResult', {
          evidence: 'Quality reviewer approved the accepted specification.',
        });
        at('2030-01-04T17:00:00+03:00');
        booking = await step(merchant, booking, 'CompleteProductionHandover', {
          evidence: 'Customer received and acknowledged four cakes.',
        });
        assert.equal(state(booking), 'COMPLETED');
      },
    );

    await t.test(
      'membership validity and credit redemption stay atomic with the actual child booking',
      async () => {
        clock.set(initialTime);
        const merchant = await identity('membership', 'gym');
        await engine.configure(
          merchant,
          {
            subcategoryId: 'gym',
            published: true,
            canonicalAnswers: { Q_PERSONAL_TRAINING_AVAILABLE: true },
          },
          key(),
        );
        const trainer = await resource(merchant, 'Actual member trainer');
        const session = await offering(merchant, 'APPOINTMENT', [trainer.id], undefined, {
          name: 'Member trainer session',
          intakeMode: 'instant_after_requirements',
        });
        const setup = {
          model: 'ENTITLEMENT',
          version: 1,
          supplierComponents: [],
          planId: 'GYM-JAN-2030',
          planVersion: 1,
          scopeOfferingIds: [session.id],
          validity: { mode: 'absolute_dates', starts: '2030-01-01', ends: '2030-02-01' },
          credits: [
            {
              id: 'training',
              quantityMinor: 2,
              unit: 'visit',
              scale: 0,
              offeringIds: [session.id],
            },
          ],
          creditCancellation: 'restore_before_start',
          renewal: 'none',
        };
        const service = await offering(merchant, 'ENTITLEMENT', [], setup);
        const memberIdentity = { ...merchant, role: 'customer', userId: 'actual-member-guest' };
        const createdMembership = (await engine.createBooking(
          memberIdentity,
          {
            offeringId: service.id,
            customer,
            specialist: { model: 'ENTITLEMENT' },
          } as any,
          key(),
          true,
        )) as any;
        let membership = createdMembership.booking;
        membership = await step(merchant, membership, 'ActivateMembership', {
          approval: approval(),
        });
        assert.equal(state(membership), 'ACTIVE');
        assert.equal(
          (await reservations(merchant)).length,
          0,
          'Plan activation cannot reserve trainer capacity.',
        );
        const sessionBody = {
          offeringId: session.id,
          customer,
          startTime: '2030-01-06T09:00:00+03:00',
        };
        await engine.createBooking(merchant, sessionBody, key());
        const redeem = (
          booking: any,
          time: string,
          occurrenceKey: string,
          operationKey = key(),
          token = createdMembership.customerToken,
        ) =>
          engine.changeBooking(
            memberIdentity,
            booking.id,
            'workflow',
            {
              expectedVersion: booking.version,
              command: 'RedeemEntitlement',
              creditId: 'training',
              quantityMinor: 1,
              unit: 'visit',
              scale: 0,
              offeringId: session.id,
              occurrenceKey,
              booking: { startTime: time, customer, resourceIds: [trainer.id] },
            },
            operationKey,
            token,
          ) as Promise<any>;
        await assert.rejects(() =>
          redeem(
            membership,
            '2030-01-06T10:00:00+03:00',
            'wrong-private-capability',
            key(),
            'wrong-token',
          ),
        );
        await assert.rejects(() => redeem(membership, '2030-01-06T09:00:00+03:00', 'busy-session'));
        for (const bookingOverride of [
          { quantity: 2 },
          { allocations: [{ resourceId: trainer.id, quantityMinor: 2, unit: 'visit', scale: 0 }] },
        ]) {
          await assert.rejects(() =>
            engine.changeBooking(
              memberIdentity,
              membership.id,
              'workflow',
              {
                expectedVersion: membership.version,
                command: 'RedeemEntitlement',
                creditId: 'training',
                quantityMinor: 1,
                unit: 'visit',
                scale: 0,
                offeringId: session.id,
                occurrenceKey: key(),
                booking: {
                  startTime: '2030-01-06T10:00:00+03:00',
                  resourceIds: [trainer.id],
                  ...bookingOverride,
                },
              },
              key(),
              createdMembership.customerToken,
            ),
          );
        }
        membership = (await engine.workspace(merchant)).bookings.find(
          (entry: any) => entry.id === membership.id,
        );
        assert.equal(
          membership.specialist.details.credits[0].quantityMinor,
          2,
          'Failed booking must roll back credit use.',
        );
        membership = await redeem(membership, '2030-01-06T10:00:00+03:00', 'actual-session-10');
        assert.equal(membership.specialist.details.credits[0].quantityMinor, 1);
        assert.equal(
          (await reservations(merchant)).filter((row) => row.status === 'confirmed').length,
          2,
        );
        const initialRedeemedId = membership.specialist.redemptions[0].id;
        const initialRedeemedRow = (await reservations(merchant)).find(
          (row) => row.publicId === initialRedeemedId,
        );
        assert.ok(initialRedeemedRow);
        const outsidePlan = {
          startTime: '2030-02-02T10:00:00+03:00',
          endTime: '2030-02-02T11:00:00+03:00',
        };
        await assert.rejects(() =>
          engine.quoteBooking(
            memberIdentity,
            initialRedeemedId,
            outsidePlan,
            createdMembership.customerToken,
          ),
        );
        await assert.rejects(() =>
          engine.changeBooking(
            memberIdentity,
            initialRedeemedId,
            'reschedule',
            { expectedVersion: initialRedeemedRow.nexg.version, ...outsidePlan },
            key(),
            createdMembership.customerToken,
          ),
        );
        const movedWindow = {
          startTime: '2030-01-06T10:15:00+03:00',
          endTime: '2030-01-06T11:15:00+03:00',
        };
        const coveredQuote = await engine.quoteBooking(
          memberIdentity,
          initialRedeemedId,
          movedWindow,
          createdMembership.customerToken,
        );
        assert.equal(coveredQuote.totalMinor, 0);
        const movedChild = (await engine.changeBooking(
          memberIdentity,
          initialRedeemedId,
          'reschedule',
          {
            expectedVersion: initialRedeemedRow.nexg.version,
            expectedTotalMinor: 0,
            ...movedWindow,
          },
          key(),
          createdMembership.customerToken,
        )) as any;
        assert.equal(movedChild.priceMinor, 0);
        membership = (await engine.workspace(merchant)).bookings.find(
          (entry: any) => entry.id === membership.id,
        );
        assert.equal(
          membership.specialist.details.credits[0].quantityMinor,
          1,
          'Moving a covered booking must not debit a second credit.',
        );
        assert.equal(
          Date.parse(membership.specialist.redemptions[0].startTime),
          Date.parse(movedWindow.startTime),
        );
        await assert.rejects(() =>
          redeem(membership, '2030-01-06T10:15:00+03:00', 'renamed-same-session'),
        );
        const redeemedId = membership.specialist.redemptions[0].id;
        const redeemedRow = (await reservations(merchant)).find(
          (row) => row.publicId === redeemedId,
        );
        assert.ok(redeemedRow);
        await engine.changeBooking(
          merchant,
          redeemedId,
          'cancel',
          { expectedVersion: redeemedRow.nexg.version },
          key(),
        );
        membership = await step(merchant, membership, 'RestoreEntitlementCredit', {
          cancelledBooking: { bookingId: redeemedId },
          evidence:
            'The actual session was cancelled before it started under the accepted restoration policy.',
        });
        assert.equal(membership.specialist.details.credits[0].quantityMinor, 2);
        await assert.rejects(() =>
          step(merchant, membership, 'RestoreEntitlementCredit', {
            cancelledBooking: { bookingId: redeemedId },
            evidence: 'The same cancellation cannot credit the plan twice.',
          }),
        );
        membership = await redeem(
          membership,
          '2030-01-06T11:00:00+03:00',
          'replacement-session-11',
        );
        membership = await step(merchant, membership, 'PauseMembership', {
          evidence: 'Owner paused access at member request.',
        });
        await assert.rejects(() =>
          redeem(membership, '2030-01-06T12:00:00+03:00', 'paused-session'),
        );
        membership = await step(merchant, membership, 'ResumeMembership', {
          evidence: 'Owner resumed access under unchanged validity.',
        });
        const concurrent = await Promise.allSettled([
          redeem(membership, '2030-01-06T12:00:00+03:00', 'actual-session-12'),
          redeem(membership, '2030-01-06T13:00:00+03:00', 'actual-session-13'),
        ]);
        assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
        membership = (await engine.workspace(merchant)).bookings.find(
          (entry: any) => entry.id === membership.id,
        );
        assert.equal(membership.specialist.details.credits[0].quantityMinor, 0);
        await assert.rejects(() =>
          redeem(membership, '2030-01-06T14:00:00+03:00', 'exhausted-session'),
        );
        await assert.rejects(() => step(merchant, membership, 'ExpireMembership'));
        at('2030-02-01T00:00:00+03:00');
        membership = await step(merchant, membership, 'ExpireMembership');
        assert.equal(state(membership), 'EXPIRED');
      },
    );

    await t.test(
      'freight checks every measured cargo dimension and requires actual custody milestones',
      async () => {
        clock.set(initialTime);
        const merchant = await identity('freight', 'road_freight');
        const vehicle = await resource(merchant, 'Actual local truck', 'vehicle');
        const mass = await resource(merchant, 'Truck kg capacity', 'capacity_pool', 1000, 'kg');
        const volume = await resource(
          merchant,
          'Truck cbm capacity',
          'capacity_pool',
          5000,
          'cbm',
          3,
        );
        const setup = {
          model: 'FREIGHT',
          version: 1,
          supplierComponents: [],
          legs: [
            {
              id: 'nairobi-nakuru',
              origin: 'Nairobi',
              destination: 'Nakuru',
              resourceIds: [vehicle.id],
              dimensions: [
                { resourceId: mass.id, unit: 'kg', scale: 0 },
                { resourceId: volume.id, unit: 'cbm', scale: 3 },
              ],
            },
          ],
          requiresDocuments: true,
          requiresClearance: false,
          finalMode: 'delivery',
        };
        const service = await offering(
          merchant,
          'FREIGHT',
          [vehicle.id, mass.id, volume.id],
          setup,
        );
        const input = {
          model: 'FREIGHT',
          cargoDescription: 'Six sealed cartons',
          pieces: 6,
          cargo: [
            { quantityMinor: 600, unit: 'kg', scale: 0 },
            { quantityMinor: 2000, unit: 'cbm', scale: 3 },
          ],
          legs: [
            {
              id: 'nairobi-nakuru',
              startTime: '2030-01-07T08:00:00+03:00',
              endTime: '2030-01-07T12:00:00+03:00',
            },
          ],
        };
        for (const cargo of [
          [
            { quantityMinor: 1100, unit: 'kg', scale: 0 },
            { quantityMinor: 2000, unit: 'cbm', scale: 3 },
          ],
          [
            { quantityMinor: 600, unit: 'kg', scale: 0 },
            { quantityMinor: 6000, unit: 'cbm', scale: 3 },
          ],
        ]) {
          let excess = await create(merchant, service, { ...input, cargo });
          excess = await step(merchant, excess, 'AcceptFreightQuote', { approval: approval() });
          await assert.rejects(() => step(merchant, excess, 'ConfirmFreightBooking'));
          assert.equal(
            (await reservations(merchant)).length,
            0,
            'No partial vehicle or other dimension allocation may survive.',
          );
        }
        let booking = await create(merchant, service, input);
        booking = await step(merchant, booking, 'AcceptFreightQuote', { approval: approval() });
        booking = await step(merchant, booking, 'ConfirmFreightBooking');
        assert.equal(state(booking), 'BOOKED');
        await assert.rejects(() =>
          step(merchant, booking, 'ConfirmFreightCollection', {
            evidence: 'Documents are still pending.',
          }),
        );
        booking = await step(merchant, booking, 'ClearFreightDocuments', {
          evidence: 'Owner checked the shipment documents.',
        });
        at('2030-01-07T08:00:00+03:00');
        booking = await step(merchant, booking, 'ConfirmFreightCollection', {
          evidence: 'Driver took actual custody of six sealed cartons.',
        });
        await assert.rejects(() =>
          step(merchant, booking, 'RequestSpecialistCancellation', {
            evidence: 'Cannot erase cargo custody.',
          }),
        );
        booking = await step(merchant, booking, 'ConfirmFreightDeparture', {
          evidence: 'Truck departure recorded.',
        });
        at('2030-01-07T12:00:00+03:00');
        booking = await step(merchant, booking, 'ConfirmFreightDestinationArrival', {
          evidence: 'Actual destination arrival recorded.',
        });
        await assert.rejects(() =>
          step(merchant, booking, 'ConfirmConsigneeCollection', {
            evidence: 'Wrong contracted final mode.',
          }),
        );
        booking = await step(merchant, booking, 'ConfirmFreightDelivery', {
          evidence: 'Named receiver acknowledged actual delivery.',
        });
        booking = await step(merchant, booking, 'CloseFreight', {
          evidence: 'Merchant reviewed delivery evidence and closed the shipment.',
        });
        assert.equal(state(booking), 'CLOSED');
      },
    );
    await t.test(
      'scheduled workshop work reserves the bay and team independently of its completion promise',
      async () => {
        clock.set(initialTime);
        const merchant = await identity('scheduled-wash', 'car_wash');
        const bay = await resource(merchant, 'Actual wash bay', 'space');
        const team = await resource(merchant, 'Actual wash team');
        const setup = {
          model: 'SERVICE_JOB',
          version: 1,
          supplierComponents: [],
          jobSchedulingMode: 'scheduled_work',
          assessmentMode: 'fixed_scope',
          resourceIds: [bay.id, team.id],
          durationMinutes: 30,
          partsRequired: false,
          partsEvidenceKind: 'authorized_manual_reference',
          custodyMode: 'customer_retains',
          custodyResourceIds: [],
          custodyDurationMinutes: 1440,
        };
        const service = await offering(merchant, 'SERVICE_JOB', [bay.id, team.id], setup);
        const input = {
          model: 'SERVICE_JOB',
          jobDescription: 'Accepted exterior and interior wash.',
          requestedInterval: {
            startTime: '2030-01-08T09:00:00+03:00',
            endTime: '2030-01-08T09:30:00+03:00',
          },
          completionPromise: '2030-01-08T18:00:00+03:00',
        };
        let booking = await create(merchant, service, input);
        booking = await step(merchant, booking, 'AcceptFixedScopeServiceJob', {
          approval: approval(),
        });
        booking = await step(merchant, booking, 'ConfirmServiceWorkSlot');
        const claims = (await reservations(merchant)).filter((row) => row.status === 'confirmed');
        assert.ok(claims.length > 0);
        assert.ok(
          claims.every((row) => Date.parse(row.endTime) - Date.parse(row.startTime) === 30 * 60000),
          'The completion promise cannot stretch the reserved work slot.',
        );
        let conflict = await create(merchant, service, input);
        conflict = await step(merchant, conflict, 'AcceptFixedScopeServiceJob', {
          approval: approval(),
        });
        await assert.rejects(() => step(merchant, conflict, 'ConfirmServiceWorkSlot'));
        at('2030-01-08T09:00:00+03:00');
        booking = await step(merchant, booking, 'AcceptServiceIntake', {
          evidence: 'Customer arrived with the vehicle and retained ownership and custody.',
        });
        booking = await step(merchant, booking, 'StartNoPartsService', {
          evidence: 'Assigned wash team started using the actual bay.',
        });
        at('2030-01-08T09:40:00+03:00');
        let later = await create(merchant, service, {
          ...input,
          requestedInterval: {
            startTime: '2030-01-08T09:40:00+03:00',
            endTime: '2030-01-08T10:10:00+03:00',
          },
        });
        later = await step(merchant, later, 'AcceptFixedScopeServiceJob', { approval: approval() });
        await assert.rejects(
          () => step(merchant, later, 'ConfirmServiceWorkSlot'),
          'Unfinished actual bay work cannot become free solely because the planned end passed.',
        );
        booking = await step(merchant, booking, 'SubmitServiceResult', {
          evidence: 'Wash completed and result submitted for quality review.',
        });
        booking = await step(merchant, booking, 'ApproveServiceRelease', {
          evidence: 'Quality reviewer checked the completed wash.',
        });
        booking = await step(merchant, booking, 'ConfirmServiceHandover', {
          evidence: 'Customer acknowledged the completed service and departure.',
        });
        booking = await step(merchant, booking, 'CompleteServiceJob', {
          evidence: 'Merchant reviewed completion and closed the job.',
        });
        assert.equal(state(booking), 'COMPLETED');
        assert.equal(
          (await reservations(merchant)).filter((row) => ['held', 'confirmed'].includes(row.status))
            .length,
          0,
        );
      },
    );

    await t.test(
      'queued diagnosis claims current resources while separate custody survives bay release and planned end',
      async () => {
        clock.set(initialTime);
        const merchant = await identity('queued-tire', 'tire_service');
        const bay = await resource(merchant, 'Actual diagnostic bay', 'space');
        const tech = await resource(merchant, 'Actual tire technician');
        const holding = await resource(merchant, 'Actual vehicle holding space', 'space');
        const setup = {
          model: 'SERVICE_JOB',
          version: 1,
          supplierComponents: [],
          jobSchedulingMode: 'queue',
          assessmentMode: 'diagnosis_required',
          resourceIds: [bay.id, tech.id],
          durationMinutes: 30,
          partsRequired: false,
          partsEvidenceKind: 'authorized_manual_reference',
          custodyMode: 'merchant_holds',
          custodyResourceIds: [holding.id],
          custodyDurationMinutes: 120,
        };
        const service = await offering(
          merchant,
          'SERVICE_JOB',
          [bay.id, tech.id, holding.id],
          setup,
          { bookingEnabled: false },
        );
        const input = {
          model: 'SERVICE_JOB',
          jobDescription: 'Assess a slow tire leak; obtain approval before repair.',
          completionPromise: '2030-01-09T18:00:00+03:00',
        };
        await assert.rejects(() =>
          engine.createBooking(
            { ...merchant, role: 'customer', userId: 'queue-public-guest' },
            { offeringId: service.id, customer, specialist: input } as any,
            key(),
            true,
          ),
        );
        let booking = await create(merchant, service, input);
        assert.equal(
          (await reservations(merchant)).length,
          0,
          'A queue request or due estimate is not a future bay reservation.',
        );
        at('2030-01-09T09:00:00+03:00');
        booking = await step(merchant, booking, 'AcceptServiceIntake', {
          evidence: 'Merchant received the vehicle into the actual holding space.',
        });
        booking = await step(merchant, booking, 'StartDiagnosis', {
          approval: approval(),
          evidence:
            'Customer approved diagnostic scope; the actual technician and bay began assessment.',
        });
        assert.ok(
          (await reservations(merchant)).filter((row) => row.status === 'confirmed').length > 1,
        );
        at('2030-01-09T09:30:00+03:00');
        booking = await step(merchant, booking, 'IssueServiceQuote', {
          findings: 'Valve adjustment resolves the slow leak without replacement parts.',
          partsRequired: false,
          serviceSubtotalMinor: 175000,
          scopeVersion: 1,
          evidence: 'Merchant recorded findings and exact proposed repair price.',
        });
        const waiting = (await reservations(merchant)).filter((row) => row.status === 'confirmed');
        assert.ok(waiting.length > 0);
        assert.ok(
          waiting.every((row) => (row.nexg.resourceIds ?? []).includes(holding.id)),
          'The bay and technician must be released while the vehicle remains held for approval.',
        );
        booking = await step(merchant, booking, 'ApproveServiceJob', {
          approval: approval(175000),
        });
        booking = await step(merchant, booking, 'StartNoPartsService', {
          evidence: 'Technician began the approved no-parts adjustment in the actual bay.',
        });
        at('2030-01-09T10:00:00+03:00');
        booking = await step(merchant, booking, 'SubmitServiceResult', {
          evidence: 'Adjustment completed and leak test results submitted.',
        });
        booking = await step(merchant, booking, 'ApproveServiceRelease', {
          evidence: 'Quality reviewer approved the leak test and release.',
        });
        at('2030-01-09T12:00:00+03:00');
        const next = await create(merchant, service, input);
        await assert.rejects(() =>
          step(merchant, next, 'AcceptServiceIntake', {
            evidence: 'Cannot reuse occupied holding space just because its planned end passed.',
          }),
        );
        booking = await step(merchant, booking, 'ConfirmServiceHandover', {
          evidence: 'Customer physically collected the vehicle and acknowledged the repair.',
        });
        booking = await step(merchant, booking, 'CompleteServiceJob', {
          evidence: 'Merchant checked the actual handover and closed the repair job.',
        });
        assert.equal(state(booking), 'COMPLETED');
        assert.equal(
          (await reservations(merchant)).filter((row) => ['held', 'confirmed'].includes(row.status))
            .length,
          0,
        );
      },
    );
  } finally {
    clock.set(savedTime);
  }
}
