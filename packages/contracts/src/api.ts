/**
 * @nexg/contracts/api — the public API surface.
 *
 * The public API reads what the `_public` views already allow
 * a visitor to see. It adds no new permission: every field here
 * is a field the view already publishes, and the view is what
 * decides that. The API's job is a stable, versioned, paginated
 * shape over that, not a second set of rules.
 *
 * Three decisions worth writing down.
 *
 * **The view is the permission, the schema is the promise.**
 * `merchant_public` is `security_invoker = false` and filters
 * to `status = 'live'`, and it deliberately omits legal name,
 * contact details and settlement account. A schema that named
 * those fields would be a schema asking to be violated by the
 * next person to write a query. So the schemas below name only
 * what the views publish, and the API reads the views.
 *
 * **Every list is a cursor, and every cursor has a tiebreak.**
 * `page()` in this package already refuses offsets, because an
 * offset page re-reads rows that have shifted under it and skips
 * one silently. That needs a stable sort to be true, so each
 * list below is sorted by a time column, then the id. Two rows
 * that land in the same millisecond still have an order, so no
 * row is skipped and none is returned twice.
 *
 * **Money crosses as an integer.** `Money` is cents, and a
 * `price_kes` column is whole shillings. Both are integers, and
 * neither is ever a float. That is the same rule the ledger
 * holds, and it is why the API does not need a separate money
 * type for each.
 */
import { z } from 'zod';

import { IdempotencyKey, Money, PageRequest, Uuid } from './index';

export { IdempotencyKey, Uuid };

/* ════════════════════════════════════════════════════════════════════════════ the envelope */

/**
 * A page of results, as it goes over the wire.
 *
 * `next_cursor` is null when there is no next page, rather than
 * an empty string, because "there is no next page" and "the next
 * page is the one you just had" are different and a client that
 * cannot tell them apart will loop.
 */
export const PageEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      ok: z.literal(true),
      data: z
        .object({
          items: z.array(item),
          next_cursor: z.string().nullable(),
        })
        .strict(),
      meta: z
        .object({
          api_version: z.literal('v1'),
          /** The limit the server actually applied, after clamping. */
          limit: z.number().int().positive(),
        })
        .strict(),
    })
    .strict();

export type PageEnvelope<T extends z.ZodTypeAny> = z.infer<ReturnType<typeof PageEnvelope<T>>>;

/**
 * What every endpoint returns when it cannot.
 *
 * `code` is the part a program branches on and `message` is the
 * part a person reads. The database raises its exceptions as
 * prose — "A phone number is how we reach you about your
 * guests." — and that prose must not be the only thing a client
 * has to work with, or every client ends up matching on English.
 */
export const ApiError = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        /** A stable, machine-readable code. See `ERROR_CODES`. */
        code: z.string(),
        /** A sentence for the person reading it. */
        message: z.string(),
        /** Field-level problems, keyed by field name. */
        fields: z.record(z.string()).optional(),
      })
      .strict(),
    meta: z
      .object({
        api_version: z.literal('v1'),
      })
      .strict(),
  })
  .strict();

export type ApiError = z.infer<typeof ApiError>;

/**
 * The codes a client may branch on.
 *
 * A small closed set on purpose. A code that is invented per
 * endpoint is a code no client can rely on, and the moment a
 * client starts matching on the message instead, the message
 * becomes an API it cannot change.
 */
export const ERROR_CODES = {
  invalid_request: 'The request was not in a shape we understand.',
  not_found: 'That does not exist.',
  method_not_allowed: 'That is not something this endpoint does.',
  conflict:
    'That cannot be done in its current state, such as cancelling a booking a rider already has.',
  rate_limited: 'Too many requests. Give it a moment.',
  internal_error: 'Something went wrong on our side.',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/* ════════════════════════════════════════════════════════════════════════════ the resources */

/**
 * A merchant, as the public is allowed to see it.
 *
 * Every field here is a column of `merchant_public`. There is
 * no legal name, no contact phone, no contact email and no
 * settlement account, because the view does not publish them.
 *
 * `listed_at` is guaranteed non-null: a merchant has status='live'
 * if and only if went_live_at is set (DB constraint).
 */
export const PublicMerchant = z
  .object({
    id: Uuid,
    trading_name: z.string(),
    /** The taxonomy vertical. `other` carries the free text beside it. */
    category: z.string(),
    category_other: z.string().nullable(),
    cover_photo_path: z.string().nullable(),
    featured: z.boolean(),
    city_slug: z.string(),
    city_name: z.string(),
    branch_name: z.string().nullable(),
    branch_address: z.string().nullable(),
    branch_latitude: z.number().nullable(),
    branch_longitude: z.number().nullable(),
    /** When it went live, which is when a visitor could first see it. */
    listed_at: z.string(),
    explore_visible: z.boolean().nullable(),
    concierge_pick: z.boolean().nullable(),
    accepting_orders: z.boolean().nullable(),
    pay_on_delivery_enabled: z.boolean().nullable(),
    pay_on_delivery_cap_kes: z.number().int().nullable(),
    prep_minutes: z.number().int().nullable(),
    busy_mode_until: z.string().nullable(),
    closed_early_at: z.string().nullable(),
    /** The merchant this one replicates (for chains). */
    parent_merchant_id: Uuid.nullable(),
    /** Subcategory within the main taxonomy. */
    subcategory: z.string().nullable(),
  })
  .strict();

export type PublicMerchant = z.infer<typeof PublicMerchant>;

/**
 * One open branch of a listed merchant.
 *
 * Every branch, not only the primary one that `PublicMerchant` describes.
 * Nothing a rider or the merchant's team uses internally: no rider phone,
 * no pickup instructions, no reason a branch is paused.
 */
export const PublicBranch = z
  .object({
    id: Uuid,
    name: z.string().nullable(),
    address: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    /** The branch the merchant's own fields describe. */
    is_primary: z.boolean(),
    /** `physical` for a place guests visit; other values for mobile or online service. */
    place_type: z.string(),
    /** A public phone number or email for the branch, when the merchant gives one. */
    contact: z.string().nullable(),
    /** Not taking orders or bookings for now. */
    paused: z.boolean(),
    /** Today's hours in Nairobi time, HH:MM:SS. */
    opens_today: z.string().nullable(),
    closes_today: z.string().nullable(),
    closed_today: z.boolean().nullable(),
  })
  .strict();

export type PublicBranch = z.infer<typeof PublicBranch>;

/**
 * One item on a merchant's menu.
 *
 * `price_kes` is whole shillings, which is an integer. A float
 * here would be approximately a price, and the difference between
 * approximately and exactly is the difference between a
 * merchant being paid the right amount.
 */
export const CatalogueItem = z
  .object({
    id: Uuid,
    merchant_id: Uuid,
    section_id: Uuid.nullable(),
    name: z.string(),
    description: z.string().nullable(),
    price_kes: z.number().int().nonnegative(),
    available: z.boolean().nullable(),
    age_restricted: z.boolean().nullable(),
    highlighted: z.boolean().nullable(),
    sort: z.number().int().nullable(),
  })
  .strict();

export type CatalogueItem = z.infer<typeof CatalogueItem>;

/**
 * A delivery zone, as the public is allowed to see it.
 *
 * Note: `zone_bounds` is security_invoker (the RLS policy decides),
 * while the others are security_definer (the view's WHERE is the rule).
 */
export const PublicZone = z
  .object({
    id: Uuid,
    city_id: Uuid,
    name: z.string(),
    tier: z.string().nullable(),
    eta_min: z.number().int().nullable(),
    eta_max: z.number().int().nullable(),
    cod_allowed: z.boolean().nullable(),
    west: z.number().nullable(),
    south: z.number().nullable(),
    east: z.number().nullable(),
    north: z.number().nullable(),
  })
  .strict();

export type PublicZone = z.infer<typeof PublicZone>;

/**
 * One ticket price for an event, at the organiser's face value.
 *
 * `event.ticket_bands` is a jsonb list. The console that writes it
 * insists on a label and a positive price, but the price may arrive
 * as a number or as numeric text, so it is read as either and always
 * sent as a number. Anything else on a band is left out.
 */
export const TicketBand = z.object({
  label: z.string(),
  price_kes: z.coerce.number().positive(),
  currency: z.string().optional(),
});

export type TicketBand = z.infer<typeof TicketBand>;

/**
 * An experience (event), as the public is allowed to see it.
 *
 * Sorted by starts_at. Events in the past are filtered out by the view.
 *
 * `ticket_bands` and `suggested_blocks` are jsonb lists (`[]` when
 * empty, never null). They were typed as objects here once, which no
 * stored row could match, so every listing with an event in it failed.
 * `suggested_blocks` is free-form JSON from the experiences console,
 * so its entries are passed through as they are stored.
 */
export const PublicEvent = z
  .object({
    id: Uuid,
    city_id: Uuid,
    name: z.string().nullable(),
    category: z.string().nullable(),
    venue_name: z.string().nullable(),
    venue_address: z.string().nullable(),
    starts_at: z.string().nullable(),
    ends_at: z.string().nullable(),
    doors_at: z.string().nullable(),
    cover_path: z.string().nullable(),
    featured: z.boolean().nullable(),
    anchor_slot: z.string().nullable(),
    organiser_name: z.string().nullable(),
    organiser_url: z.string().nullable(),
    ticket_url: z.string().nullable(),
    ticket_bands: z.array(TicketBand),
    nexg_can_hold_tickets: z.boolean().nullable(),
    practical_note: z.string().nullable(),
    suggested_blocks: z.array(z.unknown()),
  })
  .strict();

export type PublicEvent = z.infer<typeof PublicEvent>;

/**
 * "Can you deliver here?": the body of POST /v1/delivery/check. The same
 * four fields a ride or courier booking takes, so a caller can check a trip
 * and then book it with the same values.
 */
export const DeliveryCheckRequest = z
  .object({
    pickup_lat: z.number().min(-90).max(90),
    pickup_lng: z.number().min(-180).max(180),
    dropoff_lat: z.number().min(-90).max(90),
    dropoff_lng: z.number().min(-180).max(180),
  })
  .strict();

export type DeliveryCheckRequest = z.infer<typeof DeliveryCheckRequest>;

/** Why a trip cannot be delivered. A lasting reason is reported before a pause. */
export const DeliveryRefusal = z.enum([
  'pickup_not_served',
  'dropoff_not_served',
  'too_far',
  'dropoff_paused',
]);

export type DeliveryRefusal = z.infer<typeof DeliveryRefusal>;

/**
 * One end of a checked trip. `served` says whether NexG works there at all;
 * the zone is named only when it is a live one.
 */
export const DeliveryPickup = z
  .object({ served: z.boolean(), zone_id: Uuid.nullable(), zone_name: z.string().nullable() })
  .strict();

export type DeliveryPickup = z.infer<typeof DeliveryPickup>;

/** The drop-off end. A paused zone is served but paused: NexG delivers there, not this minute. */
export const DeliveryDropoff = DeliveryPickup.extend({ paused: z.boolean() }).strict();

export type DeliveryDropoff = z.infer<typeof DeliveryDropoff>;

/**
 * The answer to POST /v1/delivery/check, at `data`.
 *
 * The ETA and the fee are given only when the trip is deliverable. The fee
 * is the rate card's (a base for the first kilometre, a rate for each
 * further commenced one) and is not binding: an order is priced when it is
 * placed.
 */
export const DeliveryCheck = z
  .object({
    deliverable: z.boolean(),
    reason: DeliveryRefusal.nullable(),
    message: z.string().nullable(),
    city_slug: z.string().nullable(),
    city_name: z.string().nullable(),
    pickup: DeliveryPickup,
    dropoff: DeliveryDropoff,
    distance_km: z.number().nonnegative(),
    max_distance_km: z.number().int().nullable(),
    eta_min: z.number().int().nullable(),
    eta_max: z.number().int().nullable(),
    delivery_fee_cents: Money.nullable(),
    currency: z.literal('KES'),
  })
  .strict();

export type DeliveryCheck = z.infer<typeof DeliveryCheck>;

/* ════════════════════════════════════════════════════════════════════════════ the requests */

/**
 * The query a list endpoint accepts.
 *
 * Reuses `PageRequest` from this package so that every list in
 * the system takes the same two parameters, whatever it is
 * listing. The API adds filters on top, one at a time, and only
 * where the view can answer them.
 */
export const ListRequest = PageRequest.extend({
  /**
   * Query strings are text: `?limit=5` arrives as "5". `PageRequest`
   * expects a number, so without coercion every limit was refused.
   */
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** A city slug. Omit for every city. */
  city: z.string().max(64).optional(),
  /** A taxonomy vertical, e.g. `pharmacy`. */
  category: z.string().max(64).optional(),
  /** A free-text search over the fields the view publishes. */
  q: z.string().max(120).optional(),
}).strict();

export type ListRequest = z.infer<typeof ListRequest>;

export { PageRequest };
/* ════════════════════════════════════════════════════════════════════════════ the write path */

/**
 * A booking for a service, made through the API.
 *
 * The caller says how many and when. It does not say what it costs,
 * because a caller that can state a price can state zero, and a
 * merchant asking for a discount is a conversation rather than a field
 * in a request. The price is read from the fee settings when the
 * booking is placed.
 */
export const ServiceBooking = z
  .object({
    /** The service code, e.g. `airport_transfer`. */
    service: z.string().min(1).max(64),
    /**
     * How many units. For a transfer, that is passengers. A flat-priced
     * service, such as a venue booking, costs the same whatever the number.
     */
    quantity: z.number().int().min(1).max(60).default(1),
    /** Where we collect from. Required for a ride or a courier. */
    pickup_label: z.string().max(240).optional(),
    pickup_lat: z.number().min(-90).max(90).optional(),
    pickup_lng: z.number().min(-180).max(180).optional(),
    /** Where we are going. Required for a ride or a courier. */
    dropoff_label: z.string().max(240).optional(),
    dropoff_lat: z.number().min(-90).max(90).optional(),
    dropoff_lng: z.number().min(-180).max(180).optional(),
    /** When. Optional: a booking can be "as soon as possible". */
    scheduled_for: z.string().datetime({ offset: true }).optional(),
    /** The people travelling. Names and numbers, for the rider. */
    passengers: z
      .array(
        z
          .object({
            name: z.string().max(120).optional(),
            phone: z.string().max(32).optional(),
            /** A flight number, when the trip starts at an airport. */
            flight: z.string().max(32).optional(),
          })
          .strict(),
      )
      .max(60)
      .optional(),
    /**
     * How it is paid. Only `on_account` today: the booking is charged to
     * the merchant's account with NexG. The database also knows M-Pesa
     * and card, but nothing yet collects either for an API booking, so
     * accepting them would leave orders that nobody can pay.
     */
    payment_method: z.enum(['on_account']).default('on_account'),
    /** Anything the driver should know. */
    note: z.string().max(1000).optional(),
  })
  .strict();

export type ServiceBooking = z.infer<typeof ServiceBooking>;

/**
 * What a booking comes back as: `data.booking` in the answer to
 * POST /v1/orders. A retry with the same Idempotency-Key gets the same
 * receipt, and the full order is GET /v1/orders/{order_id}.
 *
 * `total_cents` is what the booking cost, frozen at the moment it was
 * placed. It is not a quote and it will not change: the money on an
 * order is stored, not recomputed, because a figure that moves is a
 * figure two people can be shown different values of.
 */
export const BookingReceipt = z
  .object({
    order_id: Uuid,
    reference: z.string(),
    service: z.string(),
    quantity: z.number().int().positive(),
    total_cents: Money,
    currency: z.literal('KES'),
    payment_method: z.string(),
    scheduled_for: z.string().nullable(),
  })
  .strict();

export type BookingReceipt = z.infer<typeof BookingReceipt>;

/**
 * The header a write carries.
 *
 * `Idempotency-Key` is required on every write. Without it, a retry
 * after a timeout makes a second order, and a second airport transfer
 * is a second pickup that nobody asked for.
 */
export const IdempotencyHeader = z
  .object({
    'idempotency-key': IdempotencyKey,
  })
  .strict();

export type IdempotencyHeader = z.infer<typeof IdempotencyHeader>;

/**
 * The services a merchant can book.
 */
export const ApiService = z
  .object({
    code: z.string(),
    label: z.string(),
    kind: z.enum(['ride', 'booking', 'courier', 'experience']),
    unit_label: z.string(),
    active: z.boolean(),
  })
  .strict();

export type ApiService = z.infer<typeof ApiService>;

/**
 * A booking, read back.
 *
 * The receipt you get from `POST /v1/orders` is the answer to the
 * question "did you book it?". This is the answer to "where is it
 * now?", which is the question a merchant asks ten minutes later.
 *
 * The shape is deliberately flat and deliberately thin. A merchant's
 * own order is not public data, so none of the fields here are the
 * kind the catalogue publishes; and a caller that has a key bound to
 * the merchant does not need a separate "read your orders" concept
 * to be told the stage of an order it placed.
 */
/**
 * A booking's status: the same five words for every kind of booking. The
 * stage beside it says where the booking is in its own workflow.
 */
export const BookingStatus = z.enum([
  'requested',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
]);
export type BookingStatus = z.infer<typeof BookingStatus>;

/** Where a booking's rider is: the last position the rider's app sent. */
export const ApiBookingRiderLocation = z
  .object({
    latitude: z.number(),
    longitude: z.number(),
    /** When the rider's app sent this position. */
    at: z.string(),
  })
  .strict();

export type ApiBookingRiderLocation = z.infer<typeof ApiBookingRiderLocation>;

/**
 * The rider carrying a booking, as a merchant may see them: the first name,
 * the vehicle and its plate once a rider has the delivery job, and where the
 * rider is from pickup until delivery. Never a phone number or a surname.
 */
export const ApiBookingRider = z
  .object({
    first_name: z.string(),
    vehicle: z.enum(['motorbike', 'bicycle', 'car', 'tuktuk']),
    /** Null for a bicycle, or when none is on record. */
    plate: z.string().nullable(),
    /** When this rider took the job. */
    assigned_at: z.string().nullable(),
    /** Only from pickup until delivery: null before pickup, after delivery, or with no position yet. */
    location: ApiBookingRiderLocation.nullable(),
  })
  .strict();

export type ApiBookingRider = z.infer<typeof ApiBookingRider>;

export const ApiOrder = z
  .object({
    order_id: Uuid,
    reference: z.string(),
    service: z.string(),
    quantity: z.number().int().positive(),
    /** requested, confirmed, in_progress, completed or cancelled. */
    status: BookingStatus,
    /** Where the booking is in its own workflow, for example `picked_up`. */
    stage: z.string(),
    payment_method: z.string(),
    payment_status: z.string(),
    currency: z.literal('KES'),
    total_cents: Money,
    scheduled_for: z.string().nullable(),
    pickup_label: z.string().nullable(),
    dropoff_label: z.string().nullable(),
    created_at: z.string(),
    /** Who is carrying it, once a rider has the delivery job. Null until then, and after a cancellation. */
    rider: ApiBookingRider.nullable(),
  })
  .strict();

export type ApiOrder = z.infer<typeof ApiOrder>;

/* ════════════════════════════════════════════════════════════════════════════ reservations */

/** What was booked: the business's offering, as it was named when the booking was made. */
export const ApiReservationOffering = z
  .object({
    id: z.string().nullable(),
    name: z.string().nullable(),
    /** How it is booked, for example `TRANSFER`, `TOUR`, `APPOINTMENT` or `ASSET_INTERVAL`. */
    model: z.string().nullable(),
  })
  .strict();

export type ApiReservationOffering = z.infer<typeof ApiReservationOffering>;

/**
 * A reservation as a webhook event carries it: what, when, how many and
 * where it stands. No name, addresses or notes: NexG keeps events for 30
 * days, so read those with `GET /v1/reservations/{id}`.
 */
export const ApiReservationSummary = z
  .object({
    id: z.string(),
    /** `reservation` holds a time, seat or vehicle; `request` waits for the business to accept it. */
    kind: z.enum(['reservation', 'request']),
    /** requested, confirmed, in_progress, completed or cancelled. */
    status: BookingStatus,
    /** The booking engine's own word, for example `held` (waiting for payment) or `expired`. */
    stage: z.string(),
    offering: ApiReservationOffering,
    starts_at: z.string().nullable(),
    ends_at: z.string().nullable(),
    /** Seats, passengers or units, as the offering counts them. */
    quantity: z.number().int().nullable(),
    /** For example `awaiting_payment`, `paid` or `not_required`. */
    payment_state: z.string().nullable(),
    /** Goes up with every change, so an older copy can be told from a newer one. */
    version: z.number().int(),
    updated_at: z.string().nullable(),
  })
  .strict();

export type ApiReservationSummary = z.infer<typeof ApiReservationSummary>;

/** Where a transfer starts and ends, as the customer gave it. */
export const ApiReservationTrip = z
  .object({
    pickup_area: z.string().nullable(),
    pickup_address: z.string().nullable(),
    dropoff_area: z.string().nullable(),
    dropoff_address: z.string().nullable(),
  })
  .strict();

export type ApiReservationTrip = z.infer<typeof ApiReservationTrip>;

/**
 * A reservation: a tour seat, a transfer, a rental, an appointment, or a
 * request waiting for the business, booked by a customer on NexG or entered
 * by the business itself. These live in NexG's booking engine, not among
 * orders, and only the business that owns them can read them.
 *
 * Never a phone number or an email address: a customer booking keeps none,
 * and the business has its own copy of a booking it entered.
 */
export const ApiReservation = ApiReservationSummary.extend({
  /** The departure or session, for a tour or class with set times. */
  occurrence_id: z.string().nullable(),
  /** The vehicles, rooms, staff or places it holds. */
  resource_ids: z.array(z.string()),
  ticket_type: z.object({ id: z.string(), name: z.string().nullable() }).strict().nullable(),
  /** What quantity counts, for example `place` or `asset`. */
  capacity_unit: z.string().nullable(),
  /** The name the booking is under. */
  guest_name: z.string().nullable(),
  /** A transfer's pickup and drop-off. Null for anything that is not a trip. */
  trip: ApiReservationTrip.nullable(),
  /** Where the business goes to the customer, for a visit at their place. */
  service_location: z
    .object({ area: z.string().nullable(), address: z.string().nullable() })
    .strict()
    .nullable(),
  notes: z.string().nullable(),
  currency: z.literal('KES'),
  /** The price agreed when it was booked. Null while a request has no price yet. */
  total_cents: Money.nullable(),
  /** What has been paid so far through NexG. */
  paid_cents: Money,
  /** When the customer's booking code was checked at the business. */
  checked_in_at: z.string().nullable(),
  /** `nexg`: the customer booked on NexG. `merchant`: the business entered it. */
  booked_on: z.enum(['nexg', 'merchant']),
  created_at: z.string().nullable(),
}).strict();

export type ApiReservation = z.infer<typeof ApiReservation>;

/**
 * The query `GET /v1/reservations` accepts. Reservations come oldest change
 * first, so a system can keep the last `updated_at` it saw and ask for what
 * changed after it.
 */
export const ReservationListRequest = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(300).optional(),
    /** Only reservations changed after this time. */
    updated_after: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type ReservationListRequest = z.infer<typeof ReservationListRequest>;

/**
 * An event NexG posts to a merchant's webhook endpoint.
 *
 * The body is signed: `NexG-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256
 * of "<t>.<raw body>">`, keyed with the endpoint's signing secret. The same
 * event id is sent on every retry.
 */
export const WebhookEventType = z.enum([
  'booking.created',
  'booking.status_changed',
  'booking.stage_changed',
  'booking.rider_assigned',
  'reservation.created',
  'reservation.status_changed',
  'reservation.updated',
  'ping',
]);
export type WebhookEventType = z.infer<typeof WebhookEventType>;

export const WebhookEvent = z
  .object({
    id: Uuid,
    type: WebhookEventType,
    api_version: z.literal('v1'),
    environment: z.enum(['live', 'test']),
    created_at: z.string(),
    data: z
      .object({
        /** The booking as `GET /v1/orders/{id}` returns it, at this event. */
        booking: ApiOrder.optional(),
        /** reservation.* only: the reservation's summary at this event. */
        reservation: ApiReservationSummary.optional(),
        /** booking.status_changed and reservation.status_changed only. */
        previous_status: BookingStatus.optional(),
        /** booking.status_changed and booking.stage_changed. */
        previous_stage: z.string().optional(),
        /** booking.rider_assigned only: when the rider took the job. */
        assigned_at: z.string().optional(),
        /** ping only. */
        endpoint_id: Uuid.optional(),
        message: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export type WebhookEvent = z.infer<typeof WebhookEvent>;
