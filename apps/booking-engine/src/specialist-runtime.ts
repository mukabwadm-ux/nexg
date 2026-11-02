import {
  specialistPublicDescriptor,
  normalizeSpecialistSetup,
  planSpecialistCommitment,
  specialistPublicSummary,
  transitionSpecialist,
  SPECIALIST_MODELS,
  SpecialistValidationError,
  type SpecialistSetup,
  type SpecialistState,
  type SpecialistRole,
  type SpecialistModel,
} from '@nexg/booking-config/specialists';
import type { BookingEngine } from './engine.js';
import { BookingError, type Identity, type BookingInput } from './types.js';
type Doc = Record<string, any>;
export function isSpecialistModel(model: string): model is SpecialistModel {
  return (SPECIALIST_MODELS as readonly string[]).includes(model);
}
export function specialistSetup(
  model: string,
  value: unknown,
  answers: Doc = {},
): SpecialistSetup | undefined {
  if (!isSpecialistModel(model) || value === undefined) return undefined;
  try {
    return normalizeSpecialistSetup(model, value, answers);
  } catch (error) {
    throw specialistError(error);
  }
}
function specialistError(error: unknown): unknown {
  return error instanceof SpecialistValidationError
    ? new BookingError(422, error.message, error.code)
    : error;
}
export function specialistResourceIds(setup: SpecialistSetup): string[] {
  switch (setup.model) {
    case 'TOUR':
      return [
        ...new Set([...setup.resourceIds, ...(setup.poolResourceId ? [setup.poolResourceId] : [])]),
      ];
    case 'LINKED_WINDOWS':
      return [
        ...new Set([
          ...setup.incomingResourceIds,
          setup.processingResourceId,
          ...setup.outgoingResourceIds,
        ]),
      ];
    case 'PRODUCTION_DUE':
      return [...new Set([setup.capacityPoolId, ...setup.handoffResourceIds])];
    case 'ENTITLEMENT':
      return [];
    case 'SERVICE_JOB':
      return [...new Set([...setup.resourceIds, ...setup.custodyResourceIds])];
    case 'FREIGHT':
      return [
        ...new Set(
          setup.legs.flatMap((leg) => [
            ...leg.resourceIds,
            ...leg.dimensions.map((d) => d.resourceId),
          ]),
        ),
      ];
  }
}
export function validateSpecialistInventory(setup: SpecialistSetup, resources: Doc[]) {
  for (const id of specialistResourceIds(setup)) {
    const resource = resources.find((r) => r.publicId === id);
    if (!resource || resource.active === false || !resource.nexg?.schedule?.days?.length)
      throw new BookingError(
        422,
        'Every specialist resource must be active, owned and scheduled.',
        'specialist_inventory_required',
      );
  }
  const pool = (id: string, unit: string, scale: number) => {
    const resource = resources.find((r) => r.publicId === id);
    if (
      !resource ||
      resource.capacityMode !== 'per-guest' ||
      resource.nexg?.capacityUnit !== unit ||
      resource.nexg?.quantityScale !== scale
    )
      throw new BookingError(
        422,
        'Specialist capacity pools must have the exact declared unit and precision.',
        'specialist_unit_mismatch',
      );
  };
  if (setup.model === 'TOUR' && setup.mode === 'shared') pool(setup.poolResourceId!, 'place', 0);
  if (setup.model === 'LINKED_WINDOWS')
    pool(setup.processingResourceId, setup.processingUnit, setup.quantityScale);
  if (setup.model === 'PRODUCTION_DUE')
    pool(setup.capacityPoolId, setup.capacityUnit, setup.quantityScale);
  if (setup.model === 'FREIGHT')
    for (const leg of setup.legs)
      for (const dimension of leg.dimensions)
        pool(dimension.resourceId, dimension.unit, dimension.scale);
}
export async function prepareSpecialistPlan(
  engine: BookingEngine,
  identity: Identity,
  service: Doc,
  input: BookingInput,
  req?: any,
) {
  const c = engine.specialistContext();
  const setup = specialistSetup(service.nexg.model, service.nexg.specialistSetup);
  if (!setup) return undefined;
  const resources = await Promise.all(
    specialistResourceIds(setup).map((id) => c.own('resources', id, identity, req)),
  );
  validateSpecialistInventory(setup, resources);
  const occurrence =
    setup.model === 'TOUR' && setup.mode === 'shared'
      ? (await c.all('booking-sessions', identity, req)).find(
          (row) =>
            row.published === true &&
            row.offeringId === service.publicId &&
            row.publicId === (input.specialist as Doc | undefined)?.occurrenceId,
        )
      : undefined;
  if (
    occurrence &&
    identity.branches &&
    !identity.branches.includes(occurrence.locationId ?? 'primary')
  )
    throw new BookingError(403, 'This departure is outside your access.', 'forbidden');
  try {
    const plan = planSpecialistCommitment({
      model: setup.model,
      setup,
      input: input.specialist,
      quantity: input.quantity ?? 1,
      now: c.now(),
      occurrence: occurrence
        ? {
            id: occurrence.publicId,
            startTime: occurrence.startTime,
            endTime: occurrence.endTime,
            resourceIds: occurrence.resourceIds,
            capacity: occurrence.capacity,
          }
        : undefined,
    });
    for (const role of plan.roles) {
      const start = Date.parse(role.startTime);
      if (start < c.now() + (service.nexg.leadTimeMinutes ?? 0) * 60000)
        throw new BookingError(
          409,
          'The proposed role starts before the booking lead time.',
          'lead_time',
        );
      if (service.nexg.horizonDays && start > c.now() + service.nexg.horizonDays * 86400000)
        throw new BookingError(409, 'The role is beyond the booking horizon.', 'booking_horizon');
    }
    if (setup.model === 'TOUR' && setup.mode === 'private') {
      const vehicles = resources.filter((r) => r.resourceType === 'vehicle');
      if (
        vehicles.length &&
        vehicles.reduce((total, r) => total + (r.nexg?.partyCapacity ?? 0), 0) <
          (input.quantity ?? 1)
      )
        throw new BookingError(
          409,
          'The actual tour vehicles do not fit this party.',
          'party_capacity',
        );
    }
    const starts = plan.roles.map((role) => Date.parse(role.startTime));
    const ends = plan.roles.map((role) => Date.parse(role.endTime));
    return {
      plan,
      start: starts.length ? Math.min(...starts) : null,
      end: ends.length ? Math.max(...ends) : null,
    };
  } catch (error) {
    throw specialistError(error);
  }
}
export function specialistBookingView(n: Doc) {
  const state = n.specialistState as SpecialistState | undefined;
  if (!state) return undefined;
  const scopeVersion =
    state.input.model === 'PRODUCTION_DUE'
      ? state.input.specificationVersion
      : state.setup.model === 'TOUR'
        ? state.setup.itineraryVersion
        : state.setup.model === 'ENTITLEMENT'
          ? state.setup.planVersion
          : state.setup.version;
  return {
    ...specialistPublicSummary(state),
    descriptor: specialistPublicDescriptor(state.setup),
    scopeVersion,
    acceptedPriceMinor: state.approval?.priceMinor,
    allocations: (n.specialistAllocations ?? []).map((a: Doc) => ({
      id: a.id,
      role: a.role,
      resourceIds: a.resourceIds,
      startTime: a.startTime,
      endTime: a.endTime,
      status: a.status,
    })),
    redemptions: (n.entitlementRedemptions ?? []).map((r: Doc) => ({
      id: r.bookingId,
      offeringId: r.offeringId,
      startTime: r.startTime,
      endTime: r.endTime,
      quantityMinor: r.quantityMinor,
      unit: r.unit,
      scale: r.scale,
    })),
  };
}
async function commitRoles(
  engine: BookingEngine,
  identity: Identity,
  req: any,
  parent: Doc,
  service: Doc,
  roles: SpecialistRole[],
  existing: Doc[],
) {
  const c = engine.specialistContext();
  const committed = [...existing];
  if (service.durationType !== 'flexible' || service.duration !== 1) {
    await c.update(
      'services',
      service.id,
      { durationType: 'flexible', duration: 1 },
      identity,
      req,
    );
    service = { ...service, durationType: 'flexible', duration: 1 };
  }
  for (const role of roles) {
    if (committed.some((a) => a.roleId === role.id && ['confirmed', 'held'].includes(a.status)))
      throw new BookingError(
        409,
        'This workflow role is already committed.',
        'duplicate_specialist_commitment',
      );
    const state = parent.nexg.specialistState as SpecialistState;
    const sharedTour =
      role.role === 'tour_departure' &&
      state.setup.model === 'TOUR' &&
      state.setup.mode === 'shared';
    const ids = sharedTour ? specialistResourceIds(state.setup) : role.resourceIds;
    const resources = await Promise.all(ids.map((id) => c.own('resources', id, identity, req)));
    const allocationService = sharedTour
      ? {
          ...service,
          nexg: {
            ...service.nexg,
            model: 'SESSION_CAPACITY',
            capacity: state.setup.model === 'TOUR' ? state.setup.maximumParticipants : undefined,
            capacityUnit: 'place',
            quantityScale: 0,
          },
        }
      : service;
    const resourceIds = resources.map((r) => r.publicId);
    const metadata = {
      publicId: c.publicId(),
      parentBookingId: parent.publicId,
      recordRole: 'specialist_allocation',
      roleId: role.id,
      offeringId: service.publicId,
      offeringName: service.name,
      model: service.nexg.model,
      resourceIds,
      customer: parent.nexg.customer,
      startTime: role.startTime,
      endTime: role.endTime,
      quantity: parent.nexg.quantity,
      status: 'confirmed',
      version: 1,
      occurrenceId: role.occurrenceId,
      locationId: parent.nexg.locationId,
      priceMinor: 0,
      currency: 'KES',
      configurationRevision: parent.nexg.configurationRevision,
    };
    const child = await c.allocate(
      identity,
      req,
      allocationService,
      resources,
      {
        offeringId: service.publicId,
        customer: parent.nexg.customer,
        quantity: parent.nexg.quantity,
        startTime: role.startTime,
        endTime: role.endTime,
        occurrenceId: role.occurrenceId,
        allocations: role.quantities.map((quantity) => ({
          ...quantity,
          startTime: role.startTime,
          endTime: role.endTime,
        })),
      },
      metadata,
      true,
    );
    committed.push({
      id: child.publicId,
      roleId: role.id,
      role: role.role,
      resourceIds,
      startTime: role.startTime,
      endTime: role.endTime,
      status: 'confirmed',
    });
  }
  return committed;
}
export async function changeSpecialistWork(
  engine: BookingEngine,
  identity: Identity,
  req: any,
  parent: Doc,
  service: Doc,
  input: Doc,
  acceptedConfiguration: Doc,
) {
  const c = engine.specialistContext(),
    n = parent.nexg;
  if (!n.specialistState || n.executionMode !== 'native_workflow')
    throw new BookingError(
      422,
      'This request has no accepted native specialist contract.',
      'specialist_contract_required',
    );
  if (c.sourceConfirmationRequired(acceptedConfiguration))
    throw new BookingError(
      409,
      'The owning system must confirm this workflow.',
      'source_confirmation_required',
    );
  const command = typeof input.command === 'string' ? input.command : '';
  let proposedPricing: Doc | undefined;
  let proposedQuote: Doc | undefined;
  if (command === 'IssueSpecialistQuote' || command === 'IssueServiceQuote') {
    if (identity.role === 'customer')
      throw new BookingError(403, 'Only the merchant issues a quote.', 'forbidden');
    if (
      (n.paidMinor ?? 0) > 0 ||
      (n.specialistAllocations ?? []).some(
        (a: Doc) =>
          ['held', 'confirmed'].includes(a.status) &&
          !(
            command === 'IssueServiceQuote' &&
            ['job_diagnosis', 'job_intake', 'job_custody'].includes(a.role)
          ),
      )
    )
      throw new BookingError(
        409,
        'An accepted collection or live capacity commitment prevents repricing.',
        'specialist_quote_locked',
      );
    const scopeVersion = specialistBookingView(n)!.scopeVersion;
    if (
      input.scopeVersion !== scopeVersion ||
      !Number.isSafeInteger(input.serviceSubtotalMinor) ||
      input.serviceSubtotalMinor < 0 ||
      input.serviceSubtotalMinor > 1e9
    )
      throw new BookingError(
        422,
        'Quote the current exact scope and an integer KES minor-unit subtotal.',
        'invalid_specialist_quote',
      );
    proposedPricing = c.price(
      {
        ...service,
        nexg: {
          ...service.nexg,
          pricingBasis: 'per_booking',
          priceMinor: input.serviceSubtotalMinor,
          minimumBillableUnits: 1,
          reservationFee: n.acceptedReservationFee,
        },
      },
      null,
      null,
      1,
    );
    proposedQuote = {
      revision: (n.proposedQuote?.revision ?? 0) + 1,
      scopeVersion,
      serviceSubtotalMinor: input.serviceSubtotalMinor,
      issuedBy: identity.userId,
      issuedAt: new Date(c.now()).toISOString(),
    };
  }
  const transitionInput = { ...input };
  delete transitionInput.expectedVersion;
  delete transitionInput.command;
  if (transitionInput.approval) {
    if (transitionInput.approval.priceMinor !== n.pricing.totalMinor)
      throw new BookingError(
        409,
        'Accept the current exact server-calculated price.',
        'price_changed',
      );
    transitionInput.approval = {
      version: transitionInput.approval.version,
      priceMinor: n.pricing.totalMinor,
      acceptedBy: identity.userId,
      acceptedAt: new Date(c.now()).toISOString(),
    };
  }
  const paid = (n.paidMinor ?? 0) - (n.refundedMinor ?? 0);
  const paymentSatisfied =
    !n.requiresPayment ||
    (paid >= (n.pricing.dueNowMinor ?? 0) && n.paymentState === 'merchant_recorded');
  if (command === 'RedeemEntitlement' || command === 'BookEntitledOffering') {
    const target = await c.own('services', transitionInput.offeringId, identity, req);
    const bookingInput = {
      ...(transitionInput.booking ?? {}),
      offeringId: target.publicId,
      customer: n.customer,
    };
    const window = c.window(target, bookingInput);
    transitionInput.occurrenceKey = [
      target.publicId,
      window.start,
      window.end,
      bookingInput.occurrenceId ?? '',
    ].join(':');
    transitionInput.booking = bookingInput;
  }
  if (command === 'RestoreEntitlementCredit') {
    const childId = input.childBookingId ?? input.cancelledBooking?.bookingId ?? input.bookingId;
    const child = await c.own('reservations', childId, identity, req);
    if (
      child.nexg?.entitlementId !== parent.publicId ||
      child.status !== 'cancelled' ||
      !child.nexg.entitlementDebit
    )
      throw new BookingError(
        422,
        'Restore only an actually cancelled child of this membership.',
        'entitlement_restore_invalid',
      );
    transitionInput.cancelledBooking = {
      bookingId: child.publicId,
      occurrenceKey: child.nexg.entitlementDebit.occurrenceKey,
      cancelledAt: new Date(c.now()).toISOString(),
      startTime: child.nexg.startTime,
    };
  }
  if (
    [
      'ActivateMembership',
      'ResumeMembership',
      'IssueSpecialistQuote',
      'IssueServiceQuote',
      'RedeemEntitlement',
      'BookEntitledOffering',
    ].includes(command)
  ) {
    const resources = await Promise.all(
      specialistResourceIds(n.specialistState.setup).map((id) =>
        c.own('resources', id, identity, req),
      ),
    );
    await c.assertReady(identity, service, resources, req, acceptedConfiguration);
  }
  if (
    n.specialistState.model === 'SERVICE_JOB' &&
    command === 'StartRepair' &&
    c.externalOwnership(acceptedConfiguration, ['stock'])
  )
    throw new BookingError(
      409,
      'The required parts owner must confirm stock through its authoritative source.',
      'parts_source_confirmation_required',
    );
  let transition;
  try {
    transition = transitionSpecialist({
      current: n.specialistState,
      command,
      input: transitionInput,
      now: c.now(),
      actor: identity.role === 'customer' ? 'customer' : 'merchant',
      paymentSatisfied,
    });
  } catch (error) {
    throw specialistError(error);
  }
  if (
    transition.next.model !== 'SERVICE_JOB' &&
    n.specialistState.custody !== 'held' &&
    transition.next.custody === 'held'
  ) {
    const roles = transition.next.roles;
    const earliest =
      transition.next.input.model === 'LINKED_WINDOWS'
        ? Date.parse(transition.next.input.incoming.startTime)
        : roles.length
          ? Math.min(...roles.map((role) => Date.parse(role.startTime)))
          : c.now();
    if (c.now() < earliest)
      throw new BookingError(
        409,
        'Record this actual custody milestone at or after its accepted role begins.',
        'specialist_milestone_too_early',
      );
    if (
      ['StartTour', 'StartProduction'].includes(command) &&
      roles.length &&
      c.now() >= Math.max(...roles.map((role) => Date.parse(role.endTime)))
    )
      throw new BookingError(
        409,
        'The planned commitment ended; review a feasible updated plan before starting.',
        'specialist_commitment_elapsed',
      );
    const resources = await Promise.all(
      specialistResourceIds(transition.next.setup).map((id) =>
        c.own('resources', id, identity, req),
      ),
    );
    const conflict = (await c.all('reservations', identity, req)).some(
      (row) =>
        row.nexg?.parentBookingId !== parent.publicId &&
        row.nexg?.custodyState === 'in_use' &&
        Date.parse(row.endTime) <= c.now() &&
        resources.some((resource) => c.references(row, resource.id)),
    );
    if (conflict)
      throw new BookingError(
        409,
        'Prior physical custody has not been released for a required workflow resource.',
        'overdue_occupancy',
      );
  }
  let allocations = [...(n.specialistAllocations ?? [])];
  const redemptions = [...(n.entitlementRedemptions ?? [])];
  for (const effect of transition.effects) {
    if (effect.type === 'allocate') {
      const currentResources = await Promise.all(
        specialistResourceIds(transition.next.setup).map((id) =>
          c.own('resources', id, identity, req),
        ),
      );
      validateSpecialistInventory(transition.next.setup, currentResources);
      await c.assertReady(identity, service, currentResources, req, acceptedConfiguration);
      allocations = await commitRoles(
        engine,
        identity,
        req,
        { ...parent, nexg: { ...n, specialistState: transition.next } },
        service,
        effect.roles,
        allocations,
      );
    } else if (effect.type === 'release') {
      for (const allocation of allocations.filter(
        (a) => effect.roleIds.includes(a.roleId) && ['held', 'confirmed'].includes(a.status),
      )) {
        const child = await c.own('reservations', allocation.id, identity, req);
        await c.update(
          'reservations',
          child.id,
          {
            status: transition.next.state === 'CANCELLED' ? 'cancelled' : 'completed',
            nexg: {
              ...child.nexg,
              status: transition.next.state === 'CANCELLED' ? 'cancelled' : 'completed',
              custodyState: 'released',
              version: child.nexg.version + 1,
            },
          },
          identity,
          req,
        );
        allocation.status = transition.next.state === 'CANCELLED' ? 'cancelled' : 'completed';
      }
    } else if (effect.type === 'begin') {
      for (const allocation of allocations.filter(
        (a) => effect.roleIds.includes(a.roleId) && a.status === 'confirmed',
      )) {
        const child = await c.own('reservations', allocation.id, identity, req);
        const resources = await Promise.all(
          allocation.resourceIds.map((id: string) => c.own('resources', id, identity, req)),
        );
        const otherCustody = (await c.all('reservations', identity, req)).some(
          (row) =>
            row.nexg?.parentBookingId !== parent.publicId &&
            row.nexg?.custodyState === 'in_use' &&
            resources.some((resource) => c.references(row, resource.id)),
        );
        if (otherCustody)
          throw new BookingError(
            409,
            'Another actual job still occupies a required work resource.',
            'overdue_occupancy',
          );
        await c.update(
          'reservations',
          child.id,
          { nexg: { ...child.nexg, custodyState: 'in_use' } },
          identity,
          req,
        );
      }
    } else if (effect.type === 'redeem' || effect.type === 'book_entitled') {
      const target = await c.own('services', effect.offeringId, identity, req);
      if (
        isSpecialistModel(target.nexg.model) ||
        ['ORDER', 'REQUEST_QUOTE', 'SERVICE_JOB'].includes(target.nexg.model)
      )
        throw new BookingError(
          422,
          'Redeem this credit against an actual scheduled offering.',
          'entitlement_target_unsupported',
        );
      if (target.active === false || target.nexg.bookingEnabled === false)
        throw new BookingError(
          409,
          'The redeemed offering is closed to new bookings.',
          'inactive_offering',
        );
      if (
        target.nexg.reservationFee?.requiredBeforeConfirmation &&
        target.nexg.reservationFee.mode !== 'no_fee'
      )
        throw new BookingError(
          422,
          'This plan does not silently cover the target reservation fee.',
          'entitlement_fee_not_covered',
        );
      const booking = effect.booking as unknown as BookingInput;
      if (booking.allocations !== undefined)
        throw new BookingError(
          422,
          'Entitlement allocations are derived from actual credited booking quantity, not supplied capacity overrides.',
          'entitlement_allocation_override',
        );
      c.validateBookingDetails(target, booking);
      const window = c.window(target, booking);
      if (
        !transition.next.validity ||
        window.start === null ||
        window.end === null ||
        window.start < Date.parse(transition.next.validity.starts) ||
        window.end > Date.parse(transition.next.validity.ends)
      )
        throw new BookingError(
          422,
          'The redeemed booking must fit entirely within the accepted plan validity.',
          'entitlement_expired',
        );
      if (
        booking.quantity !== undefined &&
        (!Number.isSafeInteger(booking.quantity) || booking.quantity < 1)
      )
        throw new BookingError(
          422,
          'Child quantity must be a positive exact integer.',
          'invalid_input',
        );
      const quantity =
        typeof booking.quantity === 'number' &&
        Number.isSafeInteger(booking.quantity) &&
        booking.quantity > 0
          ? booking.quantity
          : 1;
      if (effect.type === 'redeem') {
        let expectedUsage: number;
        if (['visit', 'session', 'place', 'admission', 'unit'].includes(effect.unit))
          expectedUsage = quantity * 10 ** effect.scale;
        else if (effect.unit === 'minute')
          expectedUsage = ((window.end - window.start) / 60000) * quantity * 10 ** effect.scale;
        else if (effect.unit === 'hour')
          expectedUsage = ((window.end - window.start) / 3600000) * quantity * 10 ** effect.scale;
        else
          throw new BookingError(
            422,
            'This credit unit has no explicit supported redemption conversion.',
            'entitlement_unit_unsupported',
          );
        if (!Number.isSafeInteger(expectedUsage) || expectedUsage !== effect.quantityMinor)
          throw new BookingError(
            422,
            'Credit usage must exactly match the actual booking quantity and duration.',
            'entitlement_usage_mismatch',
          );
      }
      const resources = await c.selectedResources(target, booking, identity, req);
      const business = await c.business(identity, req);
      if (c.sourceConfirmationRequired(business.configuration))
        throw new BookingError(
          409,
          'The target booking requires confirmation from its source.',
          'source_confirmation_required',
        );
      c.validateCapacity(target, resources, quantity, business.configuration);
      await c.assertReady(identity, target, resources, req);
      const pricing = c.price(
        { ...target, nexg: { ...target.nexg, priceMinor: 0, reservationFee: undefined } },
        window.start,
        window.end,
        quantity,
      );
      const metadata = {
        publicId: c.publicId(),
        offeringId: target.publicId,
        offeringName: target.name,
        model: target.nexg.model,
        parentBookingId: parent.publicId,
        entitlementId: parent.publicId,
        entitlementOccurrenceKey: effect.occurrenceKey,
        entitlementValidity: structuredClone(transition.next.validity),
        recordRole: 'entitlement_redemption',
        resourceIds: resources.map((r) => r.publicId),
        customer: n.customer,
        trip: booking.trip,
        customerLocation: booking.customerLocation,
        customerTokenHash: n.customerTokenHash,
        startTime: new Date(window.start).toISOString(),
        endTime: new Date(window.end).toISOString(),
        quantity,
        version: 1,
        status: 'confirmed',
        executionMode: 'native_reservation',
        pricing,
        pricingBasis: pricing.basis,
        priceMinor: 0,
        currency: 'KES',
        paymentState: 'covered_by_entitlement',
        requiresPayment: false,
        quantityScale: target.nexg.quantityScale ?? 0,
        capacityUnit: target.nexg.capacityUnit,
        locationId: target.nexg.locationId,
        configurationRevision: business.configuration?.revision,
        acceptedConfiguration: structuredClone(business.configuration),
        acceptedPricing: { pricingBasis: target.nexg.pricingBasis ?? 'per_booking', priceMinor: 0 },
        acceptedReservationFee: { mode: 'no_fee' },
        acceptedPolicies: {
          paymentPolicyId: 'NO_PREPAYMENT_V1',
          changePolicyId: 'CHANGE_BEFORE_START_V1',
          version: 1,
        },
        entitlementDebit:
          effect.type === 'redeem'
            ? {
                creditId: effect.creditId,
                quantityMinor: effect.quantityMinor,
                unit: effect.unit,
                scale: effect.scale,
                occurrenceKey: effect.occurrenceKey,
              }
            : undefined,
      };
      const child = await c.allocate(identity, req, target, resources, booking, metadata);
      redemptions.push({
        bookingId: child.publicId,
        occurrenceKey: effect.occurrenceKey,
        offeringId: target.publicId,
        startTime: metadata.startTime,
        endTime: metadata.endTime,
        ...(effect.type === 'redeem'
          ? {
              creditId: effect.creditId,
              quantityMinor: effect.quantityMinor,
              unit: effect.unit,
              scale: effect.scale,
            }
          : {}),
      });
    }
  }
  const state = transition.next.state;
  if (transition.next.model !== 'SERVICE_JOB' && transition.next.custody === 'held')
    for (const allocation of allocations.filter((a) => a.status === 'confirmed')) {
      const child = await c.own('reservations', allocation.id, identity, req);
      if (
        transition.next.model === 'LINKED_WINDOWS' &&
        allocation.role === 'incoming' &&
        command === 'ReceiveForProcessing'
      ) {
        await c.update(
          'reservations',
          child.id,
          {
            status: 'completed',
            nexg: {
              ...child.nexg,
              status: 'completed',
              custodyState: 'released',
              version: child.nexg.version + 1,
            },
          },
          identity,
          req,
        );
        allocation.status = 'completed';
      } else {
        await c.update(
          'reservations',
          child.id,
          { nexg: { ...child.nexg, custodyState: 'in_use' } },
          identity,
          req,
        );
      }
    }
  const sessionRows = await c.all('booking-sessions', identity, req);
  const reservationRows = await c.all('reservations', identity, req);
  for (const allocation of allocations.filter((a) => a.role === 'tour_departure')) {
    const child = reservationRows.find((row) => row.publicId === allocation.id);
    const occurrence = sessionRows.find((row) => String(row.id) === String(child?.nexg?.sessionId));
    const anchor = occurrence
      ? reservationRows.find((row) => String(row.id) === String(occurrence.reservationId))
      : undefined;
    if (!anchor) continue;
    if (transition.next.custody === 'held' && anchor.status === 'confirmed')
      await c.update(
        'reservations',
        anchor.id,
        { nexg: { ...anchor.nexg, custodyState: 'in_use' } },
        identity,
        req,
      );
    if (
      transition.next.custody === 'released' &&
      !reservationRows.some(
        (row) =>
          String(row.nexg?.sessionId) === String(occurrence!.id) &&
          row.nexg?.recordRole !== 'session_allocation' &&
          ['held', 'confirmed'].includes(row.status),
      )
    )
      await c.update(
        'reservations',
        anchor.id,
        { status: 'completed', nexg: { ...anchor.nexg, custodyState: 'released' } },
        identity,
        req,
      );
  }
  const status =
    transition.next.model === 'SERVICE_JOB'
      ? ((
          {
            COMPLETED: 'completed',
            CANCELLED: 'cancelled',
            EXPIRED: 'expired',
            DIAGNOSIS: 'in_progress',
            IN_SERVICE: 'in_progress',
            QUALITY_REVIEW: 'in_progress',
            INTAKE_SCHEDULED: 'confirmed',
            WORK_SCHEDULED: 'confirmed',
            READY_FOR_RELEASE: 'accepted',
            RELEASED: 'accepted',
          } as Record<string, string>
        )[state] ?? 'pending')
      : ['COMPLETED', 'CLOSED'].includes(state)
        ? 'completed'
        : state === 'CANCELLED'
          ? 'cancelled'
          : state === 'EXPIRED'
            ? 'expired'
            : [
                  'ON_TOUR',
                  'PROCESSING',
                  'IN_PRODUCTION',
                  'IN_TRANSIT',
                  'COLLECTED',
                  'CLEARANCE_REVIEW',
                  'CLEARED',
                  'AT_DESTINATION',
                ].includes(state)
              ? 'in_progress'
              : ['ACTIVE', 'PAUSED'].includes(state)
                ? 'accepted'
                : allocations.some((a) => a.status === 'confirmed')
                  ? 'confirmed'
                  : 'pending';
  const result = await c.update(
    'booking-requests',
    parent.id,
    {
      nexg: {
        ...n,
        ...(proposedPricing
          ? {
              pricing: proposedPricing,
              priceMinor: proposedPricing.totalMinor,
              unitPriceMinor: input.serviceSubtotalMinor,
              pricingBasis: 'per_booking',
              proposedQuote,
              requiresPayment: proposedPricing.dueNowMinor > 0,
              paymentState: proposedPricing.dueNowMinor > 0 ? 'awaiting_payment' : 'not_required',
              acceptedPricing: {
                pricingBasis: 'per_booking',
                priceMinor: input.serviceSubtotalMinor,
              },
            }
          : {}),
        specialistState: transition.next,
        specialistAllocations: allocations,
        entitlementRedemptions: redemptions,
        status,
        workState: status === 'in_progress' ? 'in_progress' : undefined,
        refundState: status === 'cancelled' && n.paidMinor > 0 ? 'review_required' : n.refundState,
        version: n.version + 1,
      },
    },
    identity,
    req,
  );
  await c.audit(identity, req, 'booking.specialist.' + command, parent.publicId, {
    state,
    version: n.version + 1,
  });
  return result;
}
