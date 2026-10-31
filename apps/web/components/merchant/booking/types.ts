export const BOOKING_MODELS = [
  'ORDER',
  'APPOINTMENT',
  'FIELD_VISIT',
  'ASSET_INTERVAL',
  'TRANSFER',
  'SESSION_CAPACITY',
  'SPACE_RESERVATION',
  'TOUR',
  'PRODUCTION_DUE',
  'REQUEST_QUOTE',
  'LINKED_WINDOWS',
  'SERVICE_JOB',
  'ENTITLEMENT',
  'FREIGHT',
  'STORAGE',
] as const;

export type BookingModel = (typeof BOOKING_MODELS)[number];
export type CalendarView = 'day' | 'week' | 'month' | 'agenda' | 'resources';
export type BookingStatus =
  | 'held'
  | 'pending'
  | 'confirmed'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';
export type PricingBasis =
  | 'per_booking'
  | 'per_quantity'
  | 'per_duration'
  | 'per_night'
  | 'indicative';
export interface ReservationFee {
  mode: 'no_fee' | 'fixed' | 'percentage';
  amountMinor?: number;
  percentageBps?: number;
  treatment: 'applied_in_addition' | 'credited_to_total';
  requiredBeforeConfirmation: boolean;
  refundTerms: string;
}
export interface ConfigurationIssue {
  message?: string;
  questionId?: string;
  label?: string;
  code?: string;
}
export interface BookingReadiness {
  isReady?: boolean;
  canConfirmNative?: boolean;
  missingInputs?: Array<string | ConfigurationIssue>;
  invalidInputs?: Array<string | ConfigurationIssue>;
  clarifications?: Array<string | ConfigurationIssue>;
  status?: string;
}

export interface BookingProfile {
  id?: string;
  subcategoryId: string;
  name: string;
  categoryId: string;
  categoryName?: string;
  defaultModelId?: BookingModel;
  primaryModelId?: BookingModel;
  candidateModelIds?: BookingModel[];
  candidateModels?: Array<BookingModel | { id?: BookingModel; modelId?: BookingModel }>;
  specialtyNeeds?: string;
}

export interface BookingResource {
  id: string;
  version?: number;
  name: string;
  kind: 'staff' | 'vehicle' | 'room' | 'space' | 'equipment' | 'capacity_pool' | 'asset';
  quantity: number;
  capacityMode: 'per-reservation' | 'per-guest';
  capacityUnit?: string;
  quantityScale?: number;
  partyCapacity?: number;
  closures?: Array<{ id: string; startTime: string; endTime: string; reason: string }>;
  schedule: { days: number[]; start: string; end: string };
  active: boolean;
}

export interface BookingOffering {
  id: string;
  version?: number;
  name: string;
  description?: string;
  model: BookingModel;
  durationMinutes?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  resourceIds: string[];
  priceMinor: number;
  currency: 'KES';
  intakeMode: 'instant_after_requirements' | 'merchant_approval' | 'request_quote' | 'walk_in_only';
  method?: 'merchant_location' | 'customer_location' | 'digital';
  capacityUnit?: string;
  quantityScale?: number;
  pricingBasis?: PricingBasis;
  durationUnitMinutes?: number;
  minimumBillableUnits?: number;
  resourceSelectionMode?: 'all' | 'choose_one';
  eligibleResources?: Array<{ id: string; name: string; kind?: string }>;
  reservationFee?: ReservationFee;
  readiness?: BookingReadiness;
  executionMode?: 'native_reservation' | 'request_capture' | string;
  specialist?: SpecialistPublicDescriptor;
  specialistSetup?: SpecialistSetup;
  serviceArea?: { areas: string[] };
  transportIncluded?: boolean;
  withDriver?: boolean;
  occurrences?: BookingOccurrence[];
  paymentPolicyId?: string;
  changePolicyId?: string;
  policyVersion?: number;
  active: boolean;
}

export interface BookingRecord {
  id: string;
  offeringId: string;
  offeringName: string;
  occurrenceId?: string;
  model: BookingModel;
  resourceIds: string[];
  startTime: string | null;
  endTime: string | null;
  quantity: number;
  customer: { name: string; email?: string; phone?: string };
  notes?: string;
  status: BookingStatus;
  version: number;
  priceMinor: number;
  currency: 'KES';
  unitPriceMinor?: number;
  pricingBasis?: PricingBasis;
  capacityUnit?: string;
  quantityScale?: number;
  reservationFee?: ReservationFee;
  paymentState?: string;
  acceptedReservationFee?: Partial<ReservationFee>;
  acceptedPolicies?: { paymentPolicyId?: string; changePolicyId?: string; version?: number };
  paidMinor?: number;
  refundedMinor?: number;
  refundState?: string;
  workState?: string;
  custodyState?: 'not_started' | 'in_use' | 'released';
  occupancyOverdue?: boolean;
  completionEvidence?: string;
  executionMode?: string;
  specialist?: SpecialistPublicSummary & {
    scopeVersion?: number;
    acceptedPriceMinor?: number;
    descriptor?: SpecialistPublicDescriptor;
    redemptions?: Array<{
      id: string;
      offeringId: string;
      startTime: string;
      endTime: string;
      quantityMinor?: number;
      unit?: string;
      scale?: number;
    }>;
    allocations: Array<{
      id: string;
      role: string;
      resourceIds: string[];
      startTime: string;
      endTime: string;
      status?: string;
    }>;
  };
  calendarSegmentId?: string;
  customerLocation?: { area: string; address: string };
  trip?: {
    pickupArea: string;
    pickupAddress: string;
    dropoffArea?: string;
    dropoffAddress?: string;
  };
  paymentEvidence?: Array<{
    amountMinor: number;
    method: string;
    reference: string;
    evidence: string;
    recordedAt: string;
    verification: string;
  }>;
  pricing?: BookingQuote;
  expiresAt?: string;
}

export interface BookingQuote {
  basis: PricingBasis;
  unitPriceMinor: number;
  units: number;
  totalMinor: number;
  currency: 'KES';
  indicative: boolean;
  rounding?: 'ceil';
  serviceSubtotalMinor?: number;
  reservationFeeMinor?: number;
  totalDueMinor?: number;
  dueNowMinor?: number;
  balanceMinor?: number;
  binding?: boolean;
  sourceRequired?: boolean;
}

export interface BookingOccurrence {
  id: string;
  offeringId: string;
  startTime: string;
  endTime: string;
  capacity: number;
  resourceIds: string[];
  published: boolean;
  remainingCapacity?: number;
  version?: number;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  occurrenceId?: string;
  remainingCapacity?: number;
}

export interface BookingWorkspaceData {
  profiles?: BookingProfile[];
  business: { id: string; name: string; timezone: 'Africa/Nairobi' };
  configuration: {
    subcategoryId: string;
    published?: boolean;
    answers?: Record<string, unknown>;
    operationalAnswers?: Record<string, unknown>;
    bookingSetup?: Record<string, unknown>;
    canonicalAnswers?: Record<string, unknown>;
    resolved?: BookingReadiness & {
      primaryModel?: string | null;
      primaryModelId?: string | null;
      models?: string[];
      candidateModels?: Array<string | { id?: string; modelId?: string }>;
      vocabulary?: Record<string, string>;
      status?: string;
    };
  };
  offerings: BookingOffering[];
  resources: BookingResource[];
  bookings: BookingRecord[];
  occurrences?: BookingOccurrence[];
  google: { connected: boolean; optional: boolean; calendarName?: string };
}

export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
}

export interface BookingQuestion {
  questionId?: string;
  id?: string;
  label: string;
  valueSchema?: JsonSchema;
  schema?: JsonSchema;
  value?: unknown;
  askMerchant?: boolean;
  captureMode?: string;
  canonicalTarget?: string;
  key?: string;
  required?: boolean;
}
import type {
  SpecialistBookingInput,
  SpecialistPublicDescriptor,
  SpecialistPublicSummary,
  SpecialistSetup,
} from '@nexg/booking-config/specialists';

export type { SpecialistBookingInput };
