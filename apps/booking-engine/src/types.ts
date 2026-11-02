import type { SpecialistSetup, SpecialistBookingInput } from '@nexg/booking-config/specialists';
export type BookingModel =
  | 'ORDER'
  | 'APPOINTMENT'
  | 'FIELD_VISIT'
  | 'ASSET_INTERVAL'
  | 'TRANSFER'
  | 'SESSION_CAPACITY'
  | 'SPACE_RESERVATION'
  | 'TOUR'
  | 'PRODUCTION_DUE'
  | 'REQUEST_QUOTE'
  | 'LINKED_WINDOWS'
  | 'SERVICE_JOB'
  | 'ENTITLEMENT'
  | 'FREIGHT'
  | 'STORAGE';
export interface Identity {
  businessId: string;
  userId: string;
  role: string;
  expiresAt: number;
  branches?: string[] | null;
  businessName?: string;
  subcategoryId?: string;
  answers?: Record<string, unknown>;
}
export interface Customer {
  name: string;
  email?: string;
  phone?: string;
}
export interface ResourceInput {
  name: string;
  kind: string;
  quantity: number;
  capacityMode?: 'per-reservation' | 'per-guest';
  capacityUnit?: string;
  quantityScale?: number;
  partyCapacity?: number;
  locationId?: string;
  schedule: { days: number[]; start: string; end: string };
  active?: boolean;
}
export interface OfferingInput {
  specialistSetup?: SpecialistSetup;
  name: string;
  model: BookingModel;
  durationMinutes?: number;
  resourceIds: string[];
  priceMinor: number;
  currency: 'KES';
  intakeMode: string;
  active: boolean;
  locationId?: string;
  description?: string;
  method?: string;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  leadTimeMinutes?: number;
  horizonDays?: number;
  capacityUnit?: string;
  quantityScale?: number;
  transportIncluded?: boolean;
  withDriver?: boolean;
  bookingEnabled?: boolean;
  requiresPayment?: boolean;
  paymentPolicyId?: string;
  changePolicyId?: string;
  policyVersion?: number;
  pricingBasis?: 'per_booking' | 'per_quantity' | 'per_duration' | 'per_night' | 'indicative';
  durationUnitMinutes?: number;
  minimumBillableUnits?: number;
  reservationFee?: {
    mode: 'no_fee' | 'fixed' | 'percentage';
    amountMinor?: number;
    percentageBps?: number;
    treatment: 'applied_in_addition' | 'credited_to_total';
    requiredBeforeConfirmation: boolean;
    refundTerms: string;
  };
  capacity?: number;
  resourceSelectionMode?: string;
  serviceArea?: { areas: string[] };
  travelMinutes?: number;
  additionalSetup?: Record<string, unknown>;
}
export interface BookingInput {
  specialist?: SpecialistBookingInput;
  occurrenceId?: string;
  offeringId: string;
  resourceIds?: string[];
  startTime?: string;
  endTime?: string;
  quantity?: number;
  expectedTotalMinor?: number;
  customerLocation?: { area: string; address: string };
  trip?: {
    pickupArea: string;
    pickupAddress: string;
    dropoffArea?: string;
    dropoffAddress?: string;
  };
  customer: Customer;
  notes?: string;
  hold?: boolean;
  allocations?: Array<{
    resourceId: string;
    quantityMinor: number;
    unit: string;
    scale: number;
    startTime?: string;
    endTime?: string;
  }>;
}
export class BookingError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'booking_error',
  ) {
    super(message);
    this.name = 'BookingError';
  }
}
