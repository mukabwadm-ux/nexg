import {
  canonicalQuestionId,
  getQuestionSchema,
  questionDefinition,
  questions,
  registry,
  validateQuestionSchemas,
} from './registry';
import { normalizeBookingAnswers, validateBookingAnswer } from './answers';
import { evaluatePredicate, sameValue } from './predicates';
import { BOOKING_MODELS } from './types';
import {
  SPECIALIST_MODELS,
  normalizeSpecialistSetup,
  validateSpecialistResourceBindings,
  type SpecialistModel,
  type SpecialistSetup,
} from './specialists';
import { listBookingProfiles as baseProfiles, getBookingProfile as baseProfile } from './profiles';
import type {
  AuthorityBinding,
  BookingModel,
  BookingProfileSummary,
  BookingQuestion,
  ConfigIssue,
  Predicate,
  ProfileDefinition,
  ReservationFeePolicy,
  ResolveBookingInput,
  ResolvedBookingConfiguration,
  WorkflowBinding,
} from './types';
export * from './types';
export * from './specialists';
export {
  getQuestionSchema,
  validateQuestionSchemas,
  validateBookingAnswer,
  normalizeBookingAnswers,
  evaluatePredicate,
};

export const BOOKING_TIMEZONE = 'Africa/Nairobi' as const;
export const BOOKING_CURRENCY = 'KES' as const;
export const BOOKING_REGISTRY_REVISION = registry.revision;

const profileMap = new Map(registry.profiles.map((profile) => [profile.subcategoryId, profile]));
const customProfiles = new Map<string, ProfileDefinition>();
export function listBookingProfiles(): BookingProfileSummary[] {
  return [
    ...baseProfiles(),
    ...[...customProfiles.values()].map((profile) => ({
      categoryId: profile.categoryId,
      categoryName: profile.categoryName,
      subcategoryId: profile.subcategoryId,
      name: profile.name,
      defaultModelId: profile.defaultModelId,
      candidateModels: [...profile.candidateModelIds],
      specialtyNeeds: profile.specialtyNeeds,
      vocabulary: { ...profile.vocabulary },
    })),
  ];
}
export function getBookingProfile(id: string): BookingProfileSummary | undefined {
  return baseProfile(id) || listBookingProfiles().find((profile) => profile.subcategoryId === id);
}
const modelLabels: Record<BookingModel, string> = {
  ORDER: 'Orders',
  APPOINTMENT: 'Appointments',
  FIELD_VISIT: 'Customer visits',
  ASSET_INTERVAL: 'Asset rentals',
  TRANSFER: 'Transfers',
  SESSION_CAPACITY: 'Sessions and events',
  SPACE_RESERVATION: 'Table and space reservations',
  TOUR: 'Tours',
  PRODUCTION_DUE: 'Custom production',
  REQUEST_QUOTE: 'Requests and quotes',
  LINKED_WINDOWS: 'Collection and return',
  SERVICE_JOB: 'Service jobs',
  ENTITLEMENT: 'Memberships and retainers',
  FREIGHT: 'Freight',
  STORAGE: 'Storage',
};
const nonScheduling = new Set<BookingModel>([
  'ORDER',
  'REQUEST_QUOTE',
  'ENTITLEMENT',
  'PRODUCTION_DUE',
  'SERVICE_JOB',
  'FREIGHT',
]);
const modelQuestions: Record<BookingModel, string[]> = {
  ORDER: ['BQ_SCHEDULED_FULFILMENT_ENABLED', 'Q_FULFILLMENT_MODES', 'Q_DATA_AUTHORITY'],
  APPOINTMENT: [
    'BQ_BOOKING_ENABLED',
    'BQ_INTAKE_MODE',
    'Q_APPOINTMENT_DURATION_MINUTES',
    'Q_RESOURCE_INVENTORY',
    'Q_WEEKLY_SCHEDULE',
    'BQ_BUFFERS',
    'BQ_BOOKING_WINDOW',
    'Q_FULFILLMENT_MODES',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  FIELD_VISIT: [
    'BQ_BOOKING_ENABLED',
    'BQ_INTAKE_MODE',
    'Q_APPOINTMENT_DURATION_MINUTES',
    'Q_RESOURCE_INVENTORY',
    'Q_WEEKLY_SCHEDULE',
    'Q_SERVICE_AREA',
    'BQ_TRAVEL_POLICY',
    'BQ_BUFFERS',
    'BQ_BOOKING_WINDOW',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  ASSET_INTERVAL: [
    'BQ_BOOKING_ENABLED',
    'BQ_INTAKE_MODE',
    'Q_RESOURCE_INVENTORY',
    'Q_WEEKLY_SCHEDULE',
    'BQ_RANGE_POLICY',
    'BQ_BUFFERS',
    'BQ_BOOKING_WINDOW',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  TRANSFER: [
    'BQ_BOOKING_ENABLED',
    'BQ_INTAKE_MODE',
    'Q_RESOURCE_INVENTORY',
    'Q_WEEKLY_SCHEDULE',
    'Q_APPOINTMENT_DURATION_MINUTES',
    'BQ_TRAVEL_POLICY',
    'BQ_BUFFERS',
    'BQ_BOOKING_WINDOW',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  SESSION_CAPACITY: [
    'BQ_BOOKING_ENABLED',
    'BQ_INTAKE_MODE',
    'Q_RESOURCE_INVENTORY',
    'Q_WEEKLY_SCHEDULE',
    'Q_APPOINTMENT_DURATION_MINUTES',
    'BQ_CAPACITY',
    'BQ_BOOKING_WINDOW',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  SPACE_RESERVATION: [
    'BQ_OFFERS_TABLE_RESERVATIONS',
    'BQ_BOOKING_ENABLED',
    'BQ_INTAKE_MODE',
    'BQ_SPACE_POLICY',
    'Q_RESOURCE_INVENTORY',
    'Q_WEEKLY_SCHEDULE',
    'Q_APPOINTMENT_DURATION_MINUTES',
    'BQ_BUFFERS',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  TOUR: [
    'BQ_BOOKING_ENABLED',
    'BQ_INTAKE_MODE',
    'Q_RESOURCE_INVENTORY',
    'Q_WEEKLY_SCHEDULE',
    'BQ_CAPACITY',
    'BQ_RANGE_POLICY',
    'BQ_SUPPLIER_POLICY',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  PRODUCTION_DUE: [
    'BQ_INTAKE_MODE',
    'BQ_CUSTOM_ORDER_KIND',
    'BQ_PRODUCTION_POLICY',
    'BQ_CAPACITY',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  REQUEST_QUOTE: ['BQ_INTAKE_MODE', 'Q_DATA_AUTHORITY', 'BQ_SUPPLIER_POLICY'],
  LINKED_WINDOWS: [
    'BQ_INTAKE_MODE',
    'BQ_PICKUP_RETURN_POLICY',
    'BQ_FULFILMENT_WINDOWS',
    'Q_RESOURCE_INVENTORY',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  SERVICE_JOB: [
    'BQ_INTAKE_MODE',
    'Q_RESOURCE_INVENTORY',
    'Q_WEEKLY_SCHEDULE',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  ENTITLEMENT: [
    'BQ_MEMBERSHIP_PLAN_ENABLED',
    'BQ_ENTITLEMENT_POLICY',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
  ],
  FREIGHT: [
    'BQ_INTAKE_MODE',
    'BQ_CAPACITY',
    'BQ_SUPPLIER_POLICY',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
  STORAGE: [
    'BQ_BOOKING_ENABLED',
    'BQ_INTAKE_MODE',
    'Q_RESOURCE_INVENTORY',
    'BQ_CAPACITY',
    'BQ_RANGE_POLICY',
    'Q_DATA_AUTHORITY',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
  ],
};

export function listBookingModels() {
  return registry.models.map((model) => ({
    ...model,
    label: modelLabels[model.id],
    description: model.requiredSetup.join('; '),
    needsScheduling: !nonScheduling.has(model.id),
    allowedIntakeModes: [...registry.intakeByModel[model.id].allowedModes],
  }));
}
function issue(
  questionId: string | undefined,
  message: string,
  code = 'MISSING_SETUP',
  severity: ConfigIssue['severity'] = 'required',
): ConfigIssue {
  return { code, message, questionId, severity };
}
function uniqueIssues(issues: ConfigIssue[]): ConfigIssue[] {
  const seen = new Set<string>();
  return issues.filter((value) => {
    const key = `${value.code}:${value.questionId || value.field || ''}:${value.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function fingerprint(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of stable(value))
    hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 0x100000001b3n);
  return `${registry.revision}:${hash.toString(16).padStart(16, '0')}`;
}
function profileFor(id: string): ProfileDefinition {
  const profile = profileMap.get(id) || customProfiles.get(id);
  if (!profile) throw new Error(`Unregistered booking subcategory: ${id}`);
  return profile;
}
function collectQuestions(predicate: Predicate): string[] {
  if ('all' in predicate) return predicate.all.flatMap(collectQuestions);
  if ('any' in predicate) return predicate.any.flatMap(collectQuestions);
  return predicate.questionId ? [predicate.questionId] : [];
}
function structuralValues(
  input: ResolveBookingInput,
  values: Record<string, unknown>,
  profile: ProfileDefinition,
): Record<string, unknown> {
  const offering = input.offering,
    model = offering?.model || input.offeringModel;
  const method = offering?.method || input.selectedMethod || 'merchant_location';
  const kind =
    offering?.kind ||
    input.selectedOfferingKind ||
    (model === 'ORDER'
      ? 'product'
      : model === 'SPACE_RESERVATION'
        ? 'space_reservation'
        : model === 'SERVICE_JOB'
          ? 'service_job'
          : model === 'ENTITLEMENT'
            ? 'plan'
            : 'service');
  const result: Record<string, unknown> = {
    ...values,
    'context.offering_selected': model !== undefined,
    // Structural eligibility is deliberately evaluated before operational readiness.
    'context.offering_setup_complete': true,
    'context.required_authority_resolved': true,
    'context.offering_model': model,
    'context.selected_offering_kind': kind,
    'context.selected_method': method,
    'context.selected_driver_option': input.selectedDriverOption,
    'context.accepted_scope_confirmed': input.acceptedScopeConfirmed === true,
    selected_subcategory_ids: [input.subcategoryId],
    selected_category_ids: [profile.categoryId],
    'resolved.candidate_booking_models': model ? [model] : profile.candidateModelIds,
    'resolved.required_booking_question_ids': [],
    'resolved.approved_question_bindings': profile.sourceQuestionIds,
    'platform.timezone_input_enabled': false,
    'onboarding.stage': 'OPERATIONAL_SETUP',
  };
  if (
    offering?.bookingEnabled !== undefined &&
    !Object.hasOwn(result, 'booking.accepts_scheduled_bookings')
  )
    result['booking.accepts_scheduled_bookings'] = offering.bookingEnabled;
  return result;
}

function requiredSetup(
  input: ResolveBookingInput,
  primary: BookingModel | null,
  values: Record<string, unknown>,
  matchedRequired: Set<string>,
): { missing: ConfigIssue[]; native: boolean } {
  const missing: ConfigIssue[] = [],
    offering = input.offering;
  if (!offering || !primary)
    return {
      missing: [issue(undefined, 'Select and configure an actual offering.', 'OFFERING_REQUIRED')],
      native: false,
    };
  const hasValue = (id: string) => {
    const q = questionDefinition(id);
    return !!q && Object.hasOwn(values, q.canonicalTarget);
  };
  const required = (id: string, fallback: boolean, message: string) => {
    if (!hasValue(id) && !fallback) missing.push(issue(canonicalQuestionId(id), message));
  };
  const allResources = input.resources || [];
  const specialistModel = SPECIALIST_MODELS.includes(primary as SpecialistModel);
  let specialistSetup: SpecialistSetup | undefined;
  if (specialistModel) {
    try {
      specialistSetup = normalizeSpecialistSetup(
        primary as SpecialistModel,
        offering.specialistSetup,
      );
      if (
        specialistSetup.model === 'SERVICE_JOB' &&
        offering.method &&
        !['merchant_location', 'merchant_venue'].includes(offering.method)
      )
        missing.push({
          code: 'SERVICE_JOB_EXECUTION_METHOD_REQUIRED',
          field: 'method',
          message:
            'Native workshop jobs require merchant-venue execution. A customer-location job needs its separately configured field-execution workflow and travel guards.',
          severity: 'required',
        });
      for (const message of validateSpecialistResourceBindings(
        specialistSetup,
        allResources,
        offering.resourceIds ?? [],
      ))
        missing.push({
          code: 'SPECIALIST_RESOURCE_SETUP',
          field: 'specialistSetup',
          message,
          severity: 'required',
        });
    } catch (error) {
      missing.push({
        code: 'SPECIALIST_SETUP_REQUIRED',
        field: 'specialistSetup',
        message:
          error instanceof Error
            ? error.message
            : 'Configure the actual typed specialist workflow.',
        severity: 'required',
      });
    }
  }
  const selectedResources = (offering.resourceIds || []).map((id) =>
    allResources.find((resource) => resource.id === id && resource.active),
  );
  const resourcesReady = selectedResources.length > 0 && selectedResources.every(Boolean);
  const scheduleReady =
    resourcesReady && selectedResources.every((resource) => resource?.hasSchedule === true);
  const durationReady =
    Number.isSafeInteger(offering.durationMinutes) && offering.durationMinutes! > 0;
  const rangeReady =
    Number.isSafeInteger(offering.minDurationMinutes) &&
    offering.minDurationMinutes! > 0 &&
    Number.isSafeInteger(offering.maxDurationMinutes) &&
    offering.maxDurationMinutes! >= offering.minDurationMinutes!;
  const facts: Record<string, boolean> = {
    Q_APPOINTMENT_DURATION_MINUTES: durationReady,
    Q_RESOURCE_INVENTORY: resourcesReady,
    Q_WEEKLY_SCHEDULE: scheduleReady,
    BQ_RANGE_POLICY: rangeReady,
    BQ_BUFFERS:
      !!offering.buffers &&
      Number.isSafeInteger(offering.buffers.beforeMinutes) &&
      offering.buffers.beforeMinutes >= 0 &&
      Number.isSafeInteger(offering.buffers.afterMinutes) &&
      offering.buffers.afterMinutes >= 0,
    BQ_BOOKING_WINDOW:
      Number.isSafeInteger(offering.leadTimeMinutes) &&
      offering.leadTimeMinutes! >= 0 &&
      Number.isSafeInteger(offering.horizonDays) &&
      offering.horizonDays! >= 1,
    BQ_PAYMENT_POLICY: !!offering.policy?.paymentPolicyId,
    BQ_CHANGE_POLICY: !!offering.policy?.changePolicyId,
    Q_SERVICE_AREA: offering.serviceAreaConfigured === true,
    BQ_TRAVEL_POLICY: offering.travelConfigured === true,
    BQ_CAPACITY:
      Number.isSafeInteger(offering.capacity) && offering.capacity! > 0 && !!offering.capacityUnit,
    BQ_BOOKING_ENABLED: typeof offering.bookingEnabled === 'boolean',
    BQ_INTAKE_MODE:
      typeof offering.intakeMode === 'string' &&
      registry.intakeByModel[primary].allowedModes.includes(offering.intakeMode),
  };
  if (specialistModel) {
    const valid = !!specialistSetup;
    facts.BQ_PRODUCTION_POLICY = valid && primary === 'PRODUCTION_DUE';
    facts.BQ_PICKUP_RETURN_POLICY = valid && primary === 'LINKED_WINDOWS';
    facts.BQ_ENTITLEMENT_POLICY = valid && primary === 'ENTITLEMENT';
    facts.BQ_SUPPLIER_POLICY = valid && (primary === 'TOUR' || primary === 'FREIGHT');
    // Typed independent dimensional pools replace a fictitious common guest cap.
    if (primary === 'FREIGHT' || primary === 'PRODUCTION_DUE') facts.BQ_CAPACITY = valid;
  }
  // These fields must describe the actual selected offering/resources loaded by the server.
  // A valid raw onboarding answer does not establish an allocation or approved runtime policy.
  const actualFactIds = new Set([
    'Q_APPOINTMENT_DURATION_MINUTES',
    'Q_RESOURCE_INVENTORY',
    'Q_WEEKLY_SCHEDULE',
    'BQ_BUFFERS',
    'BQ_BOOKING_WINDOW',
    'BQ_PAYMENT_POLICY',
    'BQ_CHANGE_POLICY',
    'Q_SERVICE_AREA',
    'BQ_TRAVEL_POLICY',
    'BQ_CAPACITY',
    'BQ_BOOKING_ENABLED',
    'BQ_INTAKE_MODE',
  ]);
  if (specialistModel)
    for (const id of [
      'BQ_PRODUCTION_POLICY',
      'BQ_PICKUP_RETURN_POLICY',
      'BQ_ENTITLEMENT_POLICY',
      'BQ_SUPPLIER_POLICY',
    ])
      actualFactIds.add(id);
  const requireActualOrTyped = (id: string, fallback: boolean, message: string) => {
    if (actualFactIds.has(id)) {
      if (!fallback) missing.push(issue(canonicalQuestionId(id), message));
    } else required(id, fallback, message);
  };
  const reserveModels = new Set<BookingModel>([
    'APPOINTMENT',
    'FIELD_VISIT',
    'ASSET_INTERVAL',
    'TRANSFER',
    'SESSION_CAPACITY',
    'SPACE_RESERVATION',
    'TOUR',
    'LINKED_WINDOWS',
    'STORAGE',
    'PRODUCTION_DUE',
    'FREIGHT',
    'SERVICE_JOB',
  ]);
  if (reserveModels.has(primary)) {
    if (questionDefinition('BQ_BOOKING_ENABLED')?.applicability?.bookingModelIds?.includes(primary))
      requireActualOrTyped(
        'BQ_BOOKING_ENABLED',
        facts.BQ_BOOKING_ENABLED!,
        'Confirm whether scheduled bookings are accepted for this offering.',
      );
    requireActualOrTyped(
      'Q_RESOURCE_INVENTORY',
      resourcesReady,
      'Select actual active resources owned by this business.',
    );
    requireActualOrTyped(
      'Q_WEEKLY_SCHEDULE',
      scheduleReady,
      'Configure the actual resource schedules.',
    );
    requireActualOrTyped(
      'BQ_BOOKING_WINDOW',
      facts.BQ_BOOKING_WINDOW!,
      'Set exact lead time and booking horizon.',
    );
    requireActualOrTyped(
      'BQ_CHANGE_POLICY',
      facts.BQ_CHANGE_POLICY!,
      'Select an approved change and cancellation policy.',
    );
    requireActualOrTyped(
      'BQ_PAYMENT_POLICY',
      facts.BQ_PAYMENT_POLICY!,
      'Select an approved payment policy, including no prepayment if appropriate.',
    );
  }
  if (
    ['APPOINTMENT', 'FIELD_VISIT', 'TRANSFER', 'SPACE_RESERVATION', 'SESSION_CAPACITY'].includes(
      primary,
    )
  )
    requireActualOrTyped(
      'Q_APPOINTMENT_DURATION_MINUTES',
      durationReady,
      'Set the exact service or session duration.',
    );
  if (['ASSET_INTERVAL', 'STORAGE'].includes(primary))
    required('BQ_RANGE_POLICY', rangeReady, 'Set exact minimum and maximum permitted intervals.');
  if (['SESSION_CAPACITY', 'TOUR', 'STORAGE', 'FREIGHT'].includes(primary))
    requireActualOrTyped(
      'BQ_CAPACITY',
      facts.BQ_CAPACITY!,
      'Set capacity with its actual quantity unit.',
    );
  if (primary === 'FIELD_VISIT') {
    requireActualOrTyped(
      'Q_SERVICE_AREA',
      facts.Q_SERVICE_AREA!,
      'Configure the supported service area.',
    );
    requireActualOrTyped(
      'BQ_TRAVEL_POLICY',
      facts.BQ_TRAVEL_POLICY!,
      'Configure travel feasibility and buffers.',
    );
  }
  if (primary === 'SPACE_RESERVATION')
    required(
      'BQ_SPACE_POLICY',
      false,
      'Configure actual spaces, party sizes and compatible combinations.',
    );
  if (primary === 'PRODUCTION_DUE')
    requireActualOrTyped(
      'BQ_PRODUCTION_POLICY',
      facts.BQ_PRODUCTION_POLICY === true,
      'Configure approved specification, production capacity and due-date rules.',
    );
  if (primary === 'LINKED_WINDOWS')
    requireActualOrTyped(
      'BQ_PICKUP_RETURN_POLICY',
      facts.BQ_PICKUP_RETURN_POLICY === true,
      'Configure jointly feasible collection, processing and return rules.',
    );
  if (['FREIGHT', 'TOUR'].includes(primary))
    requireActualOrTyped(
      'BQ_SUPPLIER_POLICY',
      facts.BQ_SUPPLIER_POLICY === true,
      'Declare supplier components and their confirmed ownership.',
    );
  if (primary === 'ENTITLEMENT')
    requireActualOrTyped(
      'BQ_ENTITLEMENT_POLICY',
      facts.BQ_ENTITLEMENT_POLICY === true,
      'Configure the actual membership or retainer rights.',
    );
  for (const id of matchedRequired)
    requireActualOrTyped(
      id,
      facts[id] === true,
      `Complete ${questionDefinition(id)?.label || id}.`,
    );
  const rawAuthority = values['integration.data_authority'];
  const authorities: AuthorityBinding[] =
    offering.authority ||
    input.authority ||
    (Array.isArray(rawAuthority) ? (rawAuthority as AuthorityBinding[]) : []);
  const authority = reserveModels.has(primary)
    ? authorities.find((binding) => binding.data_class === 'reservations')
    : authorities.find(
        (binding) => binding.data_class === 'work_items' || binding.data_class === 'offerings',
      );
  if (!authority?.owner_reference)
    missing.push(
      issue(
        'Q_DATA_AUTHORITY',
        'Declare the owner of this offering’s work and applicable reservations.',
      ),
    );
  if (authority?.authority === 'SHARED_WITH_RULES' && !authority.shared_rule_reference)
    missing.push(issue('Q_DATA_AUTHORITY', 'Shared ownership requires an explicit approved rule.'));
  const workAuthority = specialistModel
    ? authorities.find(
        (binding) => binding.data_class === 'work_items' || binding.data_class === 'offerings',
      )
    : undefined;
  if (
    specialistModel &&
    (!workAuthority?.owner_reference ||
      (workAuthority.authority === 'SHARED_WITH_RULES' && !workAuthority.shared_rule_reference))
  )
    missing.push(
      issue(
        'Q_DATA_AUTHORITY',
        'Declare this specialist workflow’s actual work owner and supported shared rules.',
      ),
    );
  if (
    specialistModel &&
    (!Number.isSafeInteger(offering.policy?.version) ||
      offering.policy!.version! < 1 ||
      !offering.policy?.paymentPolicyId ||
      !offering.policy?.changePolicyId)
  )
    missing.push({
      code: 'SPECIALIST_POLICY_REQUIRED',
      field: 'policy',
      message: 'Select real versioned specialist payment and change policies.',
      severity: 'required',
    });
  return {
    missing: uniqueIssues(missing),
    native:
      authority?.authority === 'NEXG_AUTHORITATIVE' &&
      (!specialistModel || workAuthority?.authority === 'NEXG_AUTHORITATIVE'),
  };
}

/** This validates the chosen terms. Collection evidence and immutable acceptance belong to each booking. */
export function validateReservationFeePolicy(
  value: ReservationFeePolicy,
  paymentPolicyId?: string,
): ConfigIssue[] {
  const problems: ConfigIssue[] = [];
  const invalid = (message: string) =>
    problems.push({
      code: 'INVALID_RESERVATION_FEE',
      field: 'reservationFee',
      message,
      severity: 'invalid',
    });
  if (!['no_fee', 'fixed', 'percentage'].includes(value.mode))
    invalid('Choose no fee, a fixed fee or a percentage.');
  if (!['applied_in_addition', 'credited_to_total'].includes(value.treatment))
    invalid('Declare whether the reservation fee is additional or credited toward the total.');
  if (typeof value.requiredBeforeConfirmation !== 'boolean')
    invalid('Declare whether the fee is required before confirmation.');
  if (
    typeof value.refundTerms !== 'string' ||
    !value.refundTerms.trim() ||
    value.refundTerms.length > 5000
  )
    invalid('Provide the customer-visible refund terms.');
  if (
    value.mode === 'no_fee' &&
    (value.requiredBeforeConfirmation ||
      value.amountMinor !== undefined ||
      value.percentageBps !== undefined)
  )
    invalid('No-fee terms cannot require collection or contain a fee amount.');
  if (
    value.mode === 'fixed' &&
    (!Number.isSafeInteger(value.amountMinor) ||
      value.amountMinor! <= 0 ||
      value.percentageBps !== undefined)
  )
    invalid('A fixed reservation fee requires a positive exact minor-unit amount.');
  if (
    value.mode === 'percentage' &&
    (!Number.isSafeInteger(value.percentageBps) ||
      value.percentageBps! < 1 ||
      value.percentageBps! > 10000 ||
      value.amountMinor !== undefined)
  )
    invalid(
      'A percentage reservation fee requires an exact rate between 1 and 10000 basis points.',
    );
  if (
    value.mode !== 'no_fee' &&
    value.requiredBeforeConfirmation &&
    paymentPolicyId !== 'MANUAL_COLLECTION_V1'
  )
    invalid('A required reservation fee needs an approved collection policy.');
  return problems;
}

export function resolveBookingConfiguration(
  input: ResolveBookingInput,
): ResolvedBookingConfiguration {
  const profile = profileFor(input.subcategoryId);
  const normalized = normalizeBookingAnswers(input);
  const values = structuralValues(input, normalized.values, profile);
  const model = input.offering?.model || input.offeringModel;
  const models = new Set<BookingModel>();
  if (evaluatePredicate(profile.enablementGuard, values) === true)
    models.add(profile.defaultModelId);
  const matchedRules: string[] = [],
    pendingRules: string[] = [],
    attributes: Record<string, unknown> = {},
    additionalIssues: ConfigIssue[] = [];
  const required = new Set<string>(),
    suppressed = new Set<BookingModel>(),
    replacements = new Set<BookingModel>(),
    linked = new Set<BookingModel>();
  for (const binding of profile.bindings) {
    const result = evaluatePredicate(binding.condition, values);
    if (result === true) {
      models.add(binding.modelId);
      binding.requiredQuestionIds.forEach((id) => required.add(id));
      if (binding.composition === 'LINKED_EXECUTION') linked.add(binding.modelId);
    } else if (result === undefined) pendingRules.push(`binding:${binding.modelId}`);
  }
  for (const rule of profile.rules) {
    const result = evaluatePredicate(rule.condition, values);
    if (result === undefined) pendingRules.push(rule.id);
    if (result !== true) continue;
    matchedRules.push(rule.id);
    rule.effects.addModels?.forEach((id) => models.add(id));
    rule.effects.suppressModels?.forEach((id) => suppressed.add(id));
    if (rule.effects.replacePrimaryModel) {
      models.add(rule.effects.replacePrimaryModel);
      replacements.add(rule.effects.replacePrimaryModel);
    }
    rule.requiredQuestionIds.forEach((id) => required.add(id));
    for (const [key, value] of Object.entries(rule.effects.setAttributes || {})) {
      if (Object.hasOwn(attributes, key) && !sameValue(attributes[key], value))
        additionalIssues.push(
          issue(
            undefined,
            `Conflicting configuration effects for ${key}.`,
            'CONFLICTING_RULE_EFFECTS',
            'clarification',
          ),
        );
      attributes[key] = value;
    }
    if (rule.effects.clarification)
      additionalIssues.push(
        issue(undefined, rule.effects.clarification, 'MODEL_CLARIFICATION', 'clarification'),
      );
  }
  suppressed.forEach((id) => models.delete(id));
  if (replacements.size > 1)
    additionalIssues.push(
      issue(
        undefined,
        'Multiple incompatible primary models were selected.',
        'PRIMARY_MODEL_CONFLICT',
        'clarification',
      ),
    );
  const primary =
    replacements.size === 1 ? [...replacements][0]! : model && models.has(model) ? model : null;
  if (model && !primary)
    additionalIssues.push(
      issue(
        undefined,
        'This offering model is not enabled by its actual specialty answers.',
        'MODEL_NOT_ENABLED',
        'clarification',
      ),
    );
  const mode =
    input.offering?.intakeMode ||
    (typeof values['workflow.intake_mode'] === 'string'
      ? values['workflow.intake_mode']
      : undefined);
  if (
    primary &&
    !['ORDER', 'ENTITLEMENT'].includes(primary) &&
    mode &&
    !registry.intakeByModel[primary].allowedModes.includes(mode)
  )
    additionalIssues.push(
      issue(
        'BQ_INTAKE_MODE',
        `This model does not support ${mode}.`,
        'INVALID_INTAKE_MODE',
        'clarification',
      ),
    );
  const setup = requiredSetup(input, primary, values, required);
  if (primary && !['ORDER', 'ENTITLEMENT'].includes(primary) && !mode)
    setup.missing.push(issue('BQ_INTAKE_MODE', 'Select the intake and confirmation mode.'));
  const clarifications = uniqueIssues([
    ...normalized.issues.filter((i) => i.severity === 'clarification'),
    ...additionalIssues,
  ]);
  const invalidInputs = [
    ...normalized.issues.filter((i) => i.severity === 'invalid'),
    ...(input.offering?.reservationFee
      ? validateReservationFeePolicy(
          input.offering.reservationFee,
          input.offering.policy?.paymentPolicyId,
        )
      : []),
  ];
  const missingInputs = uniqueIssues(setup.missing);
  const workflowBindings: WorkflowBinding[] = [...models].map((id) => ({
    modelId: id,
    workflowId:
      id === 'APPOINTMENT'
        ? values['context.selected_method'] === 'digital' ||
          Object.values(attributes).includes('digital')
          ? 'WF_REMOTE_SESSION'
          : 'WF_APPOINTMENT'
        : id === 'SESSION_CAPACITY'
          ? profile.sourceWorkflowId === 'WF_EVENT_SESSION'
            ? 'WF_EVENT_SESSION'
            : 'WF_GROUP_ACTIVITY'
          : id === 'REQUEST_QUOTE'
            ? profile.sourceWorkflowId === 'WF_REGULATED_ENQUIRY'
              ? 'WF_REGULATED_ENQUIRY'
              : 'WF_REQUEST_QUOTE'
            : (
                {
                  ORDER: 'WF_ORDER',
                  FIELD_VISIT: 'WF_FIELD_SERVICE',
                  ASSET_INTERVAL: 'WF_RENTAL',
                  TRANSFER: 'WF_TRANSFER',
                  SPACE_RESERVATION: 'WF_SPACE_RESERVATION_V1',
                  TOUR: 'WF_TOUR',
                  PRODUCTION_DUE: 'WF_MADE_TO_ORDER',
                  LINKED_WINDOWS: 'WF_PICKUP_RETURN',
                  SERVICE_JOB: 'WF_SERVICE_JOB',
                  ENTITLEMENT: 'WF_MEMBERSHIP',
                  FREIGHT: 'WF_FREIGHT',
                  STORAGE: 'WF_STORAGE',
                } as Record<string, string>
              )[id]!,
    variantId:
      id === 'TRANSFER' && attributes.transportIncluded === false
        ? 'VAR_TRANSFER_GREETER_ONLY'
        : null,
    linkedExecution: linked.has(id),
    createsWork: false,
  }));
  const isReady =
    !!primary &&
    missingInputs.length === 0 &&
    clarifications.length === 0 &&
    invalidInputs.length === 0;
  const vocabulary =
    primary && primary !== profile.defaultModelId
      ? {
          workSingular: modelLabels[primary].toLowerCase(),
          offeringSingular: primary.toLowerCase().replaceAll('_', ' '),
          memberOrCustomer: 'customer',
        }
      : { ...profile.vocabulary };
  return {
    subcategoryId: input.subcategoryId,
    categoryId: profile.categoryId,
    candidateModels: [...profile.candidateModelIds],
    models: [...models].sort(),
    activeModels: isReady ? [...models].sort() : [],
    primaryModel: primary,
    workflowBindings,
    missingInputs,
    clarifications,
    invalidInputs,
    normalizedAnswers: normalized.answers,
    sourceAnswers: normalized.sources,
    componentValues: normalized.componentValues,
    attributes,
    matchedRules,
    pendingRules,
    needsScheduling: [...models].some((id) => !nonScheduling.has(id)),
    isReady,
    canConfirmNative:
      isReady &&
      setup.native &&
      (values['booking.accepts_scheduled_bookings'] !== false ||
        (primary === 'SERVICE_JOB' &&
          !!input.offering?.specialistSetup &&
          (input.offering.specialistSetup as SpecialistSetup).model === 'SERVICE_JOB' &&
          (input.offering.specialistSetup as import('./specialists').ServiceJobSetup)
            .jobSchedulingMode === 'queue')),
    status:
      clarifications.length || invalidInputs.length
        ? 'CLARIFICATION_REQUIRED'
        : isReady
          ? 'CONFIGURED'
          : 'SETUP_REQUIRED',
    timezone: BOOKING_TIMEZONE,
    currency: BOOKING_CURRENCY,
    vocabulary,
    configurationRevision: fingerprint({
      subcategoryId: input.subcategoryId,
      scope: input.scope,
      offering: input.offering,
      answers: normalized.answers,
      models: [...models].sort(),
    }),
    registryRevision: registry.revision,
    createsWork: false,
  };
}

export function getApplicableBookingQuestions(input: ResolveBookingInput): BookingQuestion[] {
  const profile = profileFor(input.subcategoryId),
    normalized = normalizeBookingAnswers(input);
  const selected = input.offering?.model || input.offeringModel;
  const models = selected ? [selected] : profile.candidateModelIds;
  const ids = new Set<string>(profile.sourceQuestionIds);
  for (const model of models)
    for (const id of modelQuestions[model]) ids.add(canonicalQuestionId(id)!);
  for (const rule of profile.rules) collectQuestions(rule.condition).forEach((id) => ids.add(id));
  // Follow-up structures are shown only once the relevant intent has been declared.
  const gated: Record<string, [string, unknown]> = {
    BQ_FULFILMENT_WINDOWS: ['BQ_SCHEDULED_FULFILMENT_ENABLED', true],
    BQ_RECURRENCE_RULE: ['BQ_RECURRING_SCHEDULE_ENABLED', true],
    BQ_ENTITLEMENT_POLICY: ['BQ_MEMBERSHIP_PLAN_ENABLED', true],
  };
  for (const [id, [gate, expected]] of Object.entries(gated))
    if (sameValue(normalized.answers[canonicalQuestionId(gate)!], expected)) ids.add(id);
    else ids.delete(id);
  if (input.subcategoryId === 'meet_greet') ids.add('BQ_GREETER_TRANSPORT_INCLUDED');
  return [...ids]
    .map((id) => questionDefinition(id))
    .filter((q): q is NonNullable<typeof q> => !!q && q.captureMode !== 'PLATFORM_CONSTANT')
    .map((q) => ({
      id: q.id,
      key: q.key,
      label: q.label,
      canonicalTarget: q.canonicalTarget,
      schema: getQuestionSchema(q.id)!,
      scope: q.captureScope,
      required:
        profile.sourceQuestionIds.includes(q.id) ||
        models.some((model) =>
          modelQuestions[model].some((id) => canonicalQuestionId(id) === q.id),
        ),
      value: normalized.answers[q.id],
    }));
}

export type NewBookingCategory = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  name: string;
  modelId: BookingModel;
  questionIds: string[];
  description: string;
};
export function registerBookingCategory(
  definition: NewBookingCategory,
  implementedModels: readonly BookingModel[],
): { registered: boolean; issues: ConfigIssue[] } {
  const issues: ConfigIssue[] = [];
  if (
    Object.keys(definition).some(
      (key) =>
        ![
          'categoryId',
          'categoryName',
          'subcategoryId',
          'name',
          'modelId',
          'questionIds',
          'description',
        ].includes(key),
    )
  )
    issues.push(
      issue(
        undefined,
        'Category definitions cannot contain executable rules or permission grants.',
        'UNSUPPORTED_CATEGORY_FIELD',
        'invalid',
      ),
    );
  if (
    ![definition.categoryId, definition.subcategoryId].every((id) =>
      /^[a-z][a-z0-9_]{1,100}$/.test(id),
    )
  )
    issues.push(
      issue(
        undefined,
        'Category identifiers must be stable lowercase names.',
        'INVALID_CATEGORY_ID',
        'invalid',
      ),
    );
  if (profileMap.has(definition.subcategoryId) || customProfiles.has(definition.subcategoryId))
    issues.push(
      issue(undefined, 'Category identity is already registered.', 'DUPLICATE_CATEGORY', 'invalid'),
    );
  if (
    !BOOKING_MODELS.includes(definition.modelId) ||
    !implementedModels.includes(definition.modelId)
  )
    issues.push(
      issue(
        undefined,
        'This booking model has not been implemented by the runtime.',
        'UNIMPLEMENTED_MODEL',
        'invalid',
      ),
    );
  if (
    !definition.name?.trim() ||
    !definition.description?.trim() ||
    !definition.categoryName?.trim()
  )
    issues.push(
      issue(
        undefined,
        'Category name, parent label and operational meaning are required.',
        'INCOMPLETE_CATEGORY',
        'invalid',
      ),
    );
  const canonical = definition.questionIds.map(canonicalQuestionId);
  if (canonical.some((id) => !id))
    issues.push(
      issue(
        undefined,
        'All category questions must already be registered.',
        'UNREGISTERED_QUESTION',
        'invalid',
      ),
    );
  if (issues.length) return { registered: false, issues };
  customProfiles.set(definition.subcategoryId, {
    categoryId: definition.categoryId,
    categoryName: definition.categoryName,
    subcategoryId: definition.subcategoryId,
    name: definition.name,
    sourceWorkflowId: 'WF_APPOINTMENT',
    defaultModelId: definition.modelId,
    sourceQuestionIds: [...new Set(canonical as string[])],
    sourceQuestionKeys: canonical.map((id) => questions.get(id!)!.key),
    candidateModelIds: [definition.modelId],
    enablementGuard: {
      all: [
        { path: 'context.offering_selected', op: 'eq', value: true },
        { path: 'context.offering_model', op: 'eq', value: definition.modelId },
      ],
    },
    bindings: [],
    rules: [],
    specialtyNeeds: definition.description,
    vocabulary: {
      workSingular: modelLabels[definition.modelId].toLowerCase(),
      offeringSingular: 'offering',
      memberOrCustomer: 'customer',
    },
  });
  return { registered: true, issues: [] };
}
