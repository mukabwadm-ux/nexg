import { describe, expect, it } from 'vitest';
import {
  normalizeSpecialistSetup,
  planSpecialistCommitment,
  transitionSpecialist,
  specialistPublicDescriptor,
  specialistPublicSummary,
  type SpecialistState,
  type SpecialistSetup,
  type SpecialistTransitionInput,
} from '../src/specialists';

const now = Date.parse('2026-10-31T06:00:00Z');
const window = (start: string, end: string) => ({ startTime: start, endTime: end });
const approval = {
  version: 1,
  acceptedBy: 'customer-a',
  acceptedAt: new Date(now).toISOString(),
  priceMinor: 150000,
};
const tour: SpecialistSetup = {
  model: 'TOUR',
  version: 1,
  supplierComponents: [],
  mode: 'private',
  itinerary: 'Nairobi guided day excursion',
  itineraryVersion: 1,
  resourceIds: ['guide-a', 'vehicle-a'],
  minimumParticipants: 1,
  maximumParticipants: 6,
};
const linked: SpecialistSetup = {
  model: 'LINKED_WINDOWS',
  version: 1,
  supplierComponents: [],
  promiseMode: 'FIRM_PRE_ACCEPTED',
  incomingMethod: 'MERCHANT_COLLECTION',
  outgoingMethod: 'MERCHANT_RETURN',
  incomingResourceIds: ['rider-a'],
  outgoingResourceIds: ['rider-a'],
  processingResourceId: 'laundry-kg',
  processingUnit: 'kg',
  quantityScale: 1,
  minimumProcessingMinutes: 60,
  maximumProcessingMinutes: 480,
  calendarBasis: 'elapsed',
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  opens: '08:00',
  closes: '18:00',
};
const production: SpecialistSetup = {
  model: 'PRODUCTION_DUE',
  version: 1,
  supplierComponents: [],
  capacityPoolId: 'bakery-jobs',
  capacityUnit: 'job',
  quantityScale: 0,
  preparationLeadMinutes: 120,
  cutoffLocalTime: '18:00',
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  approvalMode: 'required',
  handoffResourceIds: ['delivery-a'],
};
const entitlement: SpecialistSetup = {
  model: 'ENTITLEMENT',
  version: 1,
  supplierComponents: [],
  planId: 'studio-pass',
  planVersion: 1,
  scopeOfferingIds: ['class-a'],
  validity: { mode: 'relative_to_activation', duration: { value: 1, unit: 'month' } },
  credits: [{ id: 'visits', quantityMinor: 3, unit: 'visit', scale: 0, offeringIds: ['class-a'] }],
  renewal: 'manual',
  creditCancellation: 'restore_before_start',
};
const freight: SpecialistSetup = {
  model: 'FREIGHT',
  version: 1,
  supplierComponents: [],
  legs: [
    {
      id: 'nairobi-mombasa',
      origin: 'Nairobi',
      destination: 'Mombasa',
      resourceIds: ['truck-a', 'driver-a'],
      dimensions: [
        { resourceId: 'truck-mass', unit: 'kg', scale: 1 },
        { resourceId: 'truck-volume', unit: 'cbm', scale: 2 },
      ],
    },
  ],
  requiresDocuments: true,
  requiresClearance: false,
  finalMode: 'delivery',
};
const linkedInput = {
  model: 'LINKED_WINDOWS' as const,
  incoming: window('2026-11-01T08:00:00+03:00', '2026-11-01T09:00:00+03:00'),
  processing: window('2026-11-01T09:00:00+03:00', '2026-11-01T12:00:00+03:00'),
  outgoing: window('2026-11-01T13:00:00+03:00', '2026-11-01T14:00:00+03:00'),
  workload: { quantityMinor: 35, unit: 'kg', scale: 1 },
};
function plan(setup: SpecialistSetup, input: unknown) {
  return planSpecialistCommitment({ model: setup.model, setup, input, now });
}
function move(
  current: SpecialistState,
  command: string,
  input: SpecialistTransitionInput = {},
  stamp = now,
) {
  return transitionSpecialist({
    current,
    command,
    input,
    now: stamp,
    actor: 'merchant',
    paymentSatisfied: true,
  });
}

describe('tour commitments', () => {
  it('keeps private guide and vehicle in one exact interval and requires accepted scope', () => {
    const result = plan(tour, {
      model: 'TOUR',
      itineraryVersion: 1,
      ...window('2026-11-01T07:00:00+03:00', '2026-11-02T16:00:00+03:00'),
    });
    expect(result.roles[0]?.resourceIds).toEqual(['guide-a', 'vehicle-a']);
    expect(() => move(result.acceptedTerms, 'ConfirmTour')).toThrow();
    const accepted = move(result.acceptedTerms, 'AcceptTourScope', { approval }).next;
    expect(move(accepted, 'ConfirmTour').effects).toEqual([
      { type: 'allocate', roles: result.roles },
    ]);
  });
  it('requires a real dated shared departure and consumes its place pool without reserving the guide per attendee', () => {
    const setup = { ...tour, mode: 'shared', poolResourceId: 'tour-places' };
    expect(() =>
      planSpecialistCommitment({
        model: 'TOUR',
        setup,
        input: { model: 'TOUR', occurrenceId: 'missing', itineraryVersion: 1 },
        quantity: 2,
        now,
      }),
    ).toThrow();
    const result = planSpecialistCommitment({
      model: 'TOUR',
      setup,
      input: { model: 'TOUR', occurrenceId: 'departure-1', itineraryVersion: 1 },
      quantity: 2,
      now,
      occurrence: {
        id: 'departure-1',
        ...window('2026-11-01T04:00:00Z', '2026-11-01T15:00:00Z'),
        resourceIds: ['guide-a', 'vehicle-a', 'tour-places'],
        capacity: 6,
      },
    });
    expect(result.roles[0]?.resourceIds).toEqual(['tour-places']);
    expect(result.roles[0]?.quantities[0]?.quantityMinor).toBe(2);
  });
  it('requires contracted supplier evidence and never lets a merchant claim provider verification', () => {
    const setup = {
      ...tour,
      supplierComponents: [
        {
          id: 'park',
          description: 'Park admission',
          evidenceKind: 'authorized_manual_reference' as const,
        },
      ],
    };
    const state = move(
      plan(setup, {
        model: 'TOUR',
        itineraryVersion: 1,
        ...window('2026-11-01T07:00:00+03:00', '2026-11-01T16:00:00+03:00'),
      }).acceptedTerms,
      'AcceptTourScope',
      { approval },
    ).next;
    expect(() => move(state, 'ConfirmTour')).toThrow(/supplier/i);
    expect(() =>
      move(state, 'ConfirmTour', {
        supplierConfirmations: [
          { componentId: 'park', reference: 'ref-1', verification: 'provider_verified' },
        ],
      }),
    ).toThrow(/verified provider/i);
    const confirmed = move(state, 'ConfirmTour', {
      supplierConfirmations: [
        { componentId: 'park', reference: 'ref-1', verification: 'merchant_asserted' },
      ],
    });
    expect(confirmed.next.supplierConfirmations[0]?.verification).toBe('merchant_asserted');
  });
});

describe('linked incoming, processing and outgoing promises', () => {
  it('plans distinct rider windows and measured processing atomically rather than one long generic appointment', () => {
    const result = plan(linked, linkedInput);
    expect(result.roles.map(({ role }) => role)).toEqual(['incoming', 'processing', 'outgoing']);
    expect(result.roles[0]?.endTime).not.toBe(result.roles[2]?.endTime);
    expect(result.roles[1]?.quantities[0]).toEqual({
      resourceId: 'laundry-kg',
      quantityMinor: 35,
      unit: 'kg',
      scale: 1,
    });
    expect(() => move(result.acceptedTerms, 'ConfirmCollectionLeg')).toThrow(/accepted scope/i);
  });
  it('rejects an infeasible return and implicit workload precision changes', () => {
    expect(() =>
      plan(linked, {
        ...linkedInput,
        outgoing: window('2026-11-01T10:00:00+03:00', '2026-11-01T11:00:00+03:00'),
      }),
    ).toThrow(/feasible/i);
    expect(() =>
      plan(linked, { ...linkedInput, workload: { quantityMinor: 35, unit: 'kg', scale: 0 } }),
    ).toThrow(/scale 1/i);
  });
  it('commits only incoming during assessment and requires accepted measured scope before return allocation', () => {
    const setup = { ...linked, promiseMode: 'ASSESSMENT_REQUIRED' as const };
    const pending = plan(setup, {
      model: 'LINKED_WINDOWS',
      incoming: linkedInput.incoming,
    }).acceptedTerms;
    const confirmed = move(pending, 'ConfirmCollectionLeg');
    expect(confirmed.effects[0]).toMatchObject({ type: 'allocate', roles: [{ role: 'incoming' }] });
    expect(specialistPublicSummary(confirmed.next).details.outgoing).toBeUndefined();
    const collected = move(confirmed.next, 'ConfirmGoodsCollected', {
      evidence: '12 numbered garments collected with custody receipt',
    });
    expect(collected.next.custody).toBe('held');
    expect(collected.effects).toEqual([]);
    expect(() =>
      move(collected.next, 'RequestSpecialistCancellation', {
        evidence: 'Cancel while in transit',
      }),
    ).toThrow(/cannot erase/i);
    const received = move(collected.next, 'ReceiveForProcessing', {
      evidence: '12 numbered garments received',
    }).next;
    expect(received.state).toBe('ASSESSMENT_PENDING');
    const accepted = move(received, 'ApproveProcessingPrice', {
      approval,
      processing: linkedInput.processing,
      outgoing: linkedInput.outgoing,
      workload: linkedInput.workload,
    });
    expect(accepted.effects[0]).toMatchObject({
      type: 'allocate',
      roles: [{ role: 'processing' }, { role: 'outgoing' }],
    });
    expect(accepted.next.custody).toBe('held');
  });
  it('supports customer dropoff/collection without inventing either transport leg', () => {
    const setup = {
      ...linked,
      incomingMethod: 'CUSTOMER_DROPOFF' as const,
      outgoingMethod: 'CUSTOMER_COLLECTION' as const,
      incomingResourceIds: [],
      outgoingResourceIds: [],
    };
    expect(plan(setup, linkedInput).roles.map(({ role }) => role)).toEqual(['processing']);
    const pending = plan(setup, linkedInput).acceptedTerms;
    expect(specialistPublicSummary(pending).availableCommands).not.toContain(
      'ConfirmCollectionLeg',
    );
    expect(() => move(pending, 'ConfirmCollectionLeg')).toThrow();
    const accepted = move(pending, 'AcceptLinkedScope', { approval }).next;
    const received = move(accepted, 'ReceiveCustomerDropoff', {
      evidence: 'Customer handed over 3.5kg with item/condition receipt',
    });
    expect(received.next.custody).toBe('held');
    expect(received.effects[0]).toMatchObject({
      type: 'allocate',
      roles: [{ role: 'processing' }],
    });
    expect(() =>
      normalizeSpecialistSetup('LINKED_WINDOWS', { ...setup, incomingResourceIds: ['rider'] }),
    ).toThrow(/does not allocate/i);
  });
  it('commits a firm future customer drop-off promise before actual arrival and does not allocate it twice on receipt', () => {
    const setup = {
      ...linked,
      incomingMethod: 'CUSTOMER_DROPOFF' as const,
      outgoingMethod: 'CUSTOMER_COLLECTION' as const,
      incomingResourceIds: [],
      outgoingResourceIds: [],
    };
    const accepted = move(plan(setup, linkedInput).acceptedTerms, 'AcceptLinkedScope', {
      approval,
    }).next;
    const promised = move(accepted, 'ConfirmCustomerDropoffPromise', {});
    expect(promised.next.state).toBe('DROPOFF_EXPECTED');
    expect(promised.next.custody).toBe('not_received');
    expect(promised.effects).toMatchObject([{ type: 'allocate', roles: [{ role: 'processing' }] }]);
    const received = move(promised.next, 'ReceiveCustomerDropoff', {
      evidence: 'Actual later goods receipt',
    });
    expect(received.next.custody).toBe('held');
    expect(received.effects).toEqual([]);
  });
  it('does not skip actual carrier custody and distinguishes assessment drop-off with no invented transport allocation', () => {
    const pending = plan(
      { ...linked, promiseMode: 'ASSESSMENT_REQUIRED' },
      { model: 'LINKED_WINDOWS', incoming: linkedInput.incoming },
    ).acceptedTerms;
    const confirmed = move(pending, 'ConfirmCollectionLeg').next;
    expect(() =>
      move(confirmed, 'ReceiveForProcessing', { evidence: 'Skipped collection' }),
    ).toThrow(/unavailable/i);
    const setup = {
      ...linked,
      promiseMode: 'ASSESSMENT_REQUIRED' as const,
      incomingMethod: 'CUSTOMER_DROPOFF' as const,
      outgoingMethod: 'CUSTOMER_COLLECTION' as const,
      incomingResourceIds: [],
      outgoingResourceIds: [],
    };
    const dropoff = plan(setup, {
      model: 'LINKED_WINDOWS',
      incoming: linkedInput.incoming,
    }).acceptedTerms;
    const received = move(dropoff, 'ReceiveCustomerDropoff', {
      evidence: 'Actual customer goods/count/condition received',
    });
    expect(received.next.state).toBe('ASSESSMENT_PENDING');
    expect(received.next.custody).toBe('held');
    expect(received.effects).toEqual([{ type: 'allocate', roles: [] }]);
    expect(received.next.roles).toEqual([]);
  });
  it('counts actual working minutes across a weekend under business-calendar turnaround', () => {
    const setup = {
      ...linked,
      calendarBasis: 'business_calendar' as const,
      workingDays: [1, 2, 3, 4, 5],
      minimumProcessingMinutes: 120,
      maximumProcessingMinutes: 180,
    };
    const input = {
      ...linkedInput,
      incoming: window('2026-11-06T15:00:00+03:00', '2026-11-06T16:00:00+03:00'),
      processing: window('2026-11-06T17:00:00+03:00', '2026-11-09T09:00:00+03:00'),
      outgoing: window('2026-11-09T10:00:00+03:00', '2026-11-09T11:00:00+03:00'),
    };
    expect(plan(setup, input).roles).toHaveLength(3);
  });
});

describe('production promises', () => {
  const input = {
    model: 'PRODUCTION_DUE',
    specification: 'Two tier cake, blue icing, approved allergen scope',
    specificationVersion: 1,
    productionStartTime: '2026-11-02T08:00:00+03:00',
    dueTime: '2026-11-02T15:00:00+03:00',
    workload: { quantityMinor: 2, unit: 'job', scale: 0 },
  };
  it('reserves workload over an actual production interval and keeps the due endpoint distinct from a visit', () => {
    const result = plan(production, input);
    expect(result.roles[0]).toMatchObject({
      role: 'production',
      startTime: '2026-11-02T05:00:00.000Z',
      endTime: '2026-11-02T12:00:00.000Z',
      quantities: [{ quantityMinor: 2, unit: 'job' }],
    });
    expect(specialistPublicSummary(result.acceptedTerms).details.specification).toBe(
      input.specification,
    );
  });
  it('rejects short lead, non-working due dates, cutoff misses and premature handoff', () => {
    expect(() =>
      plan(production, {
        ...input,
        productionStartTime: '2026-10-31T09:10:00+03:00',
        dueTime: '2026-10-31T10:00:00+03:00',
      }),
    ).toThrow(/lead time/i);
    expect(() => plan({ ...production, workingDays: [2] }, input)).toThrow(/working day/i);
    expect(() => plan(production, { ...input, dueTime: '2026-11-02T19:00:00+03:00' })).toThrow(
      /cutoff/i,
    );
    expect(() =>
      plan(production, {
        ...input,
        handoff: window('2026-11-02T14:00:00+03:00', '2026-11-02T15:00:00+03:00'),
      }),
    ).toThrow(/precede/i);
  });
  it('requires the exact accepted specification version before capacity commitment', () => {
    const result = plan(production, input);
    expect(() =>
      move(result.acceptedTerms, 'AcceptProductionScope', {
        approval: { ...approval, version: 2 },
      }),
    ).toThrow(/current exact/i);
    const accepted = move(result.acceptedTerms, 'AcceptProductionScope', { approval }).next;
    expect(move(accepted, 'CommitProduction').effects[0]?.type).toBe('allocate');
  });
  it('retains produced goods custody through quality review rather than allowing cancellation to erase it', () => {
    let state = move(plan(production, input).acceptedTerms, 'AcceptProductionScope', {
      approval,
    }).next;
    state = move(state, 'CommitProduction').next;
    state = move(state, 'StartProduction', {
      evidence: 'Approved materials entered production',
    }).next;
    state = move(state, 'SubmitProductionResult', {
      evidence: 'Contracted goods produced for quality review',
    }).next;
    expect(state.custody).toBe('held');
    expect(() =>
      move(state, 'RequestSpecialistCancellation', { evidence: 'Cancellation requested' }),
    ).toThrow(/cannot erase/i);
  });
});

describe('entitlement access and credit intents', () => {
  it('activation alone reserves no slot and relative validity begins at actual activation', () => {
    const pending = plan(entitlement, { model: 'ENTITLEMENT' }).acceptedTerms;
    expect(pending.roles).toEqual([]);
    expect(pending.validity).toBeUndefined();
    const activated = move(
      pending,
      'ActivateMembership',
      { approval },
      Date.parse('2026-11-05T06:00:00Z'),
    );
    expect(activated.effects).toEqual([]);
    expect(activated.next.validity?.starts).toBe('2026-11-05T06:00:00.000Z');
    expect(activated.next.validity?.ends).toBe('2026-12-05T06:00:00.000Z');
  });
  it('emits one atomic child booking+credit use intent and blocks duplicate occurrence or scope misuse', () => {
    const active = move(
      plan(entitlement, { model: 'ENTITLEMENT' }).acceptedTerms,
      'ActivateMembership',
      { approval },
    ).next;
    const redeem = {
      creditId: 'visits',
      quantityMinor: 1,
      unit: 'visit',
      scale: 0,
      offeringId: 'class-a',
      occurrenceKey: 'class-a:2026-11-01',
      booking: { offeringId: 'class-a', occurrenceId: 'session-1' },
    };
    const used = move(active, 'RedeemEntitlement', redeem);
    expect(used.effects).toEqual([{ type: 'redeem', ...redeem }]);
    expect(used.next.credits?.[0]?.quantityMinor).toBe(2);
    expect(active.credits?.[0]?.quantityMinor).toBe(3);
    expect(() => move(used.next, 'RedeemEntitlement', redeem)).toThrow(/already redeemed/i);
    expect(() => move(active, 'RedeemEntitlement', { ...redeem, offeringId: 'unrelated' })).toThrow(
      /outside the accepted plan/i,
    );
  });
  it('blocks expired and paused use without consuming credit or altering existing child work', () => {
    const active = move(
      plan(entitlement, { model: 'ENTITLEMENT' }).acceptedTerms,
      'ActivateMembership',
      { approval },
    ).next;
    const paused = move(active, 'PauseMembership', { evidence: 'Member requested pause' });
    expect(paused.effects).toEqual([]);
    expect(() => move(paused.next, 'RedeemEntitlement', {})).toThrow();
    expect(() => move(active, 'RedeemEntitlement', {}, Date.parse('2026-12-01T06:00:00Z'))).toThrow(
      /validity/i,
    );
  });
  it('clamps month-end validity in Kenya time', () => {
    const active = move(
      plan(entitlement, { model: 'ENTITLEMENT' }).acceptedTerms,
      'ActivateMembership',
      { approval },
      Date.parse('2027-01-30T21:30:00Z'),
    ).next;
    expect(active.validity?.ends).toBe('2027-02-27T21:30:00.000Z');
  });
  it('restores the original credit amount once only under the explicit pre-start cancellation policy', () => {
    const active = move(
      plan(entitlement, { model: 'ENTITLEMENT' }).acceptedTerms,
      'ActivateMembership',
      { approval },
    ).next;
    const used = move(active, 'RedeemEntitlement', {
      creditId: 'visits',
      quantityMinor: 1,
      unit: 'visit',
      scale: 0,
      offeringId: 'class-a',
      occurrenceKey: 'occ-1',
      booking: { offeringId: 'class-a' },
    }).next;
    const cancelledBooking = {
      bookingId: 'child-1',
      occurrenceKey: 'occ-1',
      cancelledAt: new Date(now).toISOString(),
      startTime: '2026-11-01T06:00:00Z',
    };
    const restored = move(used, 'RestoreEntitlementCredit', {
      evidence: 'Verified the owned child cancellation',
      cancelledBooking,
    });
    expect(restored.next.credits?.[0]?.quantityMinor).toBe(3);
    expect(restored.effects[0]).toMatchObject({
      type: 'restore_credit',
      quantityMinor: 1,
      bookingId: 'child-1',
    });
    expect(() =>
      move(restored.next, 'RestoreEntitlementCredit', { evidence: 'Retry', cancelledBooking }),
    ).toThrow(/unrestored/i);
    expect(() =>
      move(
        { ...used, setup: { ...entitlement, creditCancellation: 'nonrefundable' } },
        'RestoreEntitlementCredit',
        { evidence: 'Cancel', cancelledBooking },
      ),
    ).toThrow(/does not restore/i);
  });
  it('books actual child work for a creditless access plan without inventing usage credits', () => {
    const setup = { ...entitlement, credits: [] };
    const active = move(plan(setup, { model: 'ENTITLEMENT' }).acceptedTerms, 'ActivateMembership', {
      approval,
    }).next;
    const result = move(active, 'BookEntitledOffering', {
      offeringId: 'class-a',
      occurrenceKey: 'occ-2',
      booking: { occurrenceId: 'class-2' },
    });
    expect(result.effects).toEqual([
      {
        type: 'book_entitled',
        offeringId: 'class-a',
        occurrenceKey: 'occ-2',
        booking: { occurrenceId: 'class-2' },
      },
    ]);
    expect(result.next.credits).toEqual([]);
  });
});

describe('freight cargo and custody', () => {
  const input = {
    model: 'FREIGHT',
    cargoDescription: 'Sealed cartons',
    pieces: 20,
    cargo: [
      { quantityMinor: 2500, unit: 'kg', scale: 1 },
      { quantityMinor: 375, unit: 'cbm', scale: 2 },
    ],
    legs: [
      {
        id: 'nairobi-mombasa',
        ...window('2026-11-02T08:00:00+03:00', '2026-11-02T18:00:00+03:00'),
      },
    ],
  };
  it('emits independent mass and volume capacity dimensions alongside actual vehicle and driver', () => {
    const result = plan(freight, input);
    expect(result.roles[0]?.quantities).toEqual([
      { resourceId: 'truck-mass', quantityMinor: 2500, unit: 'kg', scale: 1 },
      { resourceId: 'truck-volume', quantityMinor: 375, unit: 'cbm', scale: 2 },
    ]);
    expect(result.roles[0]?.resourceIds).toEqual([
      'truck-a',
      'driver-a',
      'truck-mass',
      'truck-volume',
    ]);
  });
  it('rejects missing dimensions or implicit kg/g conversion', () => {
    expect(() => plan(freight, { ...input, cargo: input.cargo.slice(0, 1) })).toThrow();
    expect(() =>
      plan(freight, {
        ...input,
        cargo: [{ quantityMinor: 250000, unit: 'g', scale: 0 }, input.cargo[1]],
      }),
    ).toThrow();
  });
  it('requires document clearance and preserves collected custody against generic cancellation', () => {
    let state = move(plan(freight, input).acceptedTerms, 'AcceptFreightQuote', { approval }).next;
    state = move(state, 'ConfirmFreightBooking').next;
    expect(() => move(state, 'ConfirmFreightCollection', { evidence: 'Cargo received' })).toThrow(
      /documents/i,
    );
    state = move(state, 'ClearFreightDocuments', {
      evidence: 'Reviewed consignment documents',
    }).next;
    state = move(state, 'ConfirmFreightCollection', {
      evidence: '20 cartons condition and custody receipt',
    }).next;
    expect(state.custody).toBe('held');
    expect(() =>
      move(state, 'RequestSpecialistCancellation', { evidence: 'Cancel request' }),
    ).toThrow(/recovery/i);
  });
  it('keeps domestic and clearance-required routes distinct, including final collection versus delivery', () => {
    const setup = {
      ...freight,
      requiresDocuments: false,
      requiresClearance: true,
      finalMode: 'consignee_collection' as const,
    };
    let state = move(plan(setup, input).acceptedTerms, 'AcceptFreightQuote', { approval }).next;
    state = move(state, 'ConfirmFreightBooking').next;
    state = move(state, 'ConfirmFreightCollection', { evidence: 'Collected' }).next;
    state = move(state, 'ConfirmFreightDeparture', { evidence: 'Departed' }).next;
    expect(() => move(state, 'ConfirmFreightDestinationArrival', { evidence: 'Arrived' })).toThrow(
      /clearance/i,
    );
    state = move(state, 'RecordFreightClearanceArrival', {
      evidence: 'Authority arrival reference',
    }).next;
    state = move(state, 'ConfirmFreightClearance', { evidence: 'Authority result reference' }).next;
    state = move(state, 'ConfirmFreightDestinationArrival', { evidence: 'Warehouse receipt' }).next;
    expect(() => move(state, 'ConfirmFreightDelivery', { evidence: 'Delivered' })).toThrow(
      /collection/i,
    );
    expect(
      move(state, 'ConfirmConsigneeCollection', { evidence: 'Authorized recipient proof' }).next
        .custody,
    ).toBe('released');
  });
});

describe('specialist public and trusted boundaries', () => {
  it('lets merchant quote the exact review scope, clears prior acceptance and rejects stale or customer quote mutation', () => {
    const pending = plan(tour, {
      model: 'TOUR',
      itineraryVersion: 1,
      ...window('2026-11-01T07:00:00+03:00', '2026-11-01T16:00:00+03:00'),
    }).acceptedTerms;
    const quoted = move({ ...pending, approval }, 'IssueSpecialistQuote', { scopeVersion: 1 });
    expect(quoted.next.state).toBe('QUOTED');
    expect(quoted.next.approval).toBeUndefined();
    expect(quoted.effects).toEqual([]);
    expect(() => move(pending, 'IssueSpecialistQuote', { scopeVersion: 2 })).toThrow(
      /current exact/i,
    );
    expect(() =>
      transitionSpecialist({
        current: pending,
        command: 'IssueSpecialistQuote',
        input: { scopeVersion: 1 },
        now,
        actor: 'customer',
        paymentSatisfied: true,
      }),
    ).toThrow();
  });
  it('constructs public intake descriptors without private inventory or supplier references', () => {
    for (const setup of [tour, linked, production, entitlement, freight]) {
      const publicJson = JSON.stringify(specialistPublicDescriptor(setup));
      expect(publicJson).not.toMatch(
        /guide-a|vehicle-a|rider-a|laundry-kg|bakery-jobs|truck-mass|truck-volume|resourceId|supplierComponents/,
      );
    }
  });
  it('rejects impossible dates, missing explicit inventory and unauthorized customer milestones', () => {
    expect(() =>
      plan(tour, {
        model: 'TOUR',
        itineraryVersion: 1,
        ...window('2026-02-30T07:00:00+03:00', '2026-03-01T07:00:00+03:00'),
      }),
    ).toThrow(/real local date/i);
    expect(() =>
      normalizeSpecialistSetup('PRODUCTION_DUE', { ...production, capacityPoolId: '' }),
    ).toThrow();
    const pending = plan(tour, {
      model: 'TOUR',
      itineraryVersion: 1,
      ...window('2026-11-01T07:00:00+03:00', '2026-11-01T16:00:00+03:00'),
    }).acceptedTerms;
    expect(() =>
      transitionSpecialist({
        current: pending,
        command: 'ConfirmTour',
        now,
        actor: 'customer',
        paymentSatisfied: true,
      }),
    ).toThrow(/owning provider/i);
  });
});
