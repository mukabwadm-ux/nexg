/*
 * Generated from @nexg/contracts by scripts/generate-types.mjs: the
 * API's own schemas, written as plain TypeScript so this package needs
 * neither the contracts nor zod. Do not edit by hand: run
 * `pnpm --filter @nexg-org/api-client generate`. src/types.test.ts fails
 * when these no longer match the schemas.
 */

export type ApiOrder = {
  /** requested, confirmed, in_progress, completed or cancelled. */
  status: 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  order_id: string;
  currency: 'KES';
  service: string;
  quantity: number;
  pickup_label: string | null;
  dropoff_label: string | null;
  scheduled_for: string | null;
  payment_method: string;
  reference: string;
  total_cents: number;
  /** Where the booking is in its own workflow, for example `picked_up`. */
  stage: string;
  payment_status: string;
  created_at: string;
};

export type ApiService = {
  code: string;
  label: string;
  kind: 'ride' | 'booking' | 'courier' | 'experience';
  unit_label: string;
  active: boolean;
};

export type BookingReceipt = {
  order_id: string;
  currency: 'KES';
  service: string;
  quantity: number;
  scheduled_for: string | null;
  payment_method: string;
  reference: string;
  total_cents: number;
};

export type BookingRequest = {
  /** The service code, e.g. `airport_transfer`. */
  service: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  /** How many units. For a transfer, that is passengers. A flat-priced service, such as a venue booking, costs the same whatever the number. */
  quantity?: number;
  /** Where we collect from. Required for a ride or a courier. */
  pickup_label?: string;
  /** Where we are going. Required for a ride or a courier. */
  dropoff_label?: string;
  /** When. Optional: a booking can be "as soon as possible". */
  scheduled_for?: string;
  /** The people travelling. Names and numbers, for the rider. */
  passengers?: {
    name?: string;
    phone?: string;
    /** A flight number, when the trip starts at an airport. */
    flight?: string;
  }[];
  /** How it is paid. Only `on_account` today: the booking is charged to the merchant's account with NexG. The database also knows M-Pesa and card, but nothing yet collects either for an API booking, so accepting them would leave orders that nobody can pay. */
  payment_method?: 'on_account';
  /** Anything the driver should know. */
  note?: string;
};

export type BookingStatus = 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export type CatalogueItem = {
  id: string;
  name: string;
  sort: number | null;
  description: string | null;
  merchant_id: string;
  section_id: string | null;
  price_kes: number;
  available: boolean | null;
  age_restricted: boolean | null;
  highlighted: boolean | null;
};

export type DeliveryCheck = {
  message: string | null;
  city_slug: string | null;
  city_name: string | null;
  eta_min: number | null;
  eta_max: number | null;
  currency: 'KES';
  deliverable: boolean;
  reason: 'pickup_not_served' | 'dropoff_not_served' | 'too_far' | 'dropoff_paused' | null;
  pickup: {
    served: boolean;
    zone_id: string | null;
    zone_name: string | null;
  };
  dropoff: {
    paused: boolean;
    served: boolean;
    zone_id: string | null;
    zone_name: string | null;
  };
  distance_km: number;
  max_distance_km: number | null;
  delivery_fee_cents: number | null;
};

export type DeliveryCheckRequest = {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
};

export type DeliveryRefusal =
  | 'pickup_not_served'
  | 'dropoff_not_served'
  | 'too_far'
  | 'dropoff_paused';

export type PublicBranch = {
  id: string;
  name: string | null;
  /** A public phone number or email for the branch, when the merchant gives one. */
  contact: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** The branch the merchant's own fields describe. */
  is_primary: boolean;
  /** `physical` for a place guests visit; other values for mobile or online service. */
  place_type: string;
  /** Not taking orders or bookings for now. */
  paused: boolean;
  /** Today's hours in Nairobi time, HH:MM:SS. */
  opens_today: string | null;
  closes_today: string | null;
  closed_today: boolean | null;
};

export type PublicEvent = {
  id: string;
  name: string | null;
  category: string | null;
  featured: boolean | null;
  city_id: string;
  venue_name: string | null;
  venue_address: string | null;
  starts_at: string | null;
  ends_at: string | null;
  doors_at: string | null;
  cover_path: string | null;
  anchor_slot: string | null;
  organiser_name: string | null;
  organiser_url: string | null;
  ticket_url: string | null;
  ticket_bands: {
    price_kes: number;
    label: string;
    currency?: string;
  }[];
  nexg_can_hold_tickets: boolean | null;
  practical_note: string | null;
  suggested_blocks: unknown[];
};

export type PublicMerchant = {
  id: string;
  city_slug: string;
  trading_name: string;
  /** The taxonomy vertical. `other` carries the free text beside it. */
  category: string;
  category_other: string | null;
  cover_photo_path: string | null;
  featured: boolean;
  city_name: string;
  branch_name: string | null;
  branch_address: string | null;
  branch_latitude: number | null;
  branch_longitude: number | null;
  /** When it went live, which is when a visitor could first see it. */
  listed_at: string;
  explore_visible: boolean | null;
  concierge_pick: boolean | null;
  accepting_orders: boolean | null;
  pay_on_delivery_enabled: boolean | null;
  pay_on_delivery_cap_kes: number | null;
  prep_minutes: number | null;
  busy_mode_until: string | null;
  closed_early_at: string | null;
  /** The merchant this one replicates (for chains). */
  parent_merchant_id: string | null;
  /** Subcategory within the main taxonomy. */
  subcategory: string | null;
};

export type PublicZone = {
  id: string;
  name: string;
  city_id: string;
  tier: string | null;
  eta_min: number | null;
  eta_max: number | null;
  cod_allowed: boolean | null;
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
};

export type WebhookEvent = {
  id: string;
  type:
    | 'booking.created'
    | 'booking.status_changed'
    | 'booking.stage_changed'
    | 'booking.rider_assigned'
    | 'ping';
  data: {
    message?: string;
    /** The booking as `GET /v1/orders/{id}` returns it, at this event. */
    booking?: {
      /** requested, confirmed, in_progress, completed or cancelled. */
      status: 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
      order_id: string;
      currency: 'KES';
      service: string;
      quantity: number;
      pickup_label: string | null;
      dropoff_label: string | null;
      scheduled_for: string | null;
      payment_method: string;
      reference: string;
      total_cents: number;
      /** Where the booking is in its own workflow, for example `picked_up`. */
      stage: string;
      payment_status: string;
      created_at: string;
    };
    /** booking.status_changed only. */
    previous_status?: 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
    /** booking.status_changed and booking.stage_changed. */
    previous_stage?: string;
    /** booking.rider_assigned only: when the rider took the job. */
    assigned_at?: string;
    /** ping only. */
    endpoint_id?: string;
  };
  api_version: 'v1';
  created_at: string;
  environment: 'live' | 'test';
};

export type WebhookEventType =
  | 'booking.created'
  | 'booking.status_changed'
  | 'booking.stage_changed'
  | 'booking.rider_assigned'
  | 'ping';
