/** Typed specialist work contracts. Plans are intents: the host must apply all
 * allocations, credit changes and work state in one authorized transaction. */
export const SPECIALIST_MODELS = [
  'TOUR',
  'LINKED_WINDOWS',
  'PRODUCTION_DUE',
  'ENTITLEMENT',
  'FREIGHT',
  'SERVICE_JOB',
] as const;
export type SpecialistModel = (typeof SPECIALIST_MODELS)[number];
export type MeasuredQuantity = { quantityMinor: number; unit: string; scale: number };
export type SpecialistInterval = { startTime: string; endTime: string };
export type SupplierComponent = {
  id: string;
  description: string;
  evidenceKind: 'authorized_manual_reference' | 'provider_api';
};
export type SupplierConfirmation = {
  componentId: string;
  reference: string;
  verification: 'merchant_asserted' | 'provider_verified';
};
type BaseSetup = {
  model: SpecialistModel;
  version: number;
  supplierComponents: SupplierComponent[];
};
export type TourSetup = BaseSetup & {
  model: 'TOUR';
  mode: 'shared' | 'private';
  itinerary: string;
  itineraryVersion: number;
  resourceIds: string[];
  poolResourceId?: string;
  minimumParticipants: number;
  maximumParticipants: number;
};
export type LinkedWindowsSetup = BaseSetup & {
  model: 'LINKED_WINDOWS';
  promiseMode: 'FIRM_PRE_ACCEPTED' | 'ASSESSMENT_REQUIRED';
  incomingMethod: 'CUSTOMER_DROPOFF' | 'MERCHANT_COLLECTION' | 'PARTNER_COLLECTION';
  outgoingMethod: 'CUSTOMER_COLLECTION' | 'MERCHANT_RETURN' | 'PARTNER_RETURN';
  incomingResourceIds: string[];
  outgoingResourceIds: string[];
  processingResourceId: string;
  processingUnit: string;
  quantityScale: number;
  minimumProcessingMinutes: number;
  maximumProcessingMinutes: number;
  calendarBasis: 'elapsed' | 'business_calendar';
  workingDays: number[];
  opens: string;
  closes: string;
};
export type ProductionSetup = BaseSetup & {
  model: 'PRODUCTION_DUE';
  capacityPoolId: string;
  capacityUnit: string;
  quantityScale: number;
  preparationLeadMinutes: number;
  cutoffLocalTime: string;
  workingDays: number[];
  approvalMode: 'required' | 'not_required_for_fixed_specification';
  handoffResourceIds: string[];
};
export type EntitlementCredit = MeasuredQuantity & { id: string; offeringIds: string[] };
export type EntitlementSetup = BaseSetup & {
  model: 'ENTITLEMENT';
  planId: string;
  planVersion: number;
  scopeOfferingIds: string[];
  validity:
    | { mode: 'absolute_dates'; starts: string; ends: string }
    | {
        mode: 'relative_to_activation';
        duration: { value: number; unit: 'day' | 'week' | 'month' };
      };
  credits: EntitlementCredit[];
  renewal: 'none' | 'manual' | 'separately_authorized';
  creditCancellation: 'restore_before_start' | 'nonrefundable';
};
export type FreightLegSetup = {
  id: string;
  origin: string;
  destination: string;
  resourceIds: string[];
  dimensions: Array<{ resourceId: string; unit: string; scale: number }>;
};
export type FreightSetup = BaseSetup & {
  model: 'FREIGHT';
  legs: FreightLegSetup[];
  requiresDocuments: boolean;
  requiresClearance: boolean;
  finalMode: 'delivery' | 'consignee_collection';
};
export type ServiceJobSetup = BaseSetup & {
  model: 'SERVICE_JOB';
  jobSchedulingMode: 'queue' | 'scheduled_intake' | 'scheduled_work';
  assessmentMode: 'fixed_scope' | 'diagnosis_required';
  resourceIds: string[];
  durationMinutes: number;
  partsRequired: boolean;
  partsEvidenceKind: 'authorized_manual_reference' | 'provider_api';
  custodyMode: 'customer_retains' | 'merchant_holds';
  custodyResourceIds: string[];
  custodyDurationMinutes: number;
};
export type SpecialistSetup =
  | TourSetup
  | LinkedWindowsSetup
  | ProductionSetup
  | EntitlementSetup
  | FreightSetup
  | ServiceJobSetup;
export type TourInput = {
  model: 'TOUR';
  occurrenceId?: string;
  startTime?: string;
  endTime?: string;
  itineraryVersion: number;
};
export type LinkedWindowsInput = {
  model: 'LINKED_WINDOWS';
  incoming: SpecialistInterval;
  processing?: SpecialistInterval;
  outgoing?: SpecialistInterval;
  workload?: MeasuredQuantity;
};
export type ProductionInput = {
  model: 'PRODUCTION_DUE';
  specification: string;
  specificationVersion: number;
  productionStartTime: string;
  dueTime: string;
  workload: MeasuredQuantity;
  handoff?: SpecialistInterval;
};
export type EntitlementInput = { model: 'ENTITLEMENT' };
export type FreightInput = {
  model: 'FREIGHT';
  cargoDescription: string;
  pieces: number;
  cargo: MeasuredQuantity[];
  legs: Array<SpecialistInterval & { id: string }>;
};
export type ServiceJobInput = {
  model: 'SERVICE_JOB';
  jobDescription: string;
  requestedInterval?: SpecialistInterval;
  completionPromise?: string;
};
export type SpecialistBookingInput =
  | TourInput
  | LinkedWindowsInput
  | ProductionInput
  | EntitlementInput
  | FreightInput
  | ServiceJobInput;
export type SpecialistRole = {
  id: string;
  role:
    | 'tour_private'
    | 'tour_departure'
    | 'incoming'
    | 'processing'
    | 'outgoing'
    | 'production'
    | 'handoff'
    | 'freight_leg'
    | 'job_intake'
    | 'job_diagnosis'
    | 'job_work'
    | 'job_custody';
  resourceIds: string[];
  startTime: string;
  endTime: string;
  quantities: Array<MeasuredQuantity & { resourceId: string }>;
  occurrenceId?: string;
};
export type SpecialistApproval = {
  version: number;
  acceptedBy: string;
  acceptedAt: string;
  priceMinor: number;
};
export type SpecialistOccurrence = SpecialistInterval & {
  id: string;
  resourceIds: string[];
  capacity: number;
};
export type SpecialistState = {
  model: SpecialistModel;
  state: string;
  version: number;
  input: SpecialistBookingInput;
  setup: SpecialistSetup;
  roles: SpecialistRole[];
  approval?: SpecialistApproval;
  supplierConfirmations: SupplierConfirmation[];
  validity?: { starts: string; ends: string };
  credits?: EntitlementCredit[];
  usedOccurrenceKeys?: string[];
  redemptions?: Array<{
    occurrenceKey: string;
    creditId: string;
    quantityMinor: number;
    unit: string;
    scale: number;
    offeringId: string;
    restored: boolean;
  }>;
  custody: 'not_received' | 'held' | 'released';
  history: Array<{ command: string; at: string; evidence?: string }>;
  job?: {
    intakeReceived: boolean;
    partsRequired: boolean;
    findings?: string;
    partsConfirmation?: {
      reference: string;
      verification: 'merchant_asserted' | 'provider_verified';
    };
    committedRoleIds: string[];
    activeRoleIds: string[];
    completedRoleIds: string[];
  };
};
export type SpecialistPlan = {
  model: SpecialistModel;
  workflowState: string;
  roles: SpecialistRole[];
  acceptedTerms: SpecialistState;
  publicSummary: SpecialistPublicSummary;
  requiresApproval: boolean;
  requiresSupplierConfirmation: boolean;
};
export type SpecialistPublicSummary = {
  model: SpecialistModel;
  state: string;
  summary: string;
  details: Record<string, unknown>;
  availableCommands: string[];
};
export type SpecialistPublicDescriptor =
  | {
      model: 'TOUR';
      version: number;
      mode: 'shared' | 'private';
      itinerary: string;
      itineraryVersion: number;
      minimumParticipants: number;
      maximumParticipants: number;
      departures: Array<SpecialistInterval & { id: string; capacity: number }>;
    }
  | {
      model: 'LINKED_WINDOWS';
      version: number;
      promiseMode: LinkedWindowsSetup['promiseMode'];
      incomingMethod: LinkedWindowsSetup['incomingMethod'];
      outgoingMethod: LinkedWindowsSetup['outgoingMethod'];
      processingUnit: string;
      quantityScale: number;
      minimumProcessingMinutes: number;
      maximumProcessingMinutes: number;
      calendarBasis: 'elapsed' | 'business_calendar';
      workingDays: number[];
      opens: string;
      closes: string;
    }
  | {
      model: 'PRODUCTION_DUE';
      version: number;
      capacityUnit: string;
      quantityScale: number;
      preparationLeadMinutes: number;
      cutoffLocalTime: string;
      workingDays: number[];
      approvalMode: ProductionSetup['approvalMode'];
      hasTimedHandoff: boolean;
    }
  | {
      model: 'ENTITLEMENT';
      version: number;
      planId: string;
      planVersion: number;
      scopeOfferingIds: string[];
      validity: EntitlementSetup['validity'];
      credits: EntitlementCredit[];
      renewal: EntitlementSetup['renewal'];
      creditCancellation: EntitlementSetup['creditCancellation'];
    }
  | {
      model: 'FREIGHT';
      version: number;
      legs: Array<{
        id: string;
        origin: string;
        destination: string;
        dimensions: Array<{ unit: string; scale: number }>;
      }>;
      requiresDocuments: boolean;
      requiresClearance: boolean;
      finalMode: FreightSetup['finalMode'];
    }
  | {
      model: 'SERVICE_JOB';
      version: number;
      jobSchedulingMode: ServiceJobSetup['jobSchedulingMode'];
      assessmentMode: ServiceJobSetup['assessmentMode'];
      durationMinutes: number;
      partsRequired: boolean;
      custodyMode: ServiceJobSetup['custodyMode'];
      custodyDurationMinutes: number;
    };
export type SpecialistEffect =
  | { type: 'allocate'; roles: SpecialistRole[] }
  | { type: 'begin'; roleIds: string[] }
  | { type: 'release'; roleIds: string[] }
  | {
      type: 'restore_credit';
      creditId: string;
      quantityMinor: number;
      unit: string;
      scale: number;
      occurrenceKey: string;
      bookingId: string;
    }
  | {
      type: 'book_entitled';
      offeringId: string;
      occurrenceKey: string;
      booking: Record<string, unknown>;
    }
  | {
      type: 'redeem';
      creditId: string;
      quantityMinor: number;
      unit: string;
      scale: number;
      offeringId: string;
      occurrenceKey: string;
      booking: Record<string, unknown>;
    };
export type SpecialistTransitionInput = {
  evidence?: string;
  approval?: SpecialistApproval;
  supplierConfirmations?: SupplierConfirmation[];
  processing?: SpecialistInterval;
  outgoing?: SpecialistInterval;
  workload?: MeasuredQuantity;
  creditId?: string;
  quantityMinor?: number;
  unit?: string;
  scale?: number;
  offeringId?: string;
  occurrenceKey?: string;
  booking?: Record<string, unknown>;
  scopeVersion?: number;
  findings?: string;
  partsRequired?: boolean;
  partsConfirmation?: {
    reference: string;
    verification: 'merchant_asserted' | 'provider_verified';
  };
  /** Host must load and verify this exact cancelled child belongs to the redemption. */
  cancelledBooking?: {
    bookingId: string;
    occurrenceKey: string;
    cancelledAt: string;
    startTime: string;
  };
};
export class SpecialistValidationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SpecialistValidationError';
  }
}
function fail(code: string, message: string): never {
  throw new SpecialistValidationError(code, message);
}
function object(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid_specialist_setup', `${label} must be an object.`);
  return value as Record<string, any>;
}
function str(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail('invalid_specialist_input', `${label} is required and must be at most ${max} characters.`);
  return value.trim();
}
function int(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    fail(
      'invalid_specialist_quantity',
      `${label} must be a whole number between ${min} and ${max}.`,
    );
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T))
    fail('invalid_specialist_setup', `Choose a supported ${label}.`);
  return value as T;
}
function ids(value: unknown, label: string, min = 0): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > 1000)
    fail('invalid_specialist_setup', `${label} needs ${min || 'zero or more'} actual identifiers.`);
  const result = value.map((id) => str(id, label));
  if (new Set(result).size !== result.length)
    fail('duplicate_specialist_resource', `${label} contains duplicate identifiers.`);
  return result;
}
function days(value: unknown): number[] {
  if (!Array.isArray(value) || !value.length)
    fail('invalid_specialist_setup', 'Choose at least one working day.');
  const result = value.map((day) => int(day, 'Working day', 0, 6));
  if (new Set(result).size !== result.length)
    fail('invalid_specialist_setup', 'Working days must be unique.');
  return result;
}
function hhmm(value: unknown, label: string): string {
  const result = str(value, label);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result))
    fail('invalid_specialist_setup', `${label} must use HH:mm Kenya time.`);
  return result;
}
function date(value: unknown, label: string): string {
  const result = str(value, label);
  const parsed = new Date(`${result}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result
  )
    fail('invalid_specialist_date', `${label} must be a real local date.`);
  return result;
}
function instant(value: unknown, label: string): number {
  const result = str(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(result))
    fail('invalid_specialist_date', `${label} needs an exact time with an offset.`);
  const stamp = Date.parse(result);
  if (!Number.isFinite(stamp)) fail('invalid_specialist_date', `${label} is invalid.`);
  date(result.slice(0, 10), label);
  if (
    Number(result.slice(11, 13)) > 23 ||
    Number(result.slice(14, 16)) > 59 ||
    (result.slice(16, 17) === ':' && Number(result.slice(17, 19)) > 59)
  )
    fail('invalid_specialist_date', `${label} is invalid.`);
  return stamp;
}
function interval(value: unknown, label: string): SpecialistInterval {
  const raw = object(value, label),
    start = instant(raw.startTime, `${label} start`),
    end = instant(raw.endTime, `${label} end`);
  if (end <= start || end - start > 366 * 86400_000)
    fail('invalid_specialist_interval', `${label} must end after it starts and within 366 days.`);
  return { startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() };
}
function measured(value: unknown, label: string): MeasuredQuantity {
  const raw = object(value, label);
  return {
    quantityMinor: int(raw.quantityMinor, label, 1),
    unit: str(raw.unit, `${label} unit`, 30),
    scale: int(raw.scale, `${label} scale`, 0, 9),
  };
}
function supplierComponents(value: unknown): SupplierComponent[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1000)
    fail('invalid_specialist_setup', 'Supplier components must be a list.');
  const result = value.map((entry) => {
    const raw = object(entry, 'Supplier component');
    return {
      id: str(raw.id, 'Supplier component ID'),
      description: str(raw.description, 'Supplier description', 2000),
      evidenceKind: choice(
        raw.evidenceKind,
        ['authorized_manual_reference', 'provider_api'],
        'supplier evidence kind',
      ),
    };
  });
  if (new Set(result.map((entry) => entry.id)).size !== result.length)
    fail('invalid_specialist_setup', 'Supplier component IDs must be unique.');
  return result;
}

/** Form values deliberately contain no imaginary resource identifiers. A draft
 * is displayable; normalizeSpecialistSetup rejects missing actual inventory. */
export function getSpecialistDefaults(model: SpecialistModel): Record<string, unknown> {
  const base = { model, version: 1, supplierComponents: [] };
  switch (model) {
    case 'TOUR':
      return {
        ...base,
        mode: 'private',
        itinerary: '',
        itineraryVersion: 1,
        resourceIds: [],
        minimumParticipants: 1,
        maximumParticipants: 1,
      };
    case 'LINKED_WINDOWS':
      return {
        ...base,
        promiseMode: 'FIRM_PRE_ACCEPTED',
        incomingMethod: 'CUSTOMER_DROPOFF',
        outgoingMethod: 'CUSTOMER_COLLECTION',
        incomingResourceIds: [],
        outgoingResourceIds: [],
        processingResourceId: '',
        processingUnit: 'kg',
        quantityScale: 0,
        minimumProcessingMinutes: 60,
        maximumProcessingMinutes: 1440,
        calendarBasis: 'elapsed',
        workingDays: [1, 2, 3, 4, 5, 6],
        opens: '08:00',
        closes: '18:00',
      };
    case 'PRODUCTION_DUE':
      return {
        ...base,
        capacityPoolId: '',
        capacityUnit: 'job',
        quantityScale: 0,
        preparationLeadMinutes: 60,
        cutoffLocalTime: '18:00',
        workingDays: [1, 2, 3, 4, 5, 6],
        approvalMode: 'required',
        handoffResourceIds: [],
      };
    case 'ENTITLEMENT':
      return {
        ...base,
        planId: '',
        planVersion: 1,
        scopeOfferingIds: [],
        validity: { mode: 'relative_to_activation', duration: { value: 1, unit: 'month' } },
        credits: [],
        renewal: 'none',
        creditCancellation: 'nonrefundable',
      };
    case 'FREIGHT':
      return {
        ...base,
        legs: [],
        requiresDocuments: false,
        requiresClearance: false,
        finalMode: 'delivery',
      };
    case 'SERVICE_JOB':
      return {
        ...base,
        jobSchedulingMode: 'queue',
        assessmentMode: 'fixed_scope',
        resourceIds: [],
        durationMinutes: 60,
        partsRequired: false,
        partsEvidenceKind: 'authorized_manual_reference',
        custodyMode: 'customer_retains',
        custodyResourceIds: [],
        custodyDurationMinutes: 1440,
      };
  }
}

/** Public intake choices are explicitly constructed; no resource binding,
 * supplier reference, private metadata or arbitrary additionalSetup survives. */
export function specialistPublicDescriptor(
  setup: SpecialistSetup,
  departures: SpecialistOccurrence[] = [],
): SpecialistPublicDescriptor {
  switch (setup.model) {
    case 'SERVICE_JOB':
      return {
        model: setup.model,
        version: setup.version,
        jobSchedulingMode: setup.jobSchedulingMode,
        assessmentMode: setup.assessmentMode,
        durationMinutes: setup.durationMinutes,
        partsRequired: setup.partsRequired,
        custodyMode: setup.custodyMode,
        custodyDurationMinutes: setup.custodyDurationMinutes,
      };
    case 'TOUR':
      return {
        model: setup.model,
        version: setup.version,
        mode: setup.mode,
        itinerary: setup.itinerary,
        itineraryVersion: setup.itineraryVersion,
        minimumParticipants: setup.minimumParticipants,
        maximumParticipants: setup.maximumParticipants,
        departures: departures.map(({ id, startTime, endTime, capacity }) => ({
          id,
          startTime,
          endTime,
          capacity,
        })),
      };
    case 'LINKED_WINDOWS':
      return {
        model: setup.model,
        version: setup.version,
        promiseMode: setup.promiseMode,
        incomingMethod: setup.incomingMethod,
        outgoingMethod: setup.outgoingMethod,
        processingUnit: setup.processingUnit,
        quantityScale: setup.quantityScale,
        minimumProcessingMinutes: setup.minimumProcessingMinutes,
        maximumProcessingMinutes: setup.maximumProcessingMinutes,
        calendarBasis: setup.calendarBasis,
        workingDays: [...setup.workingDays],
        opens: setup.opens,
        closes: setup.closes,
      };
    case 'PRODUCTION_DUE':
      return {
        model: setup.model,
        version: setup.version,
        capacityUnit: setup.capacityUnit,
        quantityScale: setup.quantityScale,
        preparationLeadMinutes: setup.preparationLeadMinutes,
        cutoffLocalTime: setup.cutoffLocalTime,
        workingDays: [...setup.workingDays],
        approvalMode: setup.approvalMode,
        hasTimedHandoff: !!setup.handoffResourceIds.length,
      };
    case 'ENTITLEMENT':
      return {
        model: setup.model,
        version: setup.version,
        planId: setup.planId,
        planVersion: setup.planVersion,
        scopeOfferingIds: [...setup.scopeOfferingIds],
        validity: structuredClone(setup.validity),
        credits: structuredClone(setup.credits),
        renewal: setup.renewal,
        creditCancellation: setup.creditCancellation,
      };
    case 'FREIGHT':
      return {
        model: setup.model,
        version: setup.version,
        legs: setup.legs.map(({ id, origin, destination, dimensions }) => ({
          id,
          origin,
          destination,
          dimensions: dimensions.map(({ unit, scale }) => ({ unit, scale })),
        })),
        requiresDocuments: setup.requiresDocuments,
        requiresClearance: setup.requiresClearance,
        finalMode: setup.finalMode,
      };
  }
}

export type SpecialistResourceFact = {
  id: string;
  active: boolean;
  hasSchedule?: boolean;
  capacity?: number;
  capacityUnit?: string;
  quantityScale?: number;
  capacityMode?: 'per-reservation' | 'per-guest';
  kind?: string;
};
/** Actual inventory facts are loaded by the host under tenant/branch scope.
 * This check establishes readiness only; interval capacity stays transactional. */
export function validateSpecialistResourceBindings(
  setup: SpecialistSetup,
  resources: readonly SpecialistResourceFact[],
  offeringResourceIds: readonly string[],
): string[] {
  const issues: string[] = [];
  const required = new Set<string>();
  const pools: Array<{ resourceId: string; unit: string; scale: number }> = [];
  switch (setup.model) {
    case 'SERVICE_JOB': {
      [...setup.resourceIds, ...setup.custodyResourceIds].forEach((id) => required.add(id));
      if (
        setup.custodyResourceIds.some(
          (id) => resources.find((resource) => resource.id === id)?.kind === 'staff',
        )
      )
        issues.push(
          'Customer goods custody must use physical holding inventory, not a staff member.',
        );
      break;
    }
    case 'TOUR':
      setup.resourceIds.forEach((id) => required.add(id));
      if (setup.mode === 'shared')
        pools.push({ resourceId: setup.poolResourceId!, unit: 'place', scale: 0 });
      break;
    case 'LINKED_WINDOWS':
      [...setup.incomingResourceIds, ...setup.outgoingResourceIds].forEach((id) =>
        required.add(id),
      );
      pools.push({
        resourceId: setup.processingResourceId,
        unit: setup.processingUnit,
        scale: setup.quantityScale,
      });
      break;
    case 'PRODUCTION_DUE':
      setup.handoffResourceIds.forEach((id) => required.add(id));
      pools.push({
        resourceId: setup.capacityPoolId,
        unit: setup.capacityUnit,
        scale: setup.quantityScale,
      });
      break;
    case 'FREIGHT':
      for (const leg of setup.legs) {
        leg.resourceIds.forEach((id) => required.add(id));
        pools.push(...leg.dimensions);
      }
      break;
    case 'ENTITLEMENT':
      break;
  }
  const exclusive = new Set(required);
  for (const pool of pools) {
    if (exclusive.has(pool.resourceId))
      issues.push('A typed capacity pool cannot also be an exclusive role resource.');
    required.add(pool.resourceId);
    const resource = resources.find((candidate) => candidate.id === pool.resourceId);
    if (
      resource &&
      (resource.capacityMode !== 'per-guest' ||
        resource.capacityUnit !== pool.unit ||
        (resource.quantityScale ?? 0) !== pool.scale ||
        !Number.isSafeInteger(resource.capacity) ||
        resource.capacity! < 1)
    )
      issues.push(
        `Resource ${pool.resourceId} must be a real positive ${pool.unit} capacity pool with scale ${pool.scale}.`,
      );
  }
  for (const id of required) {
    const resource = resources.find((candidate) => candidate.id === id);
    if (!offeringResourceIds.includes(id))
      issues.push(`Resource ${id} must belong to this actual offering’s configured bundle.`);
    if (!resource?.active || resource.hasSchedule !== true)
      issues.push(`Resource ${id} needs actual active inventory and working hours.`);
  }
  return [...new Set(issues)];
}

/** Only declared contract fields survive normalization. Extra onboarding data
 * cannot become a public field or a permission. Canonical answers can supply
 * matching policy facts; actual resource/route bindings remain explicit. */
export function normalizeSpecialistSetup(
  model: SpecialistModel,
  value: unknown,
  canonicalAnswers: Record<string, any> = {},
): SpecialistSetup {
  const raw = object(value, 'Specialist setup');
  if (raw.model !== undefined && raw.model !== model)
    fail('specialist_model_mismatch', 'Specialist setup must match its offering model.');
  const base = {
    model,
    version: int(raw.version ?? 1, 'Setup version', 1),
    supplierComponents: supplierComponents(raw.supplierComponents),
  };
  switch (model) {
    case 'SERVICE_JOB': {
      const resourceIds = ids(raw.resourceIds, 'Service bay/team resources', 1);
      const custodyMode = choice(
        raw.custodyMode,
        ['customer_retains', 'merchant_holds'],
        'customer asset custody mode',
      );
      const custodyResourceIds = ids(
        raw.custodyResourceIds ?? [],
        'Customer goods holding resources',
        custodyMode === 'merchant_holds' ? 1 : 0,
      );
      if (custodyMode === 'customer_retains' && custodyResourceIds.length)
        fail(
          'invented_custody',
          'Customer-retained assets do not allocate merchant holding space.',
        );
      if (custodyResourceIds.some((id) => resourceIds.includes(id)))
        fail(
          'job_custody_resource_mismatch',
          'Physical holding resources must be separate from the service bay/team bundle.',
        );
      if (typeof raw.partsRequired !== 'boolean')
        fail(
          'invalid_specialist_setup',
          'Explicitly state whether the accepted job requires parts.',
        );
      return {
        ...base,
        model,
        resourceIds,
        durationMinutes: int(raw.durationMinutes, 'Service phase duration', 1, 1440),
        jobSchedulingMode: choice(
          raw.jobSchedulingMode,
          ['queue', 'scheduled_intake', 'scheduled_work'],
          'service job scheduling mode',
        ),
        assessmentMode: choice(
          raw.assessmentMode,
          ['fixed_scope', 'diagnosis_required'],
          'service assessment mode',
        ),
        partsRequired: raw.partsRequired,
        partsEvidenceKind: choice(
          raw.partsEvidenceKind,
          ['authorized_manual_reference', 'provider_api'],
          'parts evidence kind',
        ),
        custodyMode,
        custodyResourceIds,
        custodyDurationMinutes: int(
          raw.custodyDurationMinutes,
          'Planned customer goods holding minutes',
          1,
          366 * 1440,
        ),
      };
    }
    case 'TOUR': {
      const minimumParticipants = int(raw.minimumParticipants, 'Minimum participants', 1),
        maximumParticipants = int(
          raw.maximumParticipants,
          'Maximum participants',
          minimumParticipants,
        );
      const mode = choice(raw.mode, ['shared', 'private'], 'tour mode');
      return {
        ...base,
        model,
        mode,
        itinerary: str(raw.itinerary, 'Published itinerary', 6000),
        itineraryVersion: int(raw.itineraryVersion, 'Itinerary version', 1),
        resourceIds: ids(raw.resourceIds, 'Tour resources', 1),
        ...(mode === 'shared'
          ? { poolResourceId: str(raw.poolResourceId, 'Departure place pool') }
          : {}),
        minimumParticipants,
        maximumParticipants,
      };
    }
    case 'LINKED_WINDOWS': {
      const policy = canonicalAnswers.BQ_PICKUP_RETURN_POLICY ?? {};
      const incomingMethod = choice(
        raw.incomingMethod ?? policy.collection_mode,
        ['CUSTOMER_DROPOFF', 'MERCHANT_COLLECTION', 'PARTNER_COLLECTION'],
        'incoming method',
      );
      const outgoingMethod = choice(
        raw.outgoingMethod ?? policy.return_mode,
        ['CUSTOMER_COLLECTION', 'MERCHANT_RETURN', 'PARTNER_RETURN'],
        'outgoing method',
      );
      const minimumProcessingMinutes = int(
        raw.minimumProcessingMinutes ?? policy.minimum_processing_minutes,
        'Minimum processing minutes',
        0,
      );
      const maximumProcessingMinutes = int(
        raw.maximumProcessingMinutes ?? policy.maximum_processing_minutes,
        'Maximum processing minutes',
        minimumProcessingMinutes,
      );
      const opens = hhmm(raw.opens ?? '08:00', 'Processing opening'),
        closes = hhmm(raw.closes ?? '18:00', 'Processing closing');
      if (closes <= opens)
        fail('invalid_specialist_setup', 'Processing closing must follow opening on the same day.');
      const incomingResourceIds = ids(
        raw.incomingResourceIds ?? [],
        'Incoming resources',
        incomingMethod === 'CUSTOMER_DROPOFF' ? 0 : 1,
      );
      const outgoingResourceIds = ids(
        raw.outgoingResourceIds ?? [],
        'Outgoing resources',
        outgoingMethod === 'CUSTOMER_COLLECTION' ? 0 : 1,
      );
      if (incomingMethod === 'CUSTOMER_DROPOFF' && incomingResourceIds.length)
        fail('invented_transport', 'Customer drop-off does not allocate a collection vehicle.');
      if (outgoingMethod === 'CUSTOMER_COLLECTION' && outgoingResourceIds.length)
        fail('invented_transport', 'Customer collection does not allocate a return vehicle.');
      return {
        ...base,
        model,
        promiseMode: choice(
          raw.promiseMode,
          ['FIRM_PRE_ACCEPTED', 'ASSESSMENT_REQUIRED'],
          'promise mode',
        ),
        incomingMethod,
        outgoingMethod,
        incomingResourceIds,
        outgoingResourceIds,
        processingResourceId: str(raw.processingResourceId, 'Processing pool'),
        processingUnit: str(raw.processingUnit, 'Processing unit', 30),
        quantityScale: int(raw.quantityScale ?? 0, 'Processing scale', 0, 9),
        minimumProcessingMinutes,
        maximumProcessingMinutes,
        calendarBasis: choice(
          raw.calendarBasis ?? policy.calendar_basis ?? 'elapsed',
          ['elapsed', 'business_calendar'],
          'processing calendar',
        ),
        workingDays: days(raw.workingDays ?? [0, 1, 2, 3, 4, 5, 6]),
        opens,
        closes,
      };
    }
    case 'PRODUCTION_DUE': {
      const policy = canonicalAnswers.BQ_PRODUCTION_POLICY ?? {};
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      return {
        ...base,
        model,
        capacityPoolId: str(
          raw.capacityPoolId ?? policy.capacity_pool_id,
          'Production capacity pool',
        ),
        capacityUnit: str(raw.capacityUnit ?? policy.capacity_unit, 'Production unit', 30),
        quantityScale: int(raw.quantityScale ?? 0, 'Production scale', 0, 9),
        preparationLeadMinutes: int(
          raw.preparationLeadMinutes ?? policy.preparation_lead_minutes,
          'Preparation lead minutes',
          0,
        ),
        cutoffLocalTime: hhmm(raw.cutoffLocalTime ?? policy.cutoff_local_time, 'Due cutoff'),
        workingDays: days(
          raw.workingDays ?? policy.working_days?.map((day: string) => dayNames.indexOf(day)),
        ),
        approvalMode: choice(
          raw.approvalMode ?? policy.approval_mode,
          ['required', 'not_required_for_fixed_specification'],
          'specification approval',
        ),
        handoffResourceIds: ids(raw.handoffResourceIds ?? [], 'Handoff resources'),
      };
    }
    case 'ENTITLEMENT': {
      const policy = canonicalAnswers.BQ_ENTITLEMENT_POLICY ?? {};
      const validityRaw = object(raw.validity ?? policy.validity, 'Plan validity');
      let validity: EntitlementSetup['validity'];
      if (validityRaw.mode === 'absolute_dates') {
        const starts = date(validityRaw.starts, 'Plan start date'),
          ends = date(validityRaw.ends, 'Plan exclusive end date');
        if (ends <= starts) fail('invalid_specialist_date', 'Plan end date must follow its start.');
        validity = { mode: 'absolute_dates', starts, ends };
      } else {
        const duration = object(validityRaw.duration, 'Plan duration');
        validity = {
          mode: choice(validityRaw.mode, ['relative_to_activation'], 'validity mode'),
          duration: {
            value: int(duration.value, 'Plan duration', 1, 3660),
            unit: choice(duration.unit, ['day', 'week', 'month'], 'duration unit'),
          },
        };
      }
      const scopeOfferingIds = ids(
        raw.scopeOfferingIds ?? policy.scope_offering_ids,
        'Plan offering scope',
        1,
      );
      const rawCredits = raw.credits ?? policy.credits;
      if (!Array.isArray(rawCredits))
        fail('invalid_specialist_setup', 'Plan credits must be a list.');
      const credits = rawCredits.map((entry) => {
        const credit = object(entry, 'Plan credit');
        const quantity = credit.quantity
          ? {
              quantityMinor: credit.quantity.quantity_minor,
              unit: credit.quantity.unit,
              scale: credit.quantity.scale,
            }
          : credit;
        return {
          quantityMinor: int(quantity.quantityMinor, 'Credit quantity', 0),
          unit: str(quantity.unit, 'Credit unit', 30),
          scale: int(quantity.scale, 'Credit scale', 0, 9),
          id: str(credit.id ?? credit.credit_id, 'Credit ID'),
          offeringIds: ids(credit.offeringIds ?? credit.offering_ids, 'Credit offerings', 1),
        };
      });
      if (
        new Set(credits.map((credit) => credit.id)).size !== credits.length ||
        credits.some((credit) => credit.offeringIds.some((id) => !scopeOfferingIds.includes(id)))
      )
        fail(
          'invalid_specialist_setup',
          'Credits must have unique IDs and stay within the plan offering scope.',
        );
      return {
        ...base,
        model,
        planId: str(raw.planId ?? policy.plan_id, 'Plan ID'),
        planVersion: int(raw.planVersion ?? policy.version, 'Plan version', 1),
        scopeOfferingIds,
        validity,
        credits,
        renewal: choice(
          raw.renewal ?? policy.renewal,
          ['none', 'manual', 'separately_authorized'],
          'renewal mode',
        ),
        creditCancellation: choice(
          raw.creditCancellation,
          ['restore_before_start', 'nonrefundable'],
          'credit cancellation policy',
        ),
      };
    }
    case 'FREIGHT': {
      if (!Array.isArray(raw.legs) || !raw.legs.length || raw.legs.length > 50)
        fail('invalid_specialist_setup', 'Configure at least one actual freight leg.');
      const legs: FreightLegSetup[] = raw.legs.map((entry) => {
        const leg = object(entry, 'Freight leg');
        if (!Array.isArray(leg.dimensions) || !leg.dimensions.length)
          fail(
            'invalid_specialist_setup',
            'Each freight leg needs typed cargo capacity dimensions.',
          );
        const dimensions = leg.dimensions.map((value) => {
          const dimension = object(value, 'Capacity dimension');
          return {
            resourceId: str(dimension.resourceId, 'Capacity resource'),
            unit: choice(
              dimension.unit,
              ['kg', 'g', 'cbm', 'container', 'pallet', 'item'],
              'cargo unit',
            ),
            scale: int(dimension.scale, 'Cargo scale', 0, 9),
          };
        });
        if (
          new Set(dimensions.map((dimension) => dimension.unit)).size !== dimensions.length ||
          new Set(dimensions.map((dimension) => dimension.resourceId)).size !== dimensions.length
        )
          fail(
            'invalid_specialist_setup',
            'Each cargo dimension requires its own uniquely typed capacity resource.',
          );
        const resourceIds = ids(leg.resourceIds, 'Freight controlled resources', 1);
        if (dimensions.some((dimension) => resourceIds.includes(dimension.resourceId)))
          fail(
            'invalid_specialist_setup',
            'A dimensional pool is distinct from its exclusive vehicle or handling resource.',
          );
        return {
          id: str(leg.id, 'Leg ID'),
          origin: str(leg.origin, 'Origin'),
          destination: str(leg.destination, 'Destination'),
          resourceIds,
          dimensions,
        };
      });
      if (new Set(legs.map((leg) => leg.id)).size !== legs.length)
        fail('invalid_specialist_setup', 'Freight leg IDs must be unique.');
      for (let i = 1; i < legs.length; i++)
        if (legs[i - 1]!.destination !== legs[i]!.origin)
          fail(
            'invalid_specialist_setup',
            'Consecutive freight legs must connect at the same location.',
          );
      if (typeof raw.requiresDocuments !== 'boolean' || typeof raw.requiresClearance !== 'boolean')
        fail('invalid_specialist_setup', 'Explicitly state document and clearance requirements.');
      return {
        ...base,
        model,
        legs,
        requiresDocuments: raw.requiresDocuments,
        requiresClearance: raw.requiresClearance,
        finalMode: choice(
          raw.finalMode,
          ['delivery', 'consignee_collection'],
          'final handoff mode',
        ),
      };
    }
  }
}

function role(
  id: string,
  type: SpecialistRole['role'],
  resources: string[],
  window: SpecialistInterval,
  quantities: SpecialistRole['quantities'] = [],
): SpecialistRole {
  if (
    new Set([...resources, ...quantities.map((quantity) => quantity.resourceId)]).size !==
    resources.length + quantities.length
  )
    fail('duplicate_specialist_resource', 'A role must not consume the same resource twice.');
  return {
    id,
    role: type,
    resourceIds: [...resources, ...quantities.map((quantity) => quantity.resourceId)],
    ...window,
    quantities,
  };
}
function matchQuantity(
  value: unknown,
  unit: string,
  scale: number,
  label: string,
): MeasuredQuantity {
  const result = measured(value, label);
  if (result.unit !== unit || result.scale !== scale)
    fail(
      'specialist_unit_mismatch',
      `${label} must use ${unit} with scale ${scale}; implicit unit conversion is unsupported.`,
    );
  return result;
}
function processingMinutes(start: number, end: number, setup: LinkedWindowsSetup): number {
  if (setup.calendarBasis === 'elapsed') return (end - start) / 60_000;
  let total = 0;
  const eat = 3 * 3600_000;
  for (
    let midnight = Math.floor((start + eat) / 86400_000) * 86400_000 - eat;
    midnight < end;
    midnight += 86400_000
  ) {
    if (!setup.workingDays.includes(new Date(midnight + eat).getUTCDay())) continue;
    const [oh, om] = setup.opens.split(':').map(Number),
      [ch, cm] = setup.closes.split(':').map(Number);
    total +=
      Math.max(
        0,
        Math.min(end, midnight + (ch! * 60 + cm!) * 60_000) -
          Math.max(start, midnight + (oh! * 60 + om!) * 60_000),
      ) / 60_000;
  }
  return total;
}
function linkedRoles(
  setup: LinkedWindowsSetup,
  raw: LinkedWindowsInput,
  includeProcessing: boolean,
): { input: LinkedWindowsInput; roles: SpecialistRole[] } {
  const incoming = interval(raw.incoming, 'Incoming window');
  const roles = setup.incomingResourceIds.length
    ? [role('incoming', 'incoming', setup.incomingResourceIds, incoming)]
    : [];
  const input: LinkedWindowsInput = { model: 'LINKED_WINDOWS', incoming };
  if (includeProcessing) {
    const processing = interval(raw.processing, 'Processing window'),
      outgoing = interval(raw.outgoing, 'Return window');
    if (
      instant(processing.startTime, 'Processing start') <
        instant(incoming.endTime, 'Incoming end') ||
      instant(outgoing.startTime, 'Return start') < instant(processing.endTime, 'Processing end')
    )
      fail(
        'infeasible_linked_windows',
        'Incoming, processing and return must be feasible in that order.',
      );
    const minutes = processingMinutes(
      Date.parse(processing.startTime),
      Date.parse(processing.endTime),
      setup,
    );
    if (minutes < setup.minimumProcessingMinutes || minutes > setup.maximumProcessingMinutes)
      fail(
        'infeasible_turnaround',
        'Processing does not fit the accepted minimum/maximum turnaround calendar.',
      );
    const workload = matchQuantity(
      raw.workload,
      setup.processingUnit,
      setup.quantityScale,
      'Processing workload',
    );
    roles.push(
      role('processing', 'processing', [], processing, [
        { ...workload, resourceId: setup.processingResourceId },
      ]),
    );
    if (setup.outgoingResourceIds.length)
      roles.push(role('outgoing', 'outgoing', setup.outgoingResourceIds, outgoing));
    Object.assign(input, { processing, outgoing, workload });
  }
  return { input, roles };
}
function planValidity(setup: EntitlementSetup, now: number) {
  if (setup.validity.mode === 'absolute_dates')
    return {
      starts: `${setup.validity.starts}T00:00:00+03:00`,
      ends: `${setup.validity.ends}T00:00:00+03:00`,
    };
  const local = new Date(now + 3 * 3600_000);
  const starts = new Date(now).toISOString();
  const duration = setup.validity.duration;
  if (duration.unit === 'month') {
    const day = local.getUTCDate();
    local.setUTCDate(1);
    local.setUTCMonth(local.getUTCMonth() + duration.value);
    const last = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0),
    ).getUTCDate();
    local.setUTCDate(Math.min(day, last));
  } else local.setUTCDate(local.getUTCDate() + duration.value * (duration.unit === 'week' ? 7 : 1));
  return { starts, ends: new Date(local.getTime() - 3 * 3600_000).toISOString() };
}

export function planSpecialistCommitment(args: {
  model: SpecialistModel;
  setup: SpecialistSetup | unknown;
  input: SpecialistBookingInput | unknown;
  quantity?: number;
  now: number;
  occurrence?: SpecialistOccurrence;
}): SpecialistPlan {
  const setup = normalizeSpecialistSetup(args.model, args.setup),
    raw = object(args.input, 'Specialist booking');
  if (raw.model !== args.model)
    fail('specialist_model_mismatch', 'Booking input must match its offering model.');
  const now = int(args.now, 'Trusted time', 0),
    quantity = int(args.quantity ?? 1, 'Quantity', 1);
  let input: SpecialistBookingInput,
    roles: SpecialistRole[] = [],
    workflowState: string,
    requiresApproval = true;
  switch (setup.model) {
    case 'SERVICE_JOB': {
      if (quantity !== 1)
        fail(
          'job_quantity',
          'Create one actual service job per booking; its accepted scope describes the items or workload.',
        );
      const requestedInterval =
        setup.jobSchedulingMode === 'queue'
          ? undefined
          : interval(
              raw.requestedInterval,
              setup.jobSchedulingMode === 'scheduled_intake'
                ? 'Service intake interval'
                : 'Service work interval',
            );
      if (setup.jobSchedulingMode === 'queue' && raw.requestedInterval !== undefined)
        fail(
          'queue_not_appointment',
          'A queue entry does not promise a future resource appointment.',
        );
      if (
        requestedInterval &&
        Date.parse(requestedInterval.endTime) - Date.parse(requestedInterval.startTime) !==
          setup.durationMinutes * 60000
      )
        fail(
          'invalid_job_duration',
          'The selected phase interval must match its exact configured duration.',
        );
      input = {
        model: 'SERVICE_JOB',
        jobDescription: str(raw.jobDescription, 'Job issue and item/asset description', 6000),
        ...(requestedInterval ? { requestedInterval } : {}),
      };
      if (raw.completionPromise !== undefined && raw.completionPromise !== '')
        input.completionPromise = new Date(
          instant(raw.completionPromise, 'Expected completion'),
        ).toISOString();
      if (requestedInterval)
        roles = [
          role(
            setup.jobSchedulingMode === 'scheduled_intake' ? 'job-intake' : 'job-work',
            setup.jobSchedulingMode === 'scheduled_intake' ? 'job_intake' : 'job_work',
            setup.resourceIds,
            requestedInterval,
          ),
        ];
      workflowState = 'REQUESTED';
      break;
    }
    case 'TOUR': {
      if (raw.itineraryVersion !== setup.itineraryVersion)
        fail('itinerary_changed', 'Review and accept the current itinerary version.');
      if (quantity < setup.minimumParticipants || quantity > setup.maximumParticipants)
        fail('participant_bounds', 'Participant count is outside this tour’s bounds.');
      if (setup.mode === 'shared') {
        const occurrence = args.occurrence;
        if (!occurrence || occurrence.id !== raw.occurrenceId)
          fail('tour_departure_required', 'Choose an actual published departure.');
        if (quantity > occurrence.capacity)
          fail('tour_capacity', 'This party exceeds the published departure capacity.');
        const window = interval(occurrence, 'Tour departure');
        const expected = [...setup.resourceIds, setup.poolResourceId!].sort();
        if ([...occurrence.resourceIds].sort().join('|') !== expected.sort().join('|'))
          fail(
            'tour_resource_mismatch',
            'The published departure resources do not match the accepted tour.',
          );
        roles = [
          {
            ...role('departure', 'tour_departure', [], window, [
              {
                resourceId: setup.poolResourceId!,
                quantityMinor: quantity,
                unit: 'place',
                scale: 0,
              },
            ]),
            occurrenceId: occurrence.id,
          },
        ];
        input = {
          model: 'TOUR',
          occurrenceId: occurrence.id,
          itineraryVersion: setup.itineraryVersion,
        };
      } else {
        const window = interval(raw, 'Private itinerary');
        roles = [role('private', 'tour_private', setup.resourceIds, window)];
        input = { model: 'TOUR', ...window, itineraryVersion: setup.itineraryVersion };
      }
      workflowState = 'ITINERARY_REVIEW';
      break;
    }
    case 'LINKED_WINDOWS': {
      const plan = linkedRoles(
        setup,
        raw as LinkedWindowsInput,
        setup.promiseMode === 'FIRM_PRE_ACCEPTED',
      );
      input = plan.input;
      roles = plan.roles;
      workflowState = 'REQUESTED';
      break;
    }
    case 'PRODUCTION_DUE': {
      const window = interval(
        { startTime: raw.productionStartTime, endTime: raw.dueTime },
        'Production commitment',
      );
      const due = Date.parse(window.endTime),
        start = Date.parse(window.startTime),
        local = new Date(due + 3 * 3600_000);
      if (start < now || due - now < setup.preparationLeadMinutes * 60_000)
        fail(
          'production_lead_time',
          'The due promise does not allow the configured preparation lead time.',
        );
      if (
        !setup.workingDays.includes(local.getUTCDay()) ||
        local.toISOString().slice(11, 16) > setup.cutoffLocalTime
      )
        fail(
          'production_cutoff',
          'The due promise must fall on a working day before the configured Kenya cutoff.',
        );
      const workload = matchQuantity(
        raw.workload,
        setup.capacityUnit,
        setup.quantityScale,
        'Production workload',
      );
      input = {
        model: 'PRODUCTION_DUE',
        specification: str(raw.specification, 'Production specification', 6000),
        specificationVersion: int(raw.specificationVersion, 'Specification version', 1),
        productionStartTime: window.startTime,
        dueTime: window.endTime,
        workload,
      };
      roles = [
        role('production', 'production', [], window, [
          { ...workload, resourceId: setup.capacityPoolId },
        ]),
      ];
      if (raw.handoff !== undefined) {
        if (!setup.handoffResourceIds.length)
          fail('unsupported_handoff', 'No timed handoff resource is configured.');
        const handoff = interval(raw.handoff, 'Handoff');
        if (Date.parse(handoff.startTime) < due)
          fail('infeasible_handoff', 'Handoff cannot precede the accepted production due promise.');
        input.handoff = handoff;
        roles.push(role('handoff', 'handoff', setup.handoffResourceIds, handoff));
      }
      workflowState = 'SPECIFICATION_REVIEW';
      requiresApproval = setup.approvalMode === 'required';
      break;
    }
    case 'ENTITLEMENT':
      input = { model: 'ENTITLEMENT' };
      workflowState = 'ACTIVATION_PENDING';
      break;
    case 'FREIGHT': {
      if (
        !Array.isArray(raw.cargo) ||
        !raw.cargo.length ||
        !Array.isArray(raw.legs) ||
        raw.legs.length !== setup.legs.length
      )
        fail('freight_scope_required', 'Declare exact cargo dimensions and every configured leg.');
      const cargo = raw.cargo.map((entry) => measured(entry, 'Cargo dimension'));
      if (new Set(cargo.map((entry) => entry.unit)).size !== cargo.length)
        fail('freight_unit_mismatch', 'Declare each cargo dimension once.');
      let priorEnd = -Infinity;
      const legs = setup.legs.map((leg) => {
        const source = raw.legs.find(
          (candidate: Record<string, unknown>) => candidate.id === leg.id,
        );
        const window = interval(source, `Freight leg ${leg.id}`);
        if (Date.parse(window.startTime) < priorEnd)
          fail(
            'infeasible_freight_legs',
            'Freight legs must occur in route order without overlapping.',
          );
        priorEnd = Date.parse(window.endTime);
        const quantities = leg.dimensions.map((dimension) => ({
          ...matchQuantity(
            cargo.find((entry) => entry.unit === dimension.unit),
            dimension.unit,
            dimension.scale,
            `Cargo ${dimension.unit}`,
          ),
          resourceId: dimension.resourceId,
        }));
        roles.push(role(`leg:${leg.id}`, 'freight_leg', leg.resourceIds, window, quantities));
        return { id: leg.id, ...window };
      });
      const supported = new Set(
        setup.legs.flatMap((leg) => leg.dimensions.map((dimension) => dimension.unit)),
      );
      if (cargo.some((entry) => !supported.has(entry.unit)))
        fail(
          'freight_unit_mismatch',
          'Every declared cargo dimension must have a controlled capacity constraint.',
        );
      input = {
        model: 'FREIGHT',
        cargoDescription: str(raw.cargoDescription, 'Cargo description', 2000),
        pieces: int(raw.pieces, 'Cargo pieces', 1),
        cargo,
        legs,
      };
      workflowState = 'CARGO_REVIEW';
      break;
    }
  }
  const acceptedTerms: SpecialistState = {
    model: setup.model,
    state: workflowState,
    version: 1,
    setup,
    input,
    roles,
    supplierConfirmations: [],
    custody: 'not_received',
    history: [],
    ...(setup.model === 'SERVICE_JOB'
      ? {
          job: {
            intakeReceived: false,
            partsRequired: setup.partsRequired,
            committedRoleIds: [],
            activeRoleIds: [],
            completedRoleIds: [],
          },
        }
      : {}),
    ...(setup.model === 'ENTITLEMENT'
      ? {
          ...(setup.validity.mode === 'absolute_dates'
            ? { validity: planValidity(setup, now) }
            : {}),
          credits: structuredClone(setup.credits),
          usedOccurrenceKeys: [],
        }
      : {}),
  };
  return {
    model: setup.model,
    workflowState,
    roles,
    acceptedTerms,
    publicSummary: specialistPublicSummary(acceptedTerms),
    requiresApproval,
    requiresSupplierConfirmation: !!setup.supplierComponents.length,
  };
}

function approval(value: unknown, expectedVersion: number): SpecialistApproval {
  const raw = object(value, 'Accepted scope');
  if (int(raw.version, 'Accepted version', 1) !== expectedVersion)
    fail(
      'specialist_approval_changed',
      'The current exact specification/itinerary/plan version must be accepted.',
    );
  const acceptedAt = new Date(instant(raw.acceptedAt, 'Acceptance time')).toISOString();
  return {
    version: raw.version,
    acceptedBy: str(raw.acceptedBy, 'Accepting actor'),
    acceptedAt,
    priceMinor: int(raw.priceMinor, 'Accepted KES minor-unit price', 0),
  };
}
function sourceConfirmations(
  setup: SpecialistSetup,
  current: SupplierConfirmation[],
  supplied: unknown,
): SupplierConfirmation[] {
  if (supplied !== undefined && !Array.isArray(supplied))
    fail('supplier_evidence_required', 'Supplier confirmations must be a list.');
  const result = [...current];
  for (const entry of (supplied ?? []) as unknown[]) {
    const raw = object(entry, 'Supplier evidence');
    const componentId = str(raw.componentId, 'Supplier component'),
      component = setup.supplierComponents.find((candidate) => candidate.id === componentId);
    if (!component)
      fail('unknown_supplier_component', 'Supplier evidence must belong to the accepted scope.');
    const verification = choice(
      raw.verification,
      ['merchant_asserted', 'provider_verified'],
      'supplier verification',
    );
    if (component.evidenceKind === 'provider_api' && verification !== 'provider_verified')
      fail('supplier_api_required', 'This component requires its authoritative provider adapter.');
    const value = {
      componentId,
      reference: str(raw.reference, 'Supplier reference', 500),
      verification,
    };
    const index = result.findIndex((candidate) => candidate.componentId === componentId);
    if (index >= 0) result[index] = value;
    else result.push(value);
  }
  return result;
}
function expectedScopeVersion(state: SpecialistState): number {
  if (state.input.model === 'PRODUCTION_DUE') return state.input.specificationVersion;
  if (state.setup.model === 'TOUR') return state.setup.itineraryVersion;
  if (state.setup.model === 'ENTITLEMENT') return state.setup.planVersion;
  return state.setup.version;
}
function trustedEvidence(input: SpecialistTransitionInput): string {
  return str(input.evidence, 'Actual milestone evidence', 2000);
}
function validEntitlement(state: SpecialistState, now: number) {
  if (
    !state.validity ||
    now < Date.parse(state.validity.starts) ||
    now >= Date.parse(state.validity.ends)
  )
    fail('entitlement_expired', 'This entitlement is outside its accepted validity period.');
}
function transitionServiceJob(args: {
  current: SpecialistState;
  command: string;
  input?: SpecialistTransitionInput;
  now: number;
  actor: 'merchant' | 'customer' | 'provider';
  paymentSatisfied: boolean;
}): { next: SpecialistState; effects: SpecialistEffect[]; publicSummary: SpecialistPublicSummary } {
  const { current, command, now } = args,
    input = args.input ?? {};
  if (
    current.setup.model !== 'SERVICE_JOB' ||
    current.input.model !== 'SERVICE_JOB' ||
    !current.job
  )
    fail('job_contract_required', 'The accepted service job setup and scope are required.');
  const setup = current.setup,
    edge = graphs.SERVICE_JOB[command];
  if (!edge || !edge.from.includes(current.state))
    fail(
      'invalid_specialist_transition',
      'That service job command is unavailable in its current state.',
    );
  const next = structuredClone(current),
    job = next.job!,
    effects: SpecialistEffect[] = [];
  let evidence: string | undefined;
  const phase = (
    id: string,
    type: SpecialistRole['role'],
    resources = setup.resourceIds,
    duration = setup.durationMinutes,
  ) =>
    role(id, type, resources, {
      startTime: new Date(now).toISOString(),
      endTime: new Date(now + duration * 60000).toISOString(),
    });
  const commit = (planned: SpecialistRole) => {
    if (job.committedRoleIds.includes(planned.id))
      fail('job_role_already_committed', 'This exact job phase is already reserved.');
    next.roles = [...next.roles.filter((candidate) => candidate.id !== planned.id), planned];
    job.committedRoleIds.push(planned.id);
    effects.push({ type: 'allocate', roles: [planned] });
  };
  const release = (id: string) => {
    if (job.committedRoleIds.includes(id) && !job.completedRoleIds.includes(id)) {
      effects.push({ type: 'release', roleIds: [id] });
      job.completedRoleIds.push(id);
      job.activeRoleIds = job.activeRoleIds.filter((candidate) => candidate !== id);
    }
  };
  const begin = (id: string) => {
    const planned = next.roles.find((candidate) => candidate.id === id);
    if (!planned || !job.committedRoleIds.includes(id) || job.completedRoleIds.includes(id))
      fail('job_role_required', 'An actual live allocation is required before this phase begins.');
    if (now < Date.parse(planned.startTime) || now >= Date.parse(planned.endTime))
      fail('job_phase_time', 'Begin this actual phase within its accepted reserved interval.');
    if (!job.activeRoleIds.includes(id)) {
      job.activeRoleIds.push(id);
      effects.push({ type: 'begin', roleIds: [id] });
    }
  };
  const payment = () => {
    if (!args.paymentSatisfied)
      fail(
        'specialist_payment_required',
        'The accepted payment prerequisite must be satisfied before this job phase.',
      );
  };
  const accepted = () => {
    if (!current.approval)
      fail(
        'specialist_approval_required',
        'The current exact job scope and price must be accepted.',
      );
  };
  const suppliers = () => {
    next.supplierConfirmations = sourceConfirmations(
      setup,
      current.supplierConfirmations,
      input.supplierConfirmations,
    );
    if (
      setup.supplierComponents.some(
        (component) =>
          !next.supplierConfirmations.some(
            (confirmation) => confirmation.componentId === component.id,
          ),
      )
    )
      fail(
        'supplier_confirmation_pending',
        'Every contracted service supplier component must be confirmed.',
      );
  };
  const parts = () => {
    if (!job.partsRequired) return;
    const supplied = input.partsConfirmation ?? job.partsConfirmation;
    const raw = object(supplied, 'Authoritative required parts confirmation');
    const verification = choice(
      raw.verification,
      ['merchant_asserted', 'provider_verified'],
      'parts verification',
    );
    if (verification === 'provider_verified' && args.actor !== 'provider')
      fail(
        'provider_evidence_forbidden',
        'Only the verified parts provider may assert provider verification.',
      );
    if (setup.partsEvidenceKind === 'provider_api' && verification !== 'provider_verified')
      fail(
        'parts_source_confirmation_required',
        'The configured parts owner requires its authoritative provider confirmation.',
      );
    job.partsConfirmation = {
      reference: str(raw.reference, 'Actual required parts availability reference', 500),
      verification,
    };
  };
  if (['AcceptFixedScopeServiceJob', 'ApproveServiceJob', 'StartDiagnosis'].includes(command)) {
    next.approval = approval(input.approval, setup.version);
    if (Date.parse(next.approval.acceptedAt) > now)
      fail('invalid_specialist_approval', 'Acceptance cannot be in the future.');
  }
  if (
    ![
      'AcceptFixedScopeServiceJob',
      'ApproveServiceJob',
      'ConfirmServiceWorkSlot',
      'ConfirmServiceIntakeSlot',
    ].includes(command)
  )
    evidence = trustedEvidence(input);
  if (command === 'ConfirmServiceIntakeSlot') {
    if (setup.jobSchedulingMode !== 'scheduled_intake')
      fail('job_schedule_mode', 'This offering does not promise a separate intake appointment.');
    payment();
    const planned = current.roles.find((candidate) => candidate.role === 'job_intake');
    if (!planned || Date.parse(planned.startTime) < now)
      fail('job_phase_time', 'Choose an actual future intake interval.');
    commit(planned);
  } else if (command === 'AcceptServiceIntake') {
    if (job.intakeReceived) fail('job_intake_recorded', 'Actual job intake was already recorded.');
    if (setup.jobSchedulingMode === 'scheduled_intake') {
      if (current.state !== 'INTAKE_SCHEDULED')
        fail(
          'job_intake_slot_required',
          'Confirm the configured intake slot before recording arrival.',
        );
      begin('job-intake');
    }
    job.intakeReceived = true;
    if (setup.custodyMode === 'merchant_holds') {
      commit(
        phase('job-custody', 'job_custody', setup.custodyResourceIds, setup.custodyDurationMinutes),
      );
      begin('job-custody');
      next.custody = 'held';
    }
  } else if (command === 'StartDiagnosis') {
    if (setup.assessmentMode !== 'diagnosis_required' || !job.intakeReceived)
      fail(
        'job_assessment_mode',
        'Actual intake and a configured diagnostic assessment are required.',
      );
    payment();
    release('job-intake');
    commit(phase('job-diagnosis', 'job_diagnosis'));
    begin('job-diagnosis');
  } else if (command === 'IssueServiceQuote') {
    if (setup.assessmentMode !== 'diagnosis_required' || input.scopeVersion !== setup.version)
      fail('job_assessment_mode', 'Quote the current exact diagnostic job scope.');
    if (typeof input.partsRequired !== 'boolean')
      fail(
        'job_parts_scope_required',
        'Declare whether the assessed approved scope requires parts.',
      );
    job.findings = str(input.findings, 'Diagnostic findings and proposed work scope', 6000);
    job.partsRequired = input.partsRequired;
    delete job.partsConfirmation;
    delete next.approval;
    release('job-diagnosis');
    release('job-intake');
  } else if (command === 'AcceptFixedScopeServiceJob') {
    if (setup.assessmentMode !== 'fixed_scope')
      fail(
        'job_assessment_required',
        'This job requires diagnosis and its current accepted quotation.',
      );
    release('job-intake');
  } else if (command === 'ApproveServiceJob') {
    if (setup.assessmentMode !== 'diagnosis_required' || !job.findings)
      fail('job_assessment_required', 'The actual findings and proposed scope must be present.');
  } else if (command === 'RequestServiceParts') {
    if (!job.partsRequired)
      fail('job_parts_not_required', 'This accepted job has no required parts gate.');
  } else if (command === 'ConfirmServiceWorkSlot') {
    if (setup.jobSchedulingMode !== 'scheduled_work')
      fail(
        'job_schedule_mode',
        'This offering promises intake or queue handling, not a future whole-work appointment.',
      );
    accepted();
    payment();
    suppliers();
    parts();
    const planned = current.roles.find((candidate) => candidate.role === 'job_work');
    if (!planned || Date.parse(planned.startTime) < now)
      fail('job_phase_time', 'Choose a future exact work interval.');
    commit(planned);
  } else if (command === 'StartRepair' || command === 'StartNoPartsService') {
    if (!job.intakeReceived)
      fail('job_intake_required', 'Record actual item/site intake and condition before execution.');
    accepted();
    payment();
    suppliers();
    if (command === 'StartRepair') {
      if (!job.partsRequired) fail('job_parts_not_required', 'This is the no-parts service route.');
      parts();
    } else if (job.partsRequired)
      fail(
        'job_parts_confirmation_required',
        'This approved job requires its actual parts confirmation.',
      );
    release('job-intake');
    if (setup.jobSchedulingMode === 'scheduled_work') {
      if (!job.committedRoleIds.includes('job-work'))
        fail('job_work_slot_required', 'Confirm the actual reserved work slot first.');
    } else commit(phase('job-work', 'job_work'));
    begin('job-work');
  } else if (command === 'ApproveServiceRelease') release('job-work');
  else if (command === 'ConfirmServiceHandover') {
    release('job-custody');
    next.custody = 'released';
  }
  next.state =
    command === 'AcceptServiceIntake' && ['APPROVED', 'WORK_SCHEDULED'].includes(current.state)
      ? current.state
      : edge.to;
  next.version += 1;
  next.history.push({
    command,
    at: new Date(now).toISOString(),
    ...(evidence ? { evidence } : {}),
  });
  return { next, effects, publicSummary: specialistPublicSummary(next) };
}
const graphs: Record<SpecialistModel, Record<string, { from: string[]; to: string }>> = {
  TOUR: {
    AcceptTourScope: { from: ['ITINERARY_REVIEW', 'QUOTED'], to: 'APPROVED' },
    ConfirmTour: { from: ['APPROVED'], to: 'READY_TO_DEPART' },
    StartTour: { from: ['READY_TO_DEPART'], to: 'ON_TOUR' },
    SubmitTourCompletion: { from: ['ON_TOUR'], to: 'COMPLETION_REVIEW' },
    CompleteTour: { from: ['COMPLETION_REVIEW'], to: 'COMPLETED' },
  },
  LINKED_WINDOWS: {
    AcceptLinkedScope: { from: ['REQUESTED'], to: 'APPROVED' },
    ConfirmCustomerDropoffPromise: { from: ['REQUESTED', 'APPROVED'], to: 'DROPOFF_EXPECTED' },
    ConfirmCollectionLeg: { from: ['REQUESTED', 'APPROVED'], to: 'COLLECTION_CONFIRMED' },
    ConfirmGoodsCollected: { from: ['COLLECTION_CONFIRMED'], to: 'COLLECTED' },
    ReceiveForProcessing: { from: ['COLLECTED'], to: 'RECEIVED_FOR_PROCESSING' },
    ReceiveCustomerDropoff: {
      from: ['REQUESTED', 'APPROVED', 'DROPOFF_EXPECTED'],
      to: 'RECEIVED_FOR_PROCESSING',
    },
    ApproveProcessingPrice: {
      from: ['RECEIVED_FOR_PROCESSING', 'ASSESSMENT_PENDING'],
      to: 'PRICE_APPROVED',
    },
    StartProcessing: { from: ['PRICE_APPROVED'], to: 'PROCESSING' },
    FinishProcessing: { from: ['PROCESSING'], to: 'READY_FOR_RETURN' },
    ConfirmReturnLeg: { from: ['READY_FOR_RETURN'], to: 'RETURN_CONFIRMED' },
    CompleteReturn: { from: ['RETURN_CONFIRMED'], to: 'COMPLETED' },
  },
  PRODUCTION_DUE: {
    AcceptProductionScope: { from: ['SPECIFICATION_REVIEW', 'QUOTED'], to: 'APPROVED' },
    CommitProduction: { from: ['APPROVED'], to: 'PRODUCTION_COMMITTED' },
    StartProduction: { from: ['PRODUCTION_COMMITTED'], to: 'IN_PRODUCTION' },
    SubmitProductionResult: { from: ['IN_PRODUCTION'], to: 'QUALITY_CHECK' },
    ReturnProductionForCorrection: { from: ['QUALITY_CHECK'], to: 'IN_PRODUCTION' },
    ApproveProductionResult: { from: ['QUALITY_CHECK'], to: 'READY_FOR_HANDOVER' },
    CompleteProductionHandover: { from: ['READY_FOR_HANDOVER'], to: 'COMPLETED' },
  },
  ENTITLEMENT: {
    ActivateMembership: { from: ['ACTIVATION_PENDING'], to: 'ACTIVE' },
    PauseMembership: { from: ['ACTIVE'], to: 'PAUSED' },
    ResumeMembership: { from: ['PAUSED'], to: 'ACTIVE' },
    ExpireMembership: { from: ['ACTIVE', 'PAUSED'], to: 'EXPIRED' },
    RedeemEntitlement: { from: ['ACTIVE'], to: 'ACTIVE' },
    BookEntitledOffering: { from: ['ACTIVE'], to: 'ACTIVE' },
    RestoreEntitlementCredit: {
      from: ['ACTIVE', 'PAUSED', 'EXHAUSTED', 'EXPIRED', 'CANCELLED'],
      to: 'ACTIVE',
    },
  },
  FREIGHT: {
    AcceptFreightQuote: { from: ['CARGO_REVIEW', 'QUOTED'], to: 'APPROVED' },
    ConfirmFreightBooking: { from: ['APPROVED'], to: 'BOOKED' },
    ClearFreightDocuments: { from: ['BOOKED'], to: 'DOCUMENTATION_READY' },
    ConfirmFreightCollection: { from: ['BOOKED', 'DOCUMENTATION_READY'], to: 'COLLECTED' },
    ConfirmFreightDeparture: { from: ['COLLECTED'], to: 'IN_TRANSIT' },
    RecordFreightClearanceArrival: { from: ['IN_TRANSIT'], to: 'CLEARANCE_REVIEW' },
    ConfirmFreightClearance: { from: ['CLEARANCE_REVIEW'], to: 'CLEARED' },
    ConfirmFreightDestinationArrival: { from: ['IN_TRANSIT', 'CLEARED'], to: 'AT_DESTINATION' },
    ConfirmFreightDelivery: { from: ['AT_DESTINATION'], to: 'DELIVERED' },
    ConfirmConsigneeCollection: { from: ['AT_DESTINATION'], to: 'COLLECTED_BY_CONSIGNEE' },
    CloseFreight: { from: ['DELIVERED', 'COLLECTED_BY_CONSIGNEE'], to: 'CLOSED' },
  },
  SERVICE_JOB: {
    ConfirmServiceIntakeSlot: { from: ['REQUESTED'], to: 'INTAKE_SCHEDULED' },
    AcceptServiceIntake: {
      from: ['REQUESTED', 'INTAKE_SCHEDULED', 'APPROVED', 'WORK_SCHEDULED'],
      to: 'INTAKE_REVIEW',
    },
    StartDiagnosis: { from: ['INTAKE_REVIEW'], to: 'DIAGNOSIS' },
    IssueServiceQuote: { from: ['DIAGNOSIS', 'QUOTED'], to: 'QUOTED' },
    ApproveServiceJob: { from: ['QUOTED'], to: 'APPROVED' },
    AcceptFixedScopeServiceJob: { from: ['REQUESTED', 'INTAKE_REVIEW'], to: 'APPROVED' },
    RequestServiceParts: { from: ['APPROVED'], to: 'PARTS_PENDING' },
    ConfirmServiceWorkSlot: { from: ['APPROVED', 'PARTS_PENDING'], to: 'WORK_SCHEDULED' },
    StartRepair: { from: ['PARTS_PENDING', 'WORK_SCHEDULED'], to: 'IN_SERVICE' },
    StartNoPartsService: { from: ['APPROVED', 'WORK_SCHEDULED'], to: 'IN_SERVICE' },
    SubmitServiceResult: { from: ['IN_SERVICE'], to: 'QUALITY_REVIEW' },
    ReturnServiceForCorrection: { from: ['QUALITY_REVIEW'], to: 'IN_SERVICE' },
    ApproveServiceRelease: { from: ['QUALITY_REVIEW'], to: 'READY_FOR_RELEASE' },
    ConfirmServiceHandover: { from: ['READY_FOR_RELEASE'], to: 'RELEASED' },
    CompleteServiceJob: { from: ['RELEASED'], to: 'COMPLETED' },
  },
};
const terminal = new Set(['CANCELLED', 'COMPLETED', 'CLOSED', 'EXPIRED']);
const acceptanceCommands = new Set([
  'AcceptTourScope',
  'AcceptProductionScope',
  'AcceptFreightQuote',
  'AcceptLinkedScope',
  'ActivateMembership',
  'ApproveProcessingPrice',
]);
const allocationCommands = new Set([
  'ConfirmTour',
  'ConfirmCollectionLeg',
  'ReceiveCustomerDropoff',
  'ConfirmCustomerDropoffPromise',
  'CommitProduction',
  'ConfirmFreightBooking',
]);

/** The host supplies identity, trusted acceptance, verified adapter evidence and
 * a clock. In particular, never trust provider_verified from a browser body. */
export function transitionSpecialist(args: {
  current: SpecialistState;
  command: string;
  input?: SpecialistTransitionInput;
  now: number;
  actor: 'merchant' | 'customer' | 'provider';
  paymentSatisfied: boolean;
}): { next: SpecialistState; effects: SpecialistEffect[]; publicSummary: SpecialistPublicSummary } {
  const current = args.current,
    input = args.input ?? {},
    now = int(args.now, 'Trusted time', 0),
    command = args.command;
  if (
    args.actor === 'customer' &&
    ![
      'AcceptTourScope',
      'AcceptProductionScope',
      'AcceptFreightQuote',
      'AcceptLinkedScope',
      'AcceptFixedScopeServiceJob',
      'ApproveServiceJob',
      'RedeemEntitlement',
      'BookEntitledOffering',
      'RequestSpecialistCancellation',
    ].includes(command)
  )
    fail('specialist_forbidden', 'This action needs the merchant or owning provider.');
  if (
    input.supplierConfirmations?.some((entry) => entry.verification === 'provider_verified') &&
    args.actor !== 'provider'
  )
    fail(
      'provider_evidence_forbidden',
      'Only a verified provider adapter may assert provider verification.',
    );
  if (terminal.has(current.state) && command !== 'RestoreEntitlementCredit')
    fail('specialist_closed', 'This specialist work is already closed.');
  const next: SpecialistState = structuredClone(current),
    effects: SpecialistEffect[] = [];
  if (
    current.model === 'SERVICE_JOB' &&
    !['RequestSpecialistCancellation', 'ConfirmSpecialistCancellation'].includes(command)
  )
    return transitionServiceJob(args);
  let evidence: string | undefined;
  if (command === 'IssueSpecialistQuote') {
    if (args.actor !== 'merchant')
      fail('specialist_forbidden', 'Only the merchant quoting authority can issue this quote.');
    const allowed =
      current.model === 'LINKED_WINDOWS'
        ? ['REQUESTED', 'ASSESSMENT_PENDING', 'RECEIVED_FOR_PROCESSING']
        : current.model === 'ENTITLEMENT'
          ? []
          : ['ITINERARY_REVIEW', 'SPECIFICATION_REVIEW', 'CARGO_REVIEW', 'QUOTED'];
    if (!allowed.includes(current.state))
      fail(
        'invalid_specialist_transition',
        'A quote can be issued only while exact specialist scope remains under review.',
      );
    if (input.scopeVersion !== expectedScopeVersion(current))
      fail('specialist_approval_changed', 'Quote the current exact accepted scope version.');
    delete next.approval;
    if (current.model !== 'LINKED_WINDOWS') next.state = 'QUOTED';
  } else if (command === 'RequestSpecialistCancellation') {
    if (
      [
        'ON_TOUR',
        'COMPLETION_REVIEW',
        'IN_PRODUCTION',
        'IN_SERVICE',
        'PROCESSING',
        'COLLECTED',
        'IN_TRANSIT',
        'CLEARANCE_REVIEW',
        'CLEARED',
        'AT_DESTINATION',
        'DELIVERED',
        'COLLECTED_BY_CONSIGNEE',
      ].includes(current.state) ||
      current.custody === 'held'
    )
      fail(
        'specialist_custody_recovery_required',
        'Started work or held goods need an explicit recovery/handover; cancellation cannot erase them.',
      );
    evidence = trustedEvidence(input);
    next.state = 'CANCELLATION_REVIEW';
  } else if (command === 'ConfirmSpecialistCancellation') {
    if (current.state !== 'CANCELLATION_REVIEW' || current.custody === 'held')
      fail(
        'invalid_specialist_transition',
        'Cancellation review and cleared custody are required.',
      );
    evidence = trustedEvidence(input);
    next.state = 'CANCELLED';
    effects.push({ type: 'release', roleIds: current.roles.map((entry) => entry.id) });
  } else {
    const edge = graphs[current.model][command];
    if (!edge || !edge.from.includes(current.state))
      fail(
        'invalid_specialist_transition',
        'That command is unavailable in the current work state.',
      );
    if (acceptanceCommands.has(command)) {
      next.approval = approval(input.approval, expectedScopeVersion(current));
      if (Date.parse(next.approval.acceptedAt) > now)
        fail('invalid_specialist_approval', 'Acceptance cannot be dated in the future.');
    } else if (
      ![
        'ConfirmTour',
        'ConfirmCollectionLeg',
        'ConfirmCustomerDropoffPromise',
        'CommitProduction',
        'ConfirmFreightBooking',
        'RedeemEntitlement',
        'BookEntitledOffering',
        'ExpireMembership',
      ].includes(command)
    )
      evidence = trustedEvidence(input);
    if (allocationCommands.has(command)) {
      if (!args.paymentSatisfied)
        fail('specialist_payment_required', 'The accepted payment prerequisite is not satisfied.');
      if (
        !current.approval &&
        !(
          [
            'ConfirmCollectionLeg',
            'ReceiveCustomerDropoff',
            'ConfirmCustomerDropoffPromise',
          ].includes(command) &&
          (current.setup as LinkedWindowsSetup).promiseMode === 'ASSESSMENT_REQUIRED'
        )
      )
        fail(
          'specialist_approval_required',
          'The exact accepted scope and price are required before commitment.',
        );
      next.supplierConfirmations = sourceConfirmations(
        current.setup,
        current.supplierConfirmations,
        input.supplierConfirmations,
      );
      if (
        current.setup.supplierComponents.some(
          (component) =>
            !next.supplierConfirmations.some(
              (confirmation) => confirmation.componentId === component.id,
            ),
        )
      )
        fail(
          'supplier_confirmation_pending',
          'Every contracted supplier component must be authoritatively confirmed.',
        );
      if (!(command === 'ReceiveCustomerDropoff' && current.state === 'DROPOFF_EXPECTED'))
        effects.push({ type: 'allocate', roles: structuredClone(current.roles) });
    }
    if (current.model === 'LINKED_WINDOWS') {
      const setup = current.setup as LinkedWindowsSetup;
      if (
        setup.incomingMethod === 'CUSTOMER_DROPOFF' &&
        ['ConfirmCollectionLeg', 'ConfirmGoodsCollected', 'ReceiveForProcessing'].includes(command)
      )
        fail(
          'linked_incoming_method',
          'Customer drop-off uses direct intake receipt, without collection-carrier milestones.',
        );
      if (
        setup.incomingMethod !== 'CUSTOMER_DROPOFF' &&
        ['ReceiveCustomerDropoff', 'ConfirmCustomerDropoffPromise'].includes(command)
      )
        fail(
          'linked_incoming_method',
          'This accepted incoming method requires actual collection and merchant receipt.',
        );
      if (command === 'ConfirmGoodsCollected') next.custody = 'held';
      if (command === 'ReceiveForProcessing' || command === 'ReceiveCustomerDropoff') {
        next.custody = 'held';
        if (setup.promiseMode === 'ASSESSMENT_REQUIRED')
          edge.to === 'RECEIVED_FOR_PROCESSING' && (next.state = 'ASSESSMENT_PENDING');
      }
      if (command === 'ApproveProcessingPrice') {
        if (!args.paymentSatisfied)
          fail(
            'specialist_payment_required',
            'The accepted payment prerequisite is not satisfied.',
          );
        if (setup.promiseMode === 'ASSESSMENT_REQUIRED') {
          const planned = linkedRoles(
            setup,
            {
              ...(current.input as LinkedWindowsInput),
              processing: input.processing,
              outgoing: input.outgoing,
              workload: input.workload,
            },
            true,
          );
          const roles = planned.roles.filter((entry) => entry.role !== 'incoming');
          next.input = planned.input;
          next.roles = planned.roles;
          effects.push({ type: 'allocate', roles });
        }
      }
      if (command === 'CompleteReturn') {
        next.custody = 'released';
        effects.push({ type: 'release', roleIds: next.roles.map((entry) => entry.id) });
      }
    }
    if (current.model === 'PRODUCTION_DUE' && command === 'StartProduction') next.custody = 'held';
    if (current.model === 'PRODUCTION_DUE' && command === 'CompleteProductionHandover') {
      next.custody = 'released';
      effects.push({ type: 'release', roleIds: next.roles.map((entry) => entry.id) });
    }
    if (current.model === 'ENTITLEMENT') {
      if (command === 'ActivateMembership' && current.setup.model === 'ENTITLEMENT')
        next.validity = planValidity(current.setup, now);
      if (command === 'ActivateMembership' || command === 'ResumeMembership') {
        validEntitlement(next, now);
        if (!args.paymentSatisfied)
          fail(
            'specialist_payment_required',
            'The accepted enrollment payment prerequisite is not satisfied.',
          );
      }
      if (
        command === 'ExpireMembership' &&
        (!current.validity || now < Date.parse(current.validity.ends))
      )
        fail('entitlement_not_expired', 'The accepted entitlement period has not ended.');
      if (command === 'RedeemEntitlement' || command === 'BookEntitledOffering') {
        validEntitlement(current, now);
        const setup = current.setup as EntitlementSetup,
          offeringId = str(input.offeringId, 'Redeemed offering'),
          occurrenceKey = str(input.occurrenceKey, 'Occurrence identity');
        if (!setup.scopeOfferingIds.includes(offeringId))
          fail('entitlement_scope', 'The selected offering is outside the accepted plan.');
        if (current.usedOccurrenceKeys?.includes(occurrenceKey))
          fail(
            'entitlement_duplicate_occurrence',
            'This entitlement occurrence was already redeemed.',
          );
        const booking = object(input.booking, 'Actual child booking');
        next.usedOccurrenceKeys = [...(next.usedOccurrenceKeys ?? []), occurrenceKey];
        if (command === 'BookEntitledOffering') {
          if (setup.credits.length)
            fail(
              'entitlement_credit_required',
              'This accepted plan requires its applicable credit usage.',
            );
          effects.push({
            type: 'book_entitled',
            offeringId,
            occurrenceKey,
            booking: structuredClone(booking),
          });
        } else {
          const credit = next.credits?.find((entry) => entry.id === input.creditId);
          if (!credit || !credit.offeringIds.includes(offeringId))
            fail('entitlement_scope', 'Choose a credit applicable to this actual offering.');
          const quantityMinor = int(input.quantityMinor, 'Credit usage', 1);
          if (input.unit !== credit.unit || input.scale !== credit.scale)
            fail(
              'specialist_unit_mismatch',
              'Credit use must preserve the accepted unit and precision.',
            );
          if (quantityMinor > credit.quantityMinor)
            fail('entitlement_exhausted', 'This entitlement has insufficient remaining credit.');
          credit.quantityMinor -= quantityMinor;
          next.redemptions = [
            ...(next.redemptions ?? []),
            {
              occurrenceKey,
              creditId: credit.id,
              quantityMinor,
              unit: credit.unit,
              scale: credit.scale,
              offeringId,
              restored: false,
            },
          ];
          effects.push({
            type: 'redeem',
            creditId: credit.id,
            quantityMinor,
            unit: credit.unit,
            scale: credit.scale,
            offeringId,
            occurrenceKey,
            booking: structuredClone(booking),
          });
        }
      }
      if (command === 'RestoreEntitlementCredit') {
        if ((current.setup as EntitlementSetup).creditCancellation !== 'restore_before_start')
          fail(
            'entitlement_credit_nonrefundable',
            'The accepted plan does not restore cancelled booking credits.',
          );
        const cancelled = object(input.cancelledBooking, 'Verified cancelled booking');
        const key = str(cancelled.occurrenceKey, 'Cancelled occurrence identity');
        const entry = next.redemptions?.find((candidate) => candidate.occurrenceKey === key);
        if (!entry || entry.restored)
          fail('entitlement_restore_duplicate', 'This occurrence has no unrestored credit use.');
        if (
          instant(cancelled.cancelledAt, 'Cancellation time') > now ||
          instant(cancelled.startTime, 'Child start') <= now
        )
          fail(
            'entitlement_restore_policy',
            'This plan restores credits only for a verified cancellation before the child starts.',
          );
        const credit = next.credits?.find((candidate) => candidate.id === entry.creditId);
        if (!credit || !Number.isSafeInteger(credit.quantityMinor + entry.quantityMinor))
          fail(
            'entitlement_credit_invalid',
            'The original accepted credit ledger must be available.',
          );
        credit.quantityMinor += entry.quantityMinor;
        entry.restored = true;
        effects.push({
          type: 'restore_credit',
          creditId: entry.creditId,
          quantityMinor: entry.quantityMinor,
          unit: entry.unit,
          scale: entry.scale,
          occurrenceKey: key,
          bookingId: str(cancelled.bookingId, 'Cancelled child booking'),
        });
      }
    }
    if (current.model === 'FREIGHT') {
      const setup = current.setup as FreightSetup;
      if (
        command === 'ConfirmFreightCollection' &&
        setup.requiresDocuments &&
        current.state !== 'DOCUMENTATION_READY'
      )
        fail(
          'freight_documents_required',
          'Required cargo documents must be cleared before collection.',
        );
      if (command === 'RecordFreightClearanceArrival' && !setup.requiresClearance)
        fail('freight_clearance_not_applicable', 'This domestic route has no clearance stage.');
      if (
        command === 'ConfirmFreightDestinationArrival' &&
        setup.requiresClearance &&
        current.state !== 'CLEARED'
      )
        fail('freight_clearance_required', 'The route’s actual clearance result is required.');
      if (command === 'ConfirmFreightDelivery' && setup.finalMode !== 'delivery')
        fail('freight_final_mode', 'This contract requires consignee collection.');
      if (command === 'ConfirmConsigneeCollection' && setup.finalMode !== 'consignee_collection')
        fail('freight_final_mode', 'This contract requires delivery.');
      if (command === 'ConfirmFreightCollection') next.custody = 'held';
      if (['ConfirmFreightDelivery', 'ConfirmConsigneeCollection'].includes(command)) {
        next.custody = 'released';
        effects.push({ type: 'release', roleIds: next.roles.map((entry) => entry.id) });
      }
    }
    if (current.model === 'TOUR' && command === 'StartTour') next.custody = 'held';
    if (current.model === 'TOUR' && command === 'CompleteTour') {
      next.custody = 'released';
      effects.push({ type: 'release', roleIds: next.roles.map((entry) => entry.id) });
    }
    if (command === 'RestoreEntitlementCredit') next.state = current.state;
    else if (
      !(
        current.model === 'LINKED_WINDOWS' &&
        ['ReceiveForProcessing', 'ReceiveCustomerDropoff'].includes(command) &&
        (current.setup as LinkedWindowsSetup).promiseMode === 'ASSESSMENT_REQUIRED'
      )
    )
      next.state = edge.to;
  }
  next.version += 1;
  next.history.push({
    command,
    at: new Date(now).toISOString(),
    ...(evidence ? { evidence } : {}),
  });
  return { next, effects, publicSummary: specialistPublicSummary(next) };
}

export function specialistPublicSummary(current: SpecialistState): SpecialistPublicSummary {
  const details: Record<string, unknown> = {};
  let summary = '';
  switch (current.setup.model) {
    case 'SERVICE_JOB': {
      summary =
        current.setup.jobSchedulingMode === 'queue'
          ? 'Service job queue; capacity is allocated when actual work starts'
          : current.setup.jobSchedulingMode === 'scheduled_intake'
            ? 'Reserved intake appointment; diagnosis and repair remain separate'
            : 'Reserved service work interval; completion is tracked separately';
      if (current.input.model === 'SERVICE_JOB') {
        details.jobDescription = current.input.jobDescription;
        details.requestedInterval = current.input.requestedInterval;
        details.completionPromise = current.input.completionPromise;
      }
      details.jobSchedulingMode = current.setup.jobSchedulingMode;
      details.assessmentMode = current.setup.assessmentMode;
      details.intakeReceived = current.job?.intakeReceived;
      details.findings = current.job?.findings;
      details.partsRequired = current.job?.partsRequired;
      details.custodyMode = current.setup.custodyMode;
      break;
    }
    case 'TOUR':
      summary = current.setup.mode === 'shared' ? 'Shared dated departure' : 'Private itinerary';
      details.itinerary = current.setup.itinerary;
      details.itineraryVersion = current.setup.itineraryVersion;
      if (current.input.model === 'TOUR' && current.input.occurrenceId)
        details.occurrenceId = current.input.occurrenceId;
      break;
    case 'LINKED_WINDOWS':
      summary =
        current.setup.promiseMode === 'ASSESSMENT_REQUIRED' &&
        ![
          'PRICE_APPROVED',
          'PROCESSING',
          'READY_FOR_RETURN',
          'RETURN_CONFIRMED',
          'COMPLETED',
        ].includes(current.state)
          ? 'Incoming confirmed separately; return subject to assessment and approval'
          : 'Paired incoming, processing and return promise';
      if (current.input.model === 'LINKED_WINDOWS') {
        details.incoming = current.input.incoming;
        if (current.input.outgoing) details.outgoing = current.input.outgoing;
        if (current.input.workload) details.workload = current.input.workload;
      }
      details.incomingMethod = current.setup.incomingMethod;
      details.outgoingMethod = current.setup.outgoingMethod;
      break;
    case 'PRODUCTION_DUE':
      summary = 'Production workload and due promise';
      if (current.input.model === 'PRODUCTION_DUE') {
        details.specification = current.input.specification;
        details.specificationVersion = current.input.specificationVersion;
        details.dueTime = current.input.dueTime;
        details.workload = current.input.workload;
        details.handoff = current.input.handoff;
      }
      break;
    case 'ENTITLEMENT':
      summary = 'Plan access and credits; sessions are booked separately';
      details.validity = current.validity;
      details.creditCancellation = current.setup.creditCancellation;
      details.credits = current.credits?.map(({ id, quantityMinor, unit, scale, offeringIds }) => ({
        id,
        quantityMinor,
        unit,
        scale,
        offeringIds,
      }));
      break;
    case 'FREIGHT':
      summary = 'Cargo and contracted route legs';
      if (current.input.model === 'FREIGHT') {
        details.cargoDescription = current.input.cargoDescription;
        details.pieces = current.input.pieces;
        details.cargo = current.input.cargo;
        details.legs = current.input.legs;
      }
      details.route = current.setup.legs.map(({ id, origin, destination }) => ({
        id,
        origin,
        destination,
      }));
      details.finalMode = current.setup.finalMode;
      break;
  }
  let availableCommands = terminal.has(current.state)
    ? []
    : Object.entries(graphs[current.model])
        .filter(([, edge]) => edge.from.includes(current.state))
        .map(([command]) => command);
  if (current.setup.model === 'FREIGHT') {
    const finalMode = current.setup.finalMode;
    if (current.setup.requiresDocuments && current.state === 'BOOKED')
      availableCommands = availableCommands.filter(
        (command) => command !== 'ConfirmFreightCollection',
      );
    if (!current.setup.requiresClearance)
      availableCommands = availableCommands.filter(
        (command) => command !== 'RecordFreightClearanceArrival',
      );
    if (current.setup.requiresClearance && current.state === 'IN_TRANSIT')
      availableCommands = availableCommands.filter(
        (command) => command !== 'ConfirmFreightDestinationArrival',
      );
    availableCommands = availableCommands.filter(
      (command) =>
        command !==
        (finalMode === 'delivery' ? 'ConfirmConsigneeCollection' : 'ConfirmFreightDelivery'),
    );
  }
  if (current.setup.model === 'ENTITLEMENT') {
    availableCommands = availableCommands.filter(
      (command) =>
        command !==
        (current.setup.model === 'ENTITLEMENT' && current.setup.credits.length
          ? 'BookEntitledOffering'
          : 'RedeemEntitlement'),
    );
    if (
      current.setup.creditCancellation === 'nonrefundable' ||
      !current.redemptions?.some((entry) => !entry.restored)
    )
      availableCommands = availableCommands.filter(
        (command) => command !== 'RestoreEntitlementCredit',
      );
  }
  if (current.setup.model === 'LINKED_WINDOWS') {
    const dropoff = current.setup.incomingMethod === 'CUSTOMER_DROPOFF';
    availableCommands = availableCommands.filter((command) =>
      dropoff
        ? !['ConfirmCollectionLeg', 'ConfirmGoodsCollected', 'ReceiveForProcessing'].includes(
            command,
          )
        : !['ReceiveCustomerDropoff', 'ConfirmCustomerDropoffPromise'].includes(command),
    );
  }
  if (current.setup.model === 'SERVICE_JOB') {
    const setup = current.setup,
      job = current.job;
    availableCommands = availableCommands.filter((command) => {
      if (command === 'ConfirmServiceIntakeSlot')
        return setup.jobSchedulingMode === 'scheduled_intake';
      if (command === 'ConfirmServiceWorkSlot') return setup.jobSchedulingMode === 'scheduled_work';
      if (command === 'StartDiagnosis') return setup.assessmentMode === 'diagnosis_required';
      if (command === 'AcceptFixedScopeServiceJob') return setup.assessmentMode === 'fixed_scope';
      if (command === 'AcceptServiceIntake')
        return (
          !job?.intakeReceived &&
          (setup.jobSchedulingMode !== 'scheduled_intake' || current.state === 'INTAKE_SCHEDULED')
        );
      if (command === 'StartRepair') return job?.partsRequired === true && job.intakeReceived;
      if (command === 'StartNoPartsService')
        return job?.partsRequired === false && job.intakeReceived;
      if (command === 'RequestServiceParts') return job?.partsRequired === true;
      return true;
    });
  }
  const quoteStates =
    current.model === 'LINKED_WINDOWS'
      ? ['REQUESTED', 'ASSESSMENT_PENDING', 'RECEIVED_FOR_PROCESSING']
      : current.model === 'ENTITLEMENT' || current.model === 'SERVICE_JOB'
        ? []
        : ['ITINERARY_REVIEW', 'SPECIFICATION_REVIEW', 'CARGO_REVIEW', 'QUOTED'];
  if (quoteStates.includes(current.state)) availableCommands.push('IssueSpecialistQuote');
  if (!terminal.has(current.state))
    availableCommands.push(
      current.state === 'CANCELLATION_REVIEW'
        ? 'ConfirmSpecialistCancellation'
        : 'RequestSpecialistCancellation',
    );
  return { model: current.model, state: current.state, summary, details, availableCommands };
}
