/*
 * Generated from @nexg/contracts by scripts/generate-types.mjs: the
 * API's own schemas, written as plain TypeScript so this package needs
 * neither the contracts nor zod. Do not edit by hand: run
 * `pnpm --filter @nexg-org/api-client generate`. src/types.test.ts fails
 * when these no longer match the schemas.
 */

export type ApiBookingRider = {
  first_name: string;
  vehicle: 'motorbike' | 'bicycle' | 'car' | 'tuktuk';
  /** Null for a bicycle, or when none is on record. */
  plate: string | null;
  /** When this rider took the job. */
  assigned_at: string | null;
  /** Only from pickup until delivery: null before pickup, after delivery, or with no position yet. */
  location: {
    /** When the rider's app sent this position. */
    at: string;
    latitude: number;
    longitude: number;
  } | null;
};

export type ApiBookingRiderLocation = {
  /** When the rider's app sent this position. */
  at: string;
  latitude: number;
  longitude: number;
};

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
  /** Who is carrying it, once a rider has the delivery job. Null until then, and after a cancellation. */
  rider: {
    first_name: string;
    vehicle: 'motorbike' | 'bicycle' | 'car' | 'tuktuk';
    /** Null for a bicycle, or when none is on record. */
    plate: string | null;
    /** When this rider took the job. */
    assigned_at: string | null;
    /** Only from pickup until delivery: null before pickup, after delivery, or with no position yet. */
    location: {
      /** When the rider's app sent this position. */
      at: string;
      latitude: number;
      longitude: number;
    } | null;
  } | null;
};

export type ApiClosure = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

export type ApiDeparture = {
  id: string;
  starts_at: string;
  ends_at: string;
  version: number;
  resource_ids: string[];
  /** Seats or places on it. */
  capacity: number;
  /** false: closed, customers cannot book it. */
  published: boolean;
};

export type ApiOffering = {
  id: string;
  name: string | null;
  currency: 'KES';
  /** false: switched off, not shown. */
  active: boolean;
  model: string | null;
  /** Send it back as expected_version when you change the offering. */
  version: number;
  resource_ids: string[];
  capacity_unit: string | null;
  capacity: number | null;
  /** false: shown, but not taking new bookings. */
  booking_enabled: boolean;
  price_cents: number | null;
  /** per_booking, per_quantity, per_duration, per_night or indicative. */
  pricing_basis: string;
  duration_minutes: number | null;
  /** Departures that have not ended, for tours and classes. Empty otherwise. */
  departures: {
    id: string;
    starts_at: string;
    ends_at: string;
    version: number;
    resource_ids: string[];
    /** Seats or places on it. */
    capacity: number;
    /** false: closed, customers cannot book it. */
    published: boolean;
  }[];
};

export type ApiReservation = {
  id: string;
  /** requested, confirmed, in_progress, completed or cancelled. */
  status: 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  currency: 'KES';
  starts_at: string | null;
  ends_at: string | null;
  /** Seats, passengers or units, as the offering counts them. */
  quantity: number | null;
  /** The price agreed when it was booked. Null while a request has no price yet. */
  total_cents: number | null;
  /** `reservation` holds a time, seat or vehicle; `request` waits for the business to accept it. */
  kind: 'reservation' | 'request';
  /** The booking engine's own word, for example `held` (waiting for payment) or `expired`. */
  stage: string;
  created_at: string | null;
  offering: {
    id: string | null;
    name: string | null;
    /** How it is booked, for example `TRANSFER`, `TOUR`, `APPOINTMENT` or `ASSET_INTERVAL`. */
    model: string | null;
  };
  /** For example `awaiting_payment`, `paid` or `not_required`. */
  payment_state: string | null;
  /** Goes up with every change, so an older copy can be told from a newer one. */
  version: number;
  updated_at: string | null;
  /** The departure or session, for a tour or class with set times. */
  occurrence_id: string | null;
  /** The vehicles, rooms, staff or places it holds. */
  resource_ids: string[];
  ticket_type: {
    id: string;
    name: string | null;
  } | null;
  /** What quantity counts, for example `place` or `asset`. */
  capacity_unit: string | null;
  /** The name the booking is under. */
  guest_name: string | null;
  /** A transfer's pickup and drop-off. Null for anything that is not a trip. */
  trip: {
    pickup_area: string | null;
    pickup_address: string | null;
    dropoff_area: string | null;
    dropoff_address: string | null;
  } | null;
  /** Where the business goes to the customer, for a visit at their place. */
  service_location: {
    address: string | null;
    area: string | null;
  } | null;
  notes: string | null;
  /** What has been paid so far through NexG. */
  paid_cents: number;
  /** When the customer's booking code was checked at the business. */
  checked_in_at: string | null;
  /** `nexg`: the customer booked on NexG. `merchant`: the business entered it. */
  booked_on: 'nexg' | 'merchant';
  /** Who is coming, once the business sets it. Null until then. */
  driver: {
    first_name: string;
    /** For example `White Toyota Noah`. */
    vehicle: string;
    plate: string | null;
    assigned_at: string | null;
  } | null;
};

export type ApiReservationDriver = {
  first_name: string;
  /** For example `White Toyota Noah`. */
  vehicle: string;
  plate: string | null;
  assigned_at: string | null;
};

export type ApiReservationSummary = {
  id: string;
  /** requested, confirmed, in_progress, completed or cancelled. */
  status: 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  /** Seats, passengers or units, as the offering counts them. */
  quantity: number | null;
  /** `reservation` holds a time, seat or vehicle; `request` waits for the business to accept it. */
  kind: 'reservation' | 'request';
  /** The booking engine's own word, for example `held` (waiting for payment) or `expired`. */
  stage: string;
  offering: {
    id: string | null;
    name: string | null;
    /** How it is booked, for example `TRANSFER`, `TOUR`, `APPOINTMENT` or `ASSET_INTERVAL`. */
    model: string | null;
  };
  /** For example `awaiting_payment`, `paid` or `not_required`. */
  payment_state: string | null;
  /** Goes up with every change, so an older copy can be told from a newer one. */
  version: number;
  updated_at: string | null;
};

export type ApiResource = {
  id: string;
  name: string | null;
  quantity: number | null;
  /** staff, asset, vehicle, room, space, equipment or capacity_pool. */
  kind: string | null;
  active: boolean;
  /** Send it back as expected_version when you change the resource. */
  version: number;
  /** Weekdays (0 is Sunday) and the opening and closing time, in Nairobi time. */
  schedule: {
    days: number[];
    start: string;
    end: string;
  } | null;
  /** Closures that have not ended. */
  closures: {
    id: string;
    starts_at: string;
    ends_at: string;
    reason: string | null;
  }[];
};

export type ClosureRequest = {
  starts_at: string;
  ends_at: string;
  /** Seen by the business only, for example `Booked on our own website`. */
  reason: string;
  expected_version: number;
};

export type DepartureRequest = {
  starts_at: string;
  ends_at: string;
  capacity: number;
  /** false closes it to new bookings. */
  published: boolean;
  /** The offering's version. */
  expected_version: number;
  resource_ids?: string[];
  /** To change an existing departure. Leave it out to add one. */
  departure_id?: string;
  /** The departure's version, when changing one. */
  expected_departure_version?: number;
};

export type OfferingUpdate = {
  expected_version: number;
  active?: boolean;
  booking_enabled?: boolean;
  price_cents?: number;
};

export type TestReservationRequest = {
  starts_at?: string;
  ends_at?: string;
  quantity?: number;
  /** Above 0, the test reservation waits for payment, as a customer booking does. */
  total_cents?: number;
  kind?: 'reservation' | 'request';
  guest_name?: string;
  trip?: {
    pickup_area?: string | null;
    pickup_address?: string | null;
    dropoff_area?: string | null;
    dropoff_address?: string | null;
  };
  notes?: string;
  offering_name?: string;
  /** For example TRANSFER (the default), TOUR or APPOINTMENT. */
  offering_model?: string;
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
    | 'reservation.created'
    | 'reservation.status_changed'
    | 'reservation.updated'
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
      /** Who is carrying it, once a rider has the delivery job. Null until then, and after a cancellation. */
      rider: {
        first_name: string;
        vehicle: 'motorbike' | 'bicycle' | 'car' | 'tuktuk';
        /** Null for a bicycle, or when none is on record. */
        plate: string | null;
        /** When this rider took the job. */
        assigned_at: string | null;
        /** Only from pickup until delivery: null before pickup, after delivery, or with no position yet. */
        location: {
          /** When the rider's app sent this position. */
          at: string;
          latitude: number;
          longitude: number;
        } | null;
      } | null;
    };
    /** booking.rider_assigned only: when the rider took the job. */
    assigned_at?: string;
    /** reservation.* only: the reservation's summary at this event. */
    reservation?: {
      id: string;
      /** requested, confirmed, in_progress, completed or cancelled. */
      status: 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
      starts_at: string | null;
      ends_at: string | null;
      /** Seats, passengers or units, as the offering counts them. */
      quantity: number | null;
      /** `reservation` holds a time, seat or vehicle; `request` waits for the business to accept it. */
      kind: 'reservation' | 'request';
      /** The booking engine's own word, for example `held` (waiting for payment) or `expired`. */
      stage: string;
      offering: {
        id: string | null;
        name: string | null;
        /** How it is booked, for example `TRANSFER`, `TOUR`, `APPOINTMENT` or `ASSET_INTERVAL`. */
        model: string | null;
      };
      /** For example `awaiting_payment`, `paid` or `not_required`. */
      payment_state: string | null;
      /** Goes up with every change, so an older copy can be told from a newer one. */
      version: number;
      updated_at: string | null;
    };
    /** booking.status_changed and reservation.status_changed only. */
    previous_status?: 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
    /** booking.status_changed and booking.stage_changed. */
    previous_stage?: string;
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
  | 'reservation.created'
  | 'reservation.status_changed'
  | 'reservation.updated'
  | 'ping';
