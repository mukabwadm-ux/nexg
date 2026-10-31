import { describe, expect, it } from 'vitest';
import {
  evaluatePredicate,
  getApplicableBookingQuestions,
  getBookingProfile,
  getQuestionSchema,
  listBookingModels,
  listBookingProfiles,
  normalizeBookingAnswers,
  registerBookingCategory,
  resolveBookingConfiguration,
  validateBookingAnswer,
  validateQuestionSchemas,
  validateReservationFeePolicy,
} from '../src/index';
import type { BookingModel, ResolveBookingInput } from '../src/index';
import type { SpecialistSetup } from '../src/specialists';

function specialistReadinessSetup(model: string): SpecialistSetup | undefined {
  const base = { version: 1, supplierComponents: [] };
  switch (model) {
    case 'SERVICE_JOB':
      return {
        ...base,
        model,
        jobSchedulingMode: 'queue',
        assessmentMode: 'fixed_scope',
        resourceIds: ['resource-model'],
        durationMinutes: 60,
        partsRequired: false,
        partsEvidenceKind: 'authorized_manual_reference',
        custodyMode: 'customer_retains',
        custodyResourceIds: [],
        custodyDurationMinutes: 1440,
      };
    case 'TOUR':
      return {
        ...base,
        model,
        mode: 'private',
        itinerary: 'Accepted local tour',
        itineraryVersion: 1,
        resourceIds: ['resource-model'],
        minimumParticipants: 1,
        maximumParticipants: 10,
      };
    case 'LINKED_WINDOWS':
      return {
        ...base,
        model,
        promiseMode: 'FIRM_PRE_ACCEPTED',
        incomingMethod: 'CUSTOMER_DROPOFF',
        outgoingMethod: 'CUSTOMER_COLLECTION',
        incomingResourceIds: [],
        outgoingResourceIds: [],
        processingResourceId: 'specialist-pool',
        processingUnit: 'kg',
        quantityScale: 0,
        minimumProcessingMinutes: 60,
        maximumProcessingMinutes: 240,
        calendarBasis: 'elapsed',
        workingDays: [1],
        opens: '08:00',
        closes: '17:00',
      };
    case 'PRODUCTION_DUE':
      return {
        ...base,
        model,
        capacityPoolId: 'specialist-pool',
        capacityUnit: 'job',
        quantityScale: 0,
        preparationLeadMinutes: 60,
        cutoffLocalTime: '17:00',
        workingDays: [1],
        approvalMode: 'required',
        handoffResourceIds: [],
      };
    case 'ENTITLEMENT':
      return {
        ...base,
        model,
        planId: 'plan-model',
        planVersion: 1,
        scopeOfferingIds: ['offering-model'],
        validity: { mode: 'absolute_dates', starts: '2026-11-01', ends: '2026-12-01' },
        credits: [],
        renewal: 'none',
        creditCancellation: 'nonrefundable',
      };
    case 'FREIGHT':
      return {
        ...base,
        model,
        legs: [
          {
            id: 'local-leg',
            origin: 'Nairobi',
            destination: 'Mombasa',
            resourceIds: ['resource-model'],
            dimensions: [
              { resourceId: 'specialist-pool', unit: 'kg', scale: 0 },
              { resourceId: 'specialist-volume', unit: 'cbm', scale: 2 },
            ],
          },
        ],
        requiresDocuments: false,
        requiresClearance: false,
        finalMode: 'delivery',
      };
  }
}

function readyAppointment(): ResolveBookingInput {
  return {
    subcategoryId: 'makeup',
    answers: { booking_required: false },
    scope: { businessId: 'business-a', activityId: 'makeup', offeringId: 'service-a' },
    offering: {
      id: 'service-a',
      name: 'Makeup appointment',
      model: 'APPOINTMENT',
      kind: 'service',
      method: 'merchant_location',
      bookingEnabled: true,
      durationMinutes: 60,
      resourceIds: ['artist-a'],
      leadTimeMinutes: 0,
      horizonDays: 30,
      intakeMode: 'merchant_approval',
      buffers: { beforeMinutes: 0, afterMinutes: 15 },
      policy: { paymentPolicyId: 'no-prepayment', changePolicyId: 'standard-changes', version: 1 },
      authority: [
        {
          data_class: 'reservations',
          authority: 'NEXG_AUTHORITATIVE',
          owner_reference: 'nexg-booking',
          scope: { business_id: 'business-a' },
        },
      ],
    },
    resources: [
      { id: 'artist-a', active: true, hasSchedule: true, kind: 'staff', locationId: 'location-a' },
    ],
  };
}

describe('reconciled source inventory', () => {
  it('preserves every category and subtype with registered question and model bindings', () => {
    const profiles = listBookingProfiles();
    expect(profiles).toHaveLength(128);
    expect(new Set(profiles.map((profile) => profile.categoryId)).size).toBe(21);
    expect(new Set(profiles.map((profile) => profile.subcategoryId)).size).toBe(128);
    const models = new Set(listBookingModels().map((model) => model.id));
    for (const profile of profiles) {
      expect(models.has(profile.defaultModelId)).toBe(true);
      expect(profile.candidateModels.every((model) => models.has(model))).toBe(true);
      const result = resolveBookingConfiguration({ subcategoryId: profile.subcategoryId });
      expect(result.timezone).toBe('Africa/Nairobi');
      expect(result.activeModels).toEqual([]);
      expect(result.isReady).toBe(false);
      expect(result.createsWork).toBe(false);
      for (const question of getApplicableBookingQuestions({
        subcategoryId: profile.subcategoryId,
      }))
        expect(getQuestionSchema(question.id)).toBeDefined();
    }
  });
  it('compiles all 323 canonical schemas', () => {
    expect(validateQuestionSchemas()).toEqual({ count: 323, errors: [] });
  });
  it('returns copies, so consumers cannot modify global summaries', () => {
    const profile = getBookingProfile('car_rental')!;
    profile.candidateModels.length = 0;
    expect(getBookingProfile('car_rental')!.candidateModels.length).toBeGreaterThan(0);
  });
});

describe('all-model operational readiness', () => {
  it('has an attainable readiness path for every implemented model using real selected facts', () => {
    const typedPolicies = {
      BQ_SPACE_POLICY: {
        spaces: [
          {
            resource_id: 'resource-model',
            minimum_party_size: 1,
            maximum_party_size: 10,
            active: true,
          },
        ],
        combinations: [],
        turnover_minutes: 0,
      },
      BQ_PRODUCTION_POLICY: {
        capacity_pool_id: 'resource-model',
        capacity_unit: 'job',
        preparation_lead_minutes: 60,
        cutoff_local_time: '17:00',
        working_days: ['mon'],
        approval_mode: 'required',
        change_policy_ref: { policy_id: 'CHANGE_BEFORE_START_V1', version: 1 },
      },
      BQ_PICKUP_RETURN_POLICY: {
        collection_rule_ref: { rule_id: 'collection', version: 1 },
        return_rule_ref: { rule_id: 'return', version: 1 },
        minimum_processing_minutes: 60,
        maximum_processing_minutes: 240,
        processing_capacity_ref: { rule_id: 'processing', version: 1 },
        calendar_basis: 'elapsed',
        collection_mode: 'CUSTOMER_DROPOFF',
        return_mode: 'CUSTOMER_COLLECTION',
      },
      BQ_SUPPLIER_POLICY: {
        components: [
          {
            component_id: 'native-component',
            description: 'Merchant-provided capacity',
            owner_reference: 'business-model',
            authority_binding_id: 'owned-work',
            confirmation_required: false,
            confirmation_evidence_kind: 'authorized_manual_reference',
          },
        ],
        commitment_rule: 'all_required_confirmed',
      },
      BQ_ENTITLEMENT_POLICY: {
        plan_id: 'plan-model',
        version: 1,
        scope_offering_ids: ['offering-model'],
        validity: { mode: 'absolute_dates', starts: '2026-11-01', ends: '2026-12-01' },
        credits: [],
        usage_policy_ref: { policy_id: 'usage', version: 1 },
        renewal: 'none',
      },
    };
    for (const model of listBookingModels()) {
      const specialistSetup = specialistReadinessSetup(model.id);
      const specialistResources =
        specialistSetup?.model === 'FREIGHT'
          ? [
              {
                id: 'specialist-pool',
                active: true,
                hasSchedule: true,
                capacity: 1000,
                capacityUnit: 'kg',
                quantityScale: 0,
                capacityMode: 'per-guest' as const,
              },
              {
                id: 'specialist-volume',
                active: true,
                hasSchedule: true,
                capacity: 200,
                capacityUnit: 'cbm',
                quantityScale: 2,
                capacityMode: 'per-guest' as const,
              },
            ]
          : specialistSetup?.model === 'LINKED_WINDOWS' ||
              specialistSetup?.model === 'PRODUCTION_DUE'
            ? [
                {
                  id: 'specialist-pool',
                  active: true,
                  hasSchedule: true,
                  capacity: 100,
                  capacityUnit: specialistSetup.model === 'LINKED_WINDOWS' ? 'kg' : 'job',
                  quantityScale: 0,
                  capacityMode: 'per-guest' as const,
                },
              ]
            : [];
      const id = `readiness_${model.id.toLowerCase()}`;
      expect(
        registerBookingCategory(
          {
            categoryId: 'readiness_test',
            categoryName: 'Readiness test',
            subcategoryId: id,
            name: model.label,
            modelId: model.id,
            questionIds: [],
            description: 'Explicit supported implementation test.',
          },
          [model.id],
        ).registered,
      ).toBe(true);
      const result = resolveBookingConfiguration({
        subcategoryId: id,
        canonicalAnswers: typedPolicies,
        offering: {
          id: 'offering-model',
          model: model.id,
          bookingEnabled: true,
          intakeMode: model.allowedIntakeModes[0],
          resourceIds: ['resource-model', ...specialistResources.map((resource) => resource.id)],
          specialistSetup,
          durationMinutes: 60,
          minDurationMinutes: 60,
          maxDurationMinutes: 1440,
          leadTimeMinutes: 0,
          horizonDays: 90,
          buffers: { beforeMinutes: 0, afterMinutes: 0 },
          capacity: 10,
          capacityUnit: 'person',
          serviceAreaConfigured: true,
          travelConfigured: true,
          policy: {
            paymentPolicyId: 'NO_PREPAYMENT_V1',
            changePolicyId: 'CHANGE_BEFORE_START_V1',
            version: 1,
          },
          authority: ['reservations', 'work_items'].map((data_class) => ({
            data_class,
            authority: 'NEXG_AUTHORITATIVE',
            owner_reference: 'nexg-test',
          })),
        },
        resources: [
          {
            id: 'resource-model',
            active: true,
            hasSchedule: true,
            capacity: 10,
            capacityUnit: 'person',
          },
          ...specialistResources,
        ],
      });
      expect({
        model: model.id,
        missing: result.missingInputs,
        invalid: result.invalidInputs,
        clarifications: result.clarifications,
      }).toEqual({ model: model.id, missing: [], invalid: [], clarifications: [] });
      expect(result.primaryModel).toBe(model.id);
      expect(result.canConfirmNative).toBe(true);
    }
  });
  it('cannot replace missing actual resources, duration or runtime policy with valid onboarding text', () => {
    const input = readyAppointment();
    input.offering!.durationMinutes = undefined;
    input.offering!.resourceIds = [];
    input.offering!.policy = undefined;
    input.canonicalAnswers = { Q_APPOINTMENT_DURATION_MINUTES: 60 };
    const result = resolveBookingConfiguration(input);
    expect(result.isReady).toBe(false);
    expect(result.missingInputs.map((value) => value.questionId)).toEqual(
      expect.arrayContaining([
        'Q_APPOINTMENT_DURATION_MINUTES',
        'Q_RESOURCE_INVENTORY',
        'BQ_PAYMENT_POLICY',
        'BQ_CHANGE_POLICY',
      ]),
    );
  });
  it('uses the actual supported intake mode for a conditional gym appointment without requiring duplicate onboarding text', () => {
    const input = readyAppointment();
    input.subcategoryId = 'gym';
    input.scope = { ...input.scope, activityId: 'gym' };
    input.answers = { personal_training_available: true };
    input.offering!.intakeMode = 'instant_after_requirements';
    const ready = resolveBookingConfiguration(input);
    expect(ready.primaryModel).toBe('APPOINTMENT');
    expect(ready.missingInputs).toEqual([]);
    expect(ready.canConfirmNative).toBe(true);
    input.offering!.intakeMode = 'plan_enrolment';
    const invalid = resolveBookingConfiguration(input);
    expect(invalid.canConfirmNative).toBe(false);
    expect(invalid.clarifications).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'INVALID_INTAKE_MODE' })]),
    );
    input.offering!.intakeMode = undefined;
    input.canonicalAnswers = { BQ_INTAKE_MODE: 'instant_after_requirements' };
    expect(resolveBookingConfiguration(input).missingInputs).toEqual(
      expect.arrayContaining([expect.objectContaining({ questionId: 'BQ_INTAKE_MODE' })]),
    );
  });
  it('keeps actual car-wash bay work under SERVICE_JOB and distinguishes a disabled advance-booking promise from queue execution', () => {
    const specialistSetup = specialistReadinessSetup('SERVICE_JOB')!;
    const input: ResolveBookingInput = {
      subcategoryId: 'car_wash',
      offering: {
        model: 'SERVICE_JOB',
        specialistSetup,
        resourceIds: ['resource-model'],
        intakeMode: 'walk_in_only',
        bookingEnabled: false,
        leadTimeMinutes: 0,
        horizonDays: 90,
        policy: {
          paymentPolicyId: 'NO_PREPAYMENT_V1',
          changePolicyId: 'CHANGE_BEFORE_START_V1',
          version: 1,
        },
        authority: ['reservations', 'work_items'].map((data_class) => ({
          data_class,
          authority: 'NEXG_AUTHORITATIVE',
          owner_reference: 'nexg-job',
        })),
      },
      resources: [{ id: 'resource-model', active: true, hasSchedule: true, kind: 'space' }],
    };
    const queue = resolveBookingConfiguration(input);
    expect(queue.primaryModel).toBe('SERVICE_JOB');
    expect(queue.models).not.toContain('APPOINTMENT');
    expect(queue.missingInputs).toEqual([]);
    expect(queue.canConfirmNative).toBe(true);
    input.offering!.specialistSetup = { ...specialistSetup, jobSchedulingMode: 'scheduled_work' };
    expect(resolveBookingConfiguration(input).canConfirmNative).toBe(false);
    input.offering!.bookingEnabled = true;
    input.offering!.intakeMode = 'merchant_approval';
    expect(resolveBookingConfiguration(input).canConfirmNative).toBe(true);
    input.resources![0]!.active = false;
    expect(resolveBookingConfiguration(input).canConfirmNative).toBe(false);
    input.resources![0]!.active = true;
    input.offering!.method = 'customer_location';
    expect(resolveBookingConfiguration(input).missingInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SERVICE_JOB_EXECUTION_METHOD_REQUIRED' }),
      ]),
    );
  });
  it('uses explicit empty supplier scope for a local tour and independent dimensional pools for freight', () => {
    const native = (model: 'TOUR' | 'FREIGHT'): ResolveBookingInput => ({
      subcategoryId: `readiness_${model.toLowerCase()}`,
      offering: {
        model,
        specialistSetup: specialistReadinessSetup(model),
        resourceIds:
          model === 'TOUR'
            ? ['resource-model']
            : ['resource-model', 'specialist-pool', 'specialist-volume'],
        intakeMode: 'merchant_approval',
        bookingEnabled: true,
        leadTimeMinutes: 0,
        horizonDays: 90,
        minDurationMinutes: 1,
        maxDurationMinutes: 1440,
        capacity: model === 'TOUR' ? 10 : undefined,
        capacityUnit: model === 'TOUR' ? 'place' : undefined,
        policy: {
          paymentPolicyId: 'NO_PREPAYMENT_V1',
          changePolicyId: 'CHANGE_BEFORE_START_V1',
          version: 1,
        },
        authority: ['reservations', 'work_items'].map((data_class) => ({
          data_class,
          authority: 'NEXG_AUTHORITATIVE',
          owner_reference: 'nexg-booking',
        })),
      },
      resources: [
        { id: 'resource-model', active: true, hasSchedule: true, kind: 'vehicle' },
        {
          id: 'specialist-pool',
          active: true,
          hasSchedule: true,
          capacityMode: 'per-guest',
          capacity: 5000,
          capacityUnit: 'kg',
          quantityScale: 0,
        },
        {
          id: 'specialist-volume',
          active: true,
          hasSchedule: true,
          capacityMode: 'per-guest',
          capacity: 2000,
          capacityUnit: 'cbm',
          quantityScale: 2,
        },
      ],
    });
    const tour = resolveBookingConfiguration(native('TOUR'));
    expect(tour.missingInputs).toEqual([]);
    expect(tour.canConfirmNative).toBe(true);
    const freightInput = native('FREIGHT');
    expect(resolveBookingConfiguration(freightInput).canConfirmNative).toBe(true);
    freightInput.resources![2]!.capacityUnit = 'kg';
    expect(resolveBookingConfiguration(freightInput).missingInputs).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SPECIALIST_RESOURCE_SETUP' })]),
    );
    freightInput.resources![2]!.capacityUnit = 'cbm';
    freightInput.offering!.authority![1]!.authority = 'EXTERNAL_AUTHORITATIVE';
    expect(resolveBookingConfiguration(freightInput).canConfirmNative).toBe(false);
    freightInput.offering!.specialistSetup = undefined;
    expect(resolveBookingConfiguration(freightInput).missingInputs).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SPECIALIST_SETUP_REQUIRED' })]),
    );
  });
});

describe('merchant reservation fee terms', () => {
  const base = {
    treatment: 'credited_to_total',
    requiredBeforeConfirmation: true,
    refundTerms: 'Refundable until the accepted cancellation deadline.',
  } as const;
  it('requires exact fixed/percentage terms and an actual collection policy', () => {
    expect(
      validateReservationFeePolicy(
        { ...base, mode: 'fixed', amountMinor: 50000 },
        'MANUAL_COLLECTION_V1',
      ),
    ).toEqual([]);
    expect(
      validateReservationFeePolicy(
        { ...base, mode: 'percentage', percentageBps: 2500, treatment: 'applied_in_addition' },
        'MANUAL_COLLECTION_V1',
      ),
    ).toEqual([]);
    expect(
      validateReservationFeePolicy(
        { ...base, mode: 'fixed', amountMinor: 50000 },
        'NO_PREPAYMENT_V1',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateReservationFeePolicy(
        { ...base, mode: 'fixed', amountMinor: 0 },
        'MANUAL_COLLECTION_V1',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateReservationFeePolicy(
        { ...base, mode: 'percentage', percentageBps: 10001 },
        'MANUAL_COLLECTION_V1',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateReservationFeePolicy(
        { ...base, mode: 'percentage', percentageBps: 1000, amountMinor: 50000 },
        'MANUAL_COLLECTION_V1',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateReservationFeePolicy({ ...base, mode: 'no_fee' }, 'MANUAL_COLLECTION_V1').length,
    ).toBeGreaterThan(0);
    expect(
      validateReservationFeePolicy(
        { ...base, mode: 'no_fee', requiredBeforeConfirmation: false },
        'NO_PREPAYMENT_V1',
      ),
    ).toEqual([]);
  });
  it('changes the configuration revision and blocks invalid fee-gated readiness', () => {
    const input = readyAppointment();
    const initial = resolveBookingConfiguration(input);
    input.offering!.reservationFee = { ...base, mode: 'fixed', amountMinor: 50000 };
    const invalid = resolveBookingConfiguration(input);
    expect(invalid.canConfirmNative).toBe(false);
    expect(invalid.invalidInputs).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'INVALID_RESERVATION_FEE' })]),
    );
    expect(invalid.configurationRevision).not.toBe(initial.configurationRevision);
    input.offering!.policy!.paymentPolicyId = 'MANUAL_COLLECTION_V1';
    expect(resolveBookingConfiguration(input).isReady).toBe(true);
    // This is offering setup readiness, never evidence of payment or acceptance on a booking.
  });
});

describe('typed scoped answers', () => {
  it('does not turn missing, zero or strings into false boolean answers', () => {
    expect(evaluatePredicate({ path: 'x', op: 'neq', value: false }, {})).toBeUndefined();
    expect(evaluatePredicate({ path: 'x', op: 'eq', value: false }, { x: 0 })).toBe(false);
    expect(validateBookingAnswer('Q_BOOKING_REQUIRED', 'no')).toMatchObject({
      valid: true,
      value: false,
    });
    expect(validateBookingAnswer('BQ_BOOKING_ENABLED', 'false').valid).toBe(false);
    expect(validateBookingAnswer('Q_APPOINTMENT_DURATION_MINUTES', 0).valid).toBe(false);
  });
  it('maps old and new aliases to one fact and preserves conflicts', () => {
    const result = normalizeBookingAnswers({
      subcategoryId: 'makeup',
      bookingSetup: { booking_enabled: true, accepts_scheduled_bookings: false },
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONFLICTING_ANSWERS', questionId: 'BQ_BOOKING_ENABLED' }),
      ]),
    );
    expect(result.values['booking.accepts_scheduled_bookings']).toBeUndefined();
  });
  it('cannot import another business or offering answer into this scope', () => {
    const result = normalizeBookingAnswers({
      subcategoryId: 'makeup',
      scope: { businessId: 'a', activityId: 'makeup', offeringId: 'one' },
      answerRecords: [
        {
          questionId: 'BQ_BOOKING_ENABLED',
          value: true,
          scope: { businessId: 'b', activityId: 'makeup', offeringId: 'one' },
        },
        {
          questionId: 'BQ_BOOKING_ENABLED',
          value: true,
          scope: { businessId: 'a', activityId: 'makeup', offeringId: 'two' },
        },
      ],
    });
    expect(result.answers.BQ_BOOKING_ENABLED).toBeUndefined();
  });
  it('keeps capacity person conversion exact and rejects false unit equivalence', () => {
    expect(validateBookingAnswer('Q_CAPACITY_LIMIT', 12)).toMatchObject({
      valid: true,
      value: { quantity_minor: 12, scale: 0, unit: 'person' },
    });
    expect(
      validateBookingAnswer('Q_CAPACITY_LIMIT', { quantity_minor: 12, scale: 0, unit: 'sqm' })
        .valid,
    ).toBe(false);
  });
  it('restricts source authority to canonical leaves and separates finance powers', () => {
    const base = {
      authority: 'NEXG_AUTHORITATIVE',
      owner_reference: 'booking',
      scope: { business_id: 'a' },
    };
    expect(
      validateBookingAnswer('Q_DATA_AUTHORITY', [{ ...base, data_class: 'capacity' }]).valid,
    ).toBe(false);
    expect(
      validateBookingAnswer('Q_DATA_AUTHORITY', [{ ...base, data_class: 'payments' }]),
    ).toMatchObject({ valid: true, value: [{ ...base, data_class: 'finance.payment' }] });
    expect(
      validateBookingAnswer('Q_DATA_AUTHORITY', [
        { ...base, data_class: 'reservations', authority: 'SHARED_WITH_RULES' },
      ]).valid,
    ).toBe(false);
  });
  it('rejects an overnight overlap, reversed ranges and unbounded recurrence', () => {
    expect(
      validateBookingAnswer('Q_WEEKLY_SCHEDULE', {
        timezone: 'Africa/Nairobi',
        weekly: [
          { day: 'mon', intervals: [{ opens: '22:00', closes: '02:00', closes_next_day: true }] },
          { day: 'tue', intervals: [{ opens: '01:00', closes: '03:00', closes_next_day: false }] },
        ],
        exceptions: [],
      }).valid,
    ).toBe(false);
    expect(
      validateBookingAnswer('BQ_RANGE_POLICY', {
        minimum: { value: 2, unit: 'day' },
        maximum: { value: 1, unit: 'day' },
        calendar_basis: 'elapsed',
        billing_policy_ref: { policy_id: 'p', version: 1 },
      }).valid,
    ).toBe(false);
    expect(
      validateBookingAnswer('BQ_RECURRENCE_RULE', {
        frequency: 'daily',
        interval: 1,
        start_date: '2026-11-01',
        exception_dates: [],
      }).valid,
    ).toBe(false);
  });
});

describe('merchant-specific configuration behavior', () => {
  it('keeps optional appointments even when advance booking is not mandatory', () => {
    const result = resolveBookingConfiguration(readyAppointment());
    expect(result.primaryModel).toBe('APPOINTMENT');
    expect(result.isReady).toBe(true);
    expect(result.canConfirmNative).toBe(true);
    expect(result.status).toBe('CONFIGURED');
  });
  it('does not trust a profile or arbitrary ready flag as an active offering', () => {
    const result = resolveBookingConfiguration({
      subcategoryId: 'makeup',
      offeringModel: 'APPOINTMENT',
      ...({ offering_setup_complete: true, required_authority_resolved: true } as object),
    });
    expect(result.isReady).toBe(false);
    expect(result.activeModels).toEqual([]);
  });
  it('blocks inconsistent mandatory-versus-accepted booking answers', () => {
    const result = resolveBookingConfiguration({
      ...readyAppointment(),
      answers: { booking_required: true },
      bookingSetup: { accepts_scheduled_bookings: false },
    });
    expect(result.status).toBe('CLARIFICATION_REQUIRED');
  });
  it('does not retain a clinic appointment that was explicitly disabled', () => {
    const result = resolveBookingConfiguration({
      subcategoryId: 'clinics',
      offeringModel: 'APPOINTMENT',
      answers: { appointment_booking: false },
    });
    expect(result.models).not.toContain('APPOINTMENT');
  });
  it('replaces mobile battery work with a workshop job on the selected mode', () => {
    const result = resolveBookingConfiguration({
      subcategoryId: 'battery_service',
      offeringModel: 'SERVICE_JOB',
      selectedMethod: 'merchant_location',
      selectedOfferingKind: 'service_job',
      answers: { mobile_service: false },
    });
    expect(result.primaryModel).toBe('SERVICE_JOB');
    expect(result.models).not.toContain('FIELD_VISIT');
  });
  it('does not create a transfer when a rental includes a driver', () => {
    const result = resolveBookingConfiguration({
      subcategoryId: 'car_rental',
      offeringModel: 'ASSET_INTERVAL',
      selectedDriverOption: 'with_driver',
      answers: { with_driver: true },
    });
    expect(result.models).toEqual(['ASSET_INTERVAL']);
    expect(result.attributes.resourceBundle).toBe('asset_and_eligible_driver');
    expect(result.createsWork).toBe(false);
  });
  it('requires explicit table intent independently of existing systems', () => {
    expect(
      resolveBookingConfiguration({
        subcategoryId: 'restaurant',
        offeringModel: 'ORDER',
        answers: { reservation_system: true },
      }).models,
    ).toEqual(['ORDER']);
    const result = resolveBookingConfiguration({
      subcategoryId: 'restaurant',
      offeringModel: 'SPACE_RESERVATION',
      selectedOfferingKind: 'space_reservation',
      answers: { reservation_system: false },
      bookingSetup: { offers_table_reservations: true },
    });
    expect(result.primaryModel).toBe('SPACE_RESERVATION');
  });
  it('does not convert recurrence into a paid membership or special sourcing into manufacture', () => {
    expect(
      resolveBookingConfiguration({
        subcategoryId: 'classes',
        offeringModel: 'SESSION_CAPACITY',
        answers: { recurring_sessions: true },
      }).models,
    ).not.toContain('ENTITLEMENT');
    expect(
      resolveBookingConfiguration({
        subcategoryId: 'books',
        offeringModel: 'ORDER',
        answers: { custom_orders: true },
        bookingSetup: { custom_order_kind: 'special_sourcing' },
      }).models,
    ).not.toContain('PRODUCTION_DUE');
  });
  it('chooses the remote/admin workflow and refuses unsupported instant freight', () => {
    const remote = resolveBookingConfiguration({
      subcategoryId: 'mental_health',
      offeringModel: 'APPOINTMENT',
      selectedMethod: 'digital',
      answers: { session_format: 'online' },
      bookingSetup: { booking_enabled: true },
    });
    expect(
      remote.workflowBindings.some((binding) => binding.workflowId === 'WF_REMOTE_SESSION'),
    ).toBe(true);
    const bank = resolveBookingConfiguration({
      subcategoryId: 'banking',
      offeringModel: 'REQUEST_QUOTE',
    });
    expect(bank.workflowBindings[0]?.workflowId).toBe('WF_REGULATED_ENQUIRY');
    const freight = resolveBookingConfiguration({
      subcategoryId: 'road_freight',
      offering: { model: 'FREIGHT', intakeMode: 'instant_after_requirements' },
    });
    expect(freight.clarifications.some((issue) => issue.code === 'INVALID_INTAKE_MODE')).toBe(true);
  });
  it('makes revision stable for equivalent answer order, and changes it for actual configuration changes', () => {
    const a = resolveBookingConfiguration({
      ...readyAppointment(),
      answers: { booking_required: false, products_for_sale: false },
    });
    const b = resolveBookingConfiguration({
      ...readyAppointment(),
      answers: { products_for_sale: false, booking_required: false },
    });
    expect(a.configurationRevision).toBe(b.configurationRevision);
    const c = readyAppointment();
    c.offering!.durationMinutes = 90;
    expect(resolveBookingConfiguration(c).configurationRevision).not.toBe(
      resolveBookingConfiguration(readyAppointment()).configurationRevision,
    );
  });
});

describe('future category registration', () => {
  it('reuses a registered supported model and rejects arbitrary/unimplemented additions', () => {
    const definition = {
      categoryId: 'new_services',
      categoryName: 'New services',
      subcategoryId: 'bicycle_diagnostics',
      name: 'Bicycle diagnostics',
      modelId: 'APPOINTMENT' as BookingModel,
      questionIds: ['BQ_BOOKING_ENABLED'],
      description: 'A booked diagnostic assessment using an actual technician.',
    };
    expect(registerBookingCategory(definition, ['ORDER']).registered).toBe(false);
    expect(
      registerBookingCategory({ ...definition, ...({ scripts: 'ignore permissions' } as object) }, [
        'APPOINTMENT',
      ]).registered,
    ).toBe(false);
    expect(registerBookingCategory(definition, ['APPOINTMENT']).registered).toBe(true);
    expect(getBookingProfile('bicycle_diagnostics')?.defaultModelId).toBe('APPOINTMENT');
    expect(resolveBookingConfiguration({ subcategoryId: 'bicycle_diagnostics' }).isReady).toBe(
      false,
    );
  });
});
