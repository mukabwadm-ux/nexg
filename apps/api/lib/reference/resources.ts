import type { FieldDoc } from './types';

/**
 * Field-by-field descriptions of the objects the API sends and accepts.
 *
 * Each list mirrors one schema in `@nexg/contracts/api`. The tests compare
 * the field names here with the schema's keys, so adding a field to the
 * contract without describing it here fails the build.
 */

export const MERCHANT_FIELDS: FieldDoc[] = [
  {
    name: 'id',
    type: 'uuid',
    description: 'The merchant’s id. Use it with GET /v1/catalog/merchants/{id}.',
  },
  { name: 'trading_name', type: 'string', description: 'The name guests see on nexgapp.com.' },
  {
    name: 'category',
    type: 'string',
    description: 'The taxonomy vertical, for example restaurant, pharmacy or laundry.',
  },
  {
    name: 'category_other',
    type: 'string',
    nullable: true,
    description: 'Free text describing the business when category is other.',
  },
  {
    name: 'cover_photo_path',
    type: 'string',
    nullable: true,
    description:
      'The cover image as nexgapp.com loads it: a URL, or a path that resolves against https://nexgapp.com.',
  },
  { name: 'featured', type: 'boolean', description: 'Shown in NexG’s featured placements.' },
  { name: 'city_slug', type: 'string', description: 'The city, as a slug such as nairobi.' },
  { name: 'city_name', type: 'string', description: 'The city’s display name.' },
  {
    name: 'branch_name',
    type: 'string',
    nullable: true,
    description: 'The primary branch’s name.',
  },
  {
    name: 'branch_address',
    type: 'string',
    nullable: true,
    description: 'The primary branch’s street address.',
  },
  {
    name: 'branch_latitude',
    type: 'number',
    nullable: true,
    description: 'Latitude of the primary branch (WGS 84).',
  },
  {
    name: 'branch_longitude',
    type: 'number',
    nullable: true,
    description: 'Longitude of the primary branch (WGS 84).',
  },
  {
    name: 'listed_at',
    type: 'timestamp',
    description: 'When the merchant went live, which is when guests could first see it.',
  },
  {
    name: 'explore_visible',
    type: 'boolean',
    nullable: true,
    description: 'Whether the merchant appears in Explore on nexgapp.com.',
  },
  {
    name: 'concierge_pick',
    type: 'boolean',
    nullable: true,
    description: 'Chosen by NexG’s concierge team.',
  },
  {
    name: 'accepting_orders',
    type: 'boolean',
    nullable: true,
    description: 'Whether the merchant is taking orders right now.',
  },
  {
    name: 'pay_on_delivery_enabled',
    type: 'boolean',
    nullable: true,
    description:
      'Always false: pay on delivery was removed on 23 Nov 2026. Kept so existing clients do not break.',
  },
  {
    name: 'pay_on_delivery_cap_kes',
    type: 'integer',
    nullable: true,
    description: 'Always null: pay on delivery was removed on 23 Nov 2026.',
  },
  {
    name: 'prep_minutes',
    type: 'integer',
    nullable: true,
    description: 'Typical preparation time, in minutes.',
  },
  {
    name: 'busy_mode_until',
    type: 'timestamp',
    nullable: true,
    description: 'Set while the merchant is in busy mode: the time it ends.',
  },
  {
    name: 'closed_early_at',
    type: 'timestamp',
    nullable: true,
    description: 'Set when the merchant closed early today.',
  },
  {
    name: 'parent_merchant_id',
    type: 'uuid',
    nullable: true,
    description: 'For a chain, the merchant this branch replicates.',
  },
  {
    name: 'subcategory',
    type: 'string',
    nullable: true,
    description: 'The subcategory within the vertical, when one is set.',
  },
];

export const CATALOGUE_ITEM_FIELDS: FieldDoc[] = [
  { name: 'id', type: 'uuid', description: 'The item’s id.' },
  { name: 'merchant_id', type: 'uuid', description: 'The merchant that sells it.' },
  {
    name: 'section_id',
    type: 'uuid',
    nullable: true,
    description: 'The menu or catalogue section it sits in.',
  },
  { name: 'name', type: 'string', description: 'The item’s name.' },
  { name: 'description', type: 'string', nullable: true, description: 'The item’s description.' },
  {
    name: 'price_kes',
    type: 'integer',
    description: 'List price in whole Kenyan shillings. Always an integer, never a decimal.',
  },
  {
    name: 'available',
    type: 'boolean',
    nullable: true,
    description: 'Whether it can be ordered now.',
  },
  {
    name: 'age_restricted',
    type: 'boolean',
    nullable: true,
    description:
      'Sold to adults only, with ID checked at hand-over. Listed only when the merchant holds a verified licence.',
  },
  {
    name: 'highlighted',
    type: 'boolean',
    nullable: true,
    description: 'Highlighted by the merchant on its storefront.',
  },
  { name: 'sort', type: 'integer', nullable: true, description: 'Position within its section.' },
];

export const ZONE_FIELDS: FieldDoc[] = [
  { name: 'id', type: 'uuid', description: 'The zone’s id.' },
  { name: 'city_id', type: 'uuid', description: 'The city the zone belongs to.' },
  { name: 'name', type: 'string', description: 'The zone’s name, for example Westlands.' },
  {
    name: 'tier',
    type: 'string',
    nullable: true,
    description: 'core, extended or trial: how established delivery is in the zone.',
  },
  {
    name: 'eta_min',
    type: 'integer',
    nullable: true,
    description: 'Shortest typical delivery time, in minutes.',
  },
  {
    name: 'eta_max',
    type: 'integer',
    nullable: true,
    description: 'Longest typical delivery time, in minutes.',
  },
  {
    name: 'cod_allowed',
    type: 'boolean',
    nullable: true,
    description:
      'Always false: pay on delivery was removed on 23 Nov 2026. Kept so existing clients do not break.',
  },
  { name: 'west', type: 'number', nullable: true, description: 'Bounding box: western longitude.' },
  {
    name: 'south',
    type: 'number',
    nullable: true,
    description: 'Bounding box: southern latitude.',
  },
  { name: 'east', type: 'number', nullable: true, description: 'Bounding box: eastern longitude.' },
  {
    name: 'north',
    type: 'number',
    nullable: true,
    description: 'Bounding box: northern latitude.',
  },
];

/** The body of POST /v1/delivery/check: the same fields a ride or courier booking takes. */
export const DELIVERY_CHECK_REQUEST_FIELDS: FieldDoc[] = [
  { name: 'pickup_lat', type: 'number', description: 'Where the rider collects: latitude.' },
  { name: 'pickup_lng', type: 'number', description: 'Where the rider collects: longitude.' },
  { name: 'dropoff_lat', type: 'number', description: 'Where the rider delivers: latitude.' },
  { name: 'dropoff_lng', type: 'number', description: 'Where the rider delivers: longitude.' },
];

export const DELIVERY_CHECK_FIELDS: FieldDoc[] = [
  {
    name: 'deliverable',
    type: 'boolean',
    description: 'Whether NexG can deliver this trip now.',
  },
  {
    name: 'reason',
    type: "'pickup_not_served' | 'dropoff_not_served' | 'too_far' | 'dropoff_paused'",
    nullable: true,
    description:
      'Why not, when deliverable is false; null when it is true. A lasting reason comes before a pause: a trip that is too far says too_far even while its drop-off zone is paused.',
  },
  {
    name: 'message',
    type: 'string',
    nullable: true,
    description: 'The reason in a sentence a person can read. Null when the trip is deliverable.',
  },
  {
    name: 'city_slug',
    type: 'string',
    nullable: true,
    description:
      'The city the pickup is in, which prices the trip. Null when NexG does not collect there.',
  },
  { name: 'city_name', type: 'string', nullable: true, description: 'The same city’s name.' },
  { name: 'pickup', type: 'object', description: 'The pickup end. See Pickup.' },
  { name: 'dropoff', type: 'object', description: 'The drop-off end. See Drop-off.' },
  {
    name: 'distance_km',
    type: 'number',
    description: 'Pickup to drop-off in a straight line, in kilometres to one decimal place.',
  },
  {
    name: 'max_distance_km',
    type: 'integer',
    nullable: true,
    description:
      'The longest straight-line trip NexG delivers in that city. Null when NexG does not collect at the pickup.',
  },
  {
    name: 'eta_min',
    type: 'integer',
    nullable: true,
    description:
      'Shortest typical delivery time into the drop-off zone, in minutes. Null when the trip is not deliverable, or the drop-off is in no zone.',
  },
  {
    name: 'eta_max',
    type: 'integer',
    nullable: true,
    description: 'Longest typical delivery time into the drop-off zone, in minutes. Null as above.',
  },
  {
    name: 'delivery_fee_cents',
    type: 'integer',
    nullable: true,
    description:
      'The delivery fee from NexG’s rate card, in cents: a base fee covering the first kilometre, plus a per-kilometre rate for each further kilometre begun. Null when the trip is not deliverable.',
  },
  { name: 'currency', type: "'KES'", description: 'Always KES.' },
];

export const DELIVERY_PICKUP_FIELDS: FieldDoc[] = [
  {
    name: 'served',
    type: 'boolean',
    description:
      'Whether NexG collects there: inside a live zone, or within the delivery radius of a city NexG serves.',
  },
  {
    name: 'zone_id',
    type: 'uuid',
    nullable: true,
    description:
      'The live zone the point is in, as GET /v1/zones lists it. Null outside every zone.',
  },
  { name: 'zone_name', type: 'string', nullable: true, description: 'That zone’s name.' },
];

export const DELIVERY_DROPOFF_FIELDS: FieldDoc[] = [
  {
    name: 'served',
    type: 'boolean',
    description:
      'Whether NexG delivers there: inside a live zone, or within the delivery radius of a city NexG serves. A paused zone is still served.',
  },
  ...DELIVERY_PICKUP_FIELDS.slice(1),
  {
    name: 'paused',
    type: 'boolean',
    description:
      'true while deliveries into the drop-off zone are paused. The message gives the reason staff gave.',
  },
];

export const EVENT_FIELDS: FieldDoc[] = [
  { name: 'id', type: 'uuid', description: 'The event’s id.' },
  { name: 'city_id', type: 'uuid', description: 'The city it takes place in.' },
  { name: 'name', type: 'string', nullable: true, description: 'The event’s name.' },
  {
    name: 'category',
    type: 'string',
    nullable: true,
    description: 'sport, music, food_drink, culture, family, nightlife or other.',
  },
  { name: 'venue_name', type: 'string', nullable: true, description: 'Where it is held.' },
  { name: 'venue_address', type: 'string', nullable: true, description: 'The venue’s address.' },
  { name: 'starts_at', type: 'timestamp', nullable: true, description: 'When it starts.' },
  { name: 'ends_at', type: 'timestamp', nullable: true, description: 'When it ends.' },
  { name: 'doors_at', type: 'timestamp', nullable: true, description: 'When doors open.' },
  {
    name: 'cover_path',
    type: 'string',
    nullable: true,
    description: 'The cover image, as a URL or a path on nexgapp.com.',
  },
  { name: 'featured', type: 'boolean', nullable: true, description: 'Featured by NexG.' },
  {
    name: 'anchor_slot',
    type: 'string',
    nullable: true,
    description:
      'The part of the day the event pins when NexG plans around it: early, morning, midday, afternoon, evening, night or late.',
  },
  { name: 'organiser_name', type: 'string', nullable: true, description: 'Who runs it.' },
  {
    name: 'organiser_url',
    type: 'string',
    nullable: true,
    description: 'The organiser’s website.',
  },
  { name: 'ticket_url', type: 'string', nullable: true, description: 'Where tickets are sold.' },
  {
    name: 'ticket_bands',
    type: 'array',
    description:
      'Ticket prices at the organiser’s face value: a list of { label, price_kes, currency }. price_kes is a positive number of shillings; currency may be absent. Empty when there are no bands. NexG never adds a margin to a ticket.',
  },
  {
    name: 'nexg_can_hold_tickets',
    type: 'boolean',
    nullable: true,
    description: 'Whether NexG can hold tickets for a guest’s day out.',
  },
  {
    name: 'practical_note',
    type: 'string',
    nullable: true,
    description: 'Something a guest should know, such as parking or road closures.',
  },
  {
    name: 'suggested_blocks',
    type: 'array',
    description:
      'What a day around the event usually includes, as NexG’s team entered it: a list, usually of { kind, mood, slot, title, swap_group }. Read it defensively.',
  },
];

export const SERVICE_FIELDS: FieldDoc[] = [
  {
    name: 'code',
    type: 'string',
    description: 'The stable code you will send when booking, for example airport_transfer.',
  },
  { name: 'label', type: 'string', description: 'What a person reads.' },
  {
    name: 'kind',
    type: 'string',
    description: 'ride, booking, courier or experience. It decides what a booking needs.',
  },
  {
    name: 'unit_label',
    type: 'string',
    description:
      'What one unit is called, for example passenger or parcel. Where it is booking, the service is charged once per booking.',
  },
  {
    name: 'active',
    type: 'boolean',
    description: 'Always true: inactive services are not listed.',
  },
];

export const BRANCH_FIELDS: FieldDoc[] = [
  { name: 'id', type: 'uuid', description: 'NexG’s id for the branch.' },
  { name: 'name', type: 'string | null', description: 'What the merchant calls the branch.' },
  { name: 'address', type: 'string | null', description: 'Its street address.' },
  { name: 'latitude', type: 'number | null', description: 'Where it is, for a map.' },
  { name: 'longitude', type: 'number | null', description: 'Where it is, for a map.' },
  {
    name: 'is_primary',
    type: 'boolean',
    description: 'The branch the merchant’s own branch_ fields describe.',
  },
  {
    name: 'place_type',
    type: 'string',
    description: 'physical for a place guests visit; other values for service that comes to them.',
  },
  {
    name: 'contact',
    type: 'string | null',
    description: 'A public phone number or email for the branch, when the merchant gives one.',
  },
  { name: 'paused', type: 'boolean', description: 'Not taking orders or bookings for now.' },
  {
    name: 'opens_today',
    type: 'string | null',
    description: 'Today’s opening time in Nairobi, HH:MM:SS.',
  },
  {
    name: 'closes_today',
    type: 'string | null',
    description: 'Today’s closing time in Nairobi, HH:MM:SS.',
  },
  {
    name: 'closed_today',
    type: 'boolean | null',
    description: 'True when it does not open today.',
  },
];

export const ORDER_FIELDS: FieldDoc[] = [
  { name: 'order_id', type: 'uuid', description: 'NexG’s id for the order. Store it.' },
  {
    name: 'reference',
    type: 'string',
    description: 'The reference people read, such as NX-261110-0003. Store it too.',
  },
  {
    name: 'service',
    type: 'string',
    description: 'The API service code for a service booking; an empty string for other orders.',
  },
  {
    name: 'quantity',
    type: 'integer',
    description: 'Units on the order: passengers for a transfer, items for a basket.',
  },
  {
    name: 'status',
    type: 'string',
    description:
      'The same five words for every kind of booking: requested, confirmed, in_progress, completed or cancelled. Use it to decide what to do; use stage for detail.',
  },
  {
    name: 'stage',
    type: 'string',
    description:
      'Where the order is in its own workflow: placed, confirmed, preparing, ready, picked_up, arriving, delivered, cancelled, disputed or refunded. The same stage the merchant console shows.',
  },
  {
    name: 'payment_method',
    type: 'string',
    description:
      'mpesa_stk, card, bank_transfer, charge_to_room or on_account. Older orders may show cash_on_delivery, which is no longer offered.',
  },
  {
    name: 'payment_status',
    type: 'string',
    description: 'pending, authorised, paid, collected, failed, refunded or partially_refunded.',
  },
  { name: 'currency', type: 'string', description: 'Always KES.' },
  {
    name: 'total_cents',
    type: 'integer',
    description: 'The order total in cents (KES 1,616.25 is 161625), fixed when it was placed.',
  },
  {
    name: 'scheduled_for',
    type: 'timestamp',
    nullable: true,
    description: 'When it is booked for, if it was scheduled.',
  },
  {
    name: 'pickup_label',
    type: 'string',
    nullable: true,
    description: 'Where it is collected from, for a ride or a courier.',
  },
  {
    name: 'dropoff_label',
    type: 'string',
    nullable: true,
    description: 'Where it is going.',
  },
  { name: 'created_at', type: 'timestamp', description: 'When it was placed.' },
  {
    name: 'rider',
    type: 'object',
    nullable: true,
    description:
      'Who is carrying it, once a rider has the delivery job: first name, vehicle and plate, and where the rider is from pickup until delivery. Null until a rider takes the job, and after a cancellation.',
  },
];

export const RIDER_FIELDS: FieldDoc[] = [
  {
    name: 'first_name',
    type: 'string',
    description:
      'The rider’s first name, so your team knows who is coming. NexG never shares a rider’s phone number or surname.',
  },
  { name: 'vehicle', type: 'string', description: 'motorbike, bicycle, car or tuktuk.' },
  {
    name: 'plate',
    type: 'string',
    nullable: true,
    description: 'The number plate, to hand the order to the right rider. Null for a bicycle.',
  },
  {
    name: 'assigned_at',
    type: 'timestamp',
    nullable: true,
    description:
      'When this rider took the job. When another rider takes over, this shows the new rider.',
  },
  {
    name: 'location',
    type: 'object',
    nullable: true,
    description:
      'Where the rider is, from pickup until delivery. Null before pickup, after delivery, and until the rider’s app sends a position.',
  },
];

export const RIDER_LOCATION_FIELDS: FieldDoc[] = [
  { name: 'latitude', type: 'number', description: 'Latitude, in degrees.' },
  { name: 'longitude', type: 'number', description: 'Longitude, in degrees.' },
  {
    name: 'at',
    type: 'timestamp',
    description:
      'When the rider’s app sent this position. Check it: an app that goes offline stops sending.',
  },
];

export const RESERVATION_FIELDS: FieldDoc[] = [
  {
    name: 'id',
    type: 'string',
    description:
      'NexG’s id for the reservation. Store it: events and GET /v1/reservations/{id} use it.',
  },
  {
    name: 'kind',
    type: 'string',
    description:
      'reservation: it holds a time, a seat or a vehicle. request: it waits for you to accept it, and holds nothing until then.',
  },
  {
    name: 'status',
    type: 'string',
    description:
      'The same five words as orders: requested, confirmed, in_progress, completed or cancelled. A reservation waiting for the customer’s payment is requested.',
  },
  {
    name: 'stage',
    type: 'string',
    description:
      'The booking engine’s own word, for detail: held (waiting for payment), pending, confirmed, accepted, in_progress, completed, cancelled, expired or no-show.',
  },
  {
    name: 'offering',
    type: 'object',
    description:
      'What was booked: the offering’s id, its name when it was booked, and how it is booked.',
  },
  {
    name: 'starts_at',
    type: 'timestamp',
    nullable: true,
    description: 'When it starts. Null for a request with no time yet.',
  },
  { name: 'ends_at', type: 'timestamp', nullable: true, description: 'When it ends.' },
  {
    name: 'quantity',
    type: 'integer',
    nullable: true,
    description: 'Seats, passengers or units, as the offering counts them (see capacity_unit).',
  },
  {
    name: 'payment_state',
    type: 'string',
    nullable: true,
    description:
      'For example awaiting_payment, paid or not_required. A customer booking on NexG is paid before it is confirmed.',
  },
  {
    name: 'version',
    type: 'integer',
    description:
      'Goes up with every change. Keep the highest you have seen and ignore an older copy.',
  },
  {
    name: 'updated_at',
    type: 'timestamp',
    nullable: true,
    description: 'When it last changed. Keep the last one you saw and pass it as updated_after.',
  },
  {
    name: 'occurrence_id',
    type: 'string',
    nullable: true,
    description: 'The departure or session it is on, for a tour or a class with set times.',
  },
  {
    name: 'resource_ids',
    type: 'string[]',
    description: 'The vehicles, rooms, staff or places it holds, by your ids in the booking setup.',
  },
  {
    name: 'ticket_type',
    type: 'object',
    nullable: true,
    description: 'The ticket type chosen, for an offering that has them: its id and name.',
  },
  {
    name: 'capacity_unit',
    type: 'string',
    nullable: true,
    description: 'What quantity counts, for example place or asset.',
  },
  {
    name: 'guest_name',
    type: 'string',
    nullable: true,
    description:
      'The name the booking is under, for the signboard at arrivals or the list at the gate. Never a phone number or an email address.',
  },
  {
    name: 'trip',
    type: 'object',
    nullable: true,
    description:
      'A transfer’s pickup and drop-off, as the customer gave them. Null if it is not a trip.',
  },
  {
    name: 'service_location',
    type: 'object',
    nullable: true,
    description: 'Where you go to the customer, for a visit at their place: area and address.',
  },
  {
    name: 'notes',
    type: 'string',
    nullable: true,
    description: 'What the customer or your team wrote on the booking.',
  },
  { name: 'currency', type: 'string', description: 'Always KES.' },
  {
    name: 'total_cents',
    type: 'integer',
    nullable: true,
    description:
      'The price agreed when it was booked, in cents (KES 3,500 is 350000). Null while a request has no price yet.',
  },
  {
    name: 'paid_cents',
    type: 'integer',
    description: 'What has been paid so far through NexG, in cents.',
  },
  {
    name: 'checked_in_at',
    type: 'timestamp',
    nullable: true,
    description: 'When the customer’s booking code was checked at your business.',
  },
  {
    name: 'booked_on',
    type: 'string',
    description: 'nexg: the customer booked on NexG. merchant: your team entered it.',
  },
  { name: 'created_at', type: 'timestamp', nullable: true, description: 'When it was booked.' },
  {
    name: 'driver',
    type: 'object',
    nullable: true,
    description:
      'Who is coming, once you set it with PUT /v1/reservations/{id}/driver: first name, vehicle and plate. The customer sees it on their booking.',
  },
  {
    name: 'refund_state',
    type: 'string',
    nullable: true,
    description:
      'review_required: the customer paid and the booking was cancelled, so NexG Finance refunds them in full.',
  },
];

export const RESERVATION_OFFERING_FIELDS: FieldDoc[] = [
  {
    name: 'id',
    type: 'string',
    nullable: true,
    description: 'The offering’s id in your booking setup.',
  },
  { name: 'name', type: 'string', nullable: true, description: 'Its name when it was booked.' },
  {
    name: 'model',
    type: 'string',
    nullable: true,
    description:
      'How it is booked, for example TRANSFER, TOUR, SESSION_CAPACITY, APPOINTMENT or ASSET_INTERVAL (a rental).',
  },
];

export const RESERVATION_TRIP_FIELDS: FieldDoc[] = [
  {
    name: 'pickup_area',
    type: 'string',
    nullable: true,
    description: 'The pickup area, for example JKIA.',
  },
  { name: 'pickup_address', type: 'string', nullable: true, description: 'The pickup address.' },
  { name: 'dropoff_area', type: 'string', nullable: true, description: 'The drop-off area.' },
  { name: 'dropoff_address', type: 'string', nullable: true, description: 'The drop-off address.' },
  {
    name: 'flight_number',
    type: 'string',
    nullable: true,
    description: 'The customer’s flight for an airport pickup, as airlines print it: KQ 101.',
  },
];

export const RESERVATION_DRIVER_FIELDS: FieldDoc[] = [
  {
    name: 'first_name',
    type: 'string',
    description: 'The driver’s first name, shown to the customer. No surname, no phone number.',
  },
  { name: 'vehicle', type: 'string', description: 'The vehicle, for example White Toyota Noah.' },
  {
    name: 'plate',
    type: 'string',
    nullable: true,
    description: 'The number plate, in capitals, so the customer finds the right car.',
  },
  {
    name: 'assigned_at',
    type: 'timestamp',
    nullable: true,
    description: 'When the driver was set.',
  },
  {
    name: 'location',
    type: 'object',
    nullable: true,
    description:
      'Where the driver last was, as your system sent it: latitude, longitude and at. Null until it sends one.',
  },
];

export const OFFERING_FIELDS: FieldDoc[] = [
  {
    name: 'id',
    type: 'string',
    description: 'The offering’s id, as reservations name it in offering.id.',
  },
  { name: 'name', type: 'string', nullable: true, description: 'Its name, as customers see it.' },
  {
    name: 'model',
    type: 'string',
    nullable: true,
    description:
      'How it is booked: TRANSFER, TOUR, SESSION_CAPACITY, APPOINTMENT, ASSET_INTERVAL (a rental) and others.',
  },
  { name: 'active', type: 'boolean', description: 'false: switched off and not shown.' },
  {
    name: 'booking_enabled',
    type: 'boolean',
    description: 'false: shown, but not taking new bookings.',
  },
  { name: 'currency', type: 'string', description: 'Always KES.' },
  {
    name: 'price_cents',
    type: 'integer',
    nullable: true,
    description: 'The price in cents (KES 3,500 is 350000), per pricing_basis.',
  },
  {
    name: 'pricing_basis',
    type: 'string',
    description: 'per_booking, per_quantity, per_duration, per_night or indicative.',
  },
  {
    name: 'duration_minutes',
    type: 'integer',
    nullable: true,
    description: 'How long one booking lasts, when it is fixed.',
  },
  {
    name: 'capacity',
    type: 'integer',
    nullable: true,
    description: 'Places per booking or session, where it has one.',
  },
  {
    name: 'capacity_unit',
    type: 'string',
    nullable: true,
    description: 'What capacity counts, for example place.',
  },
  {
    name: 'resource_ids',
    type: 'string[]',
    description: 'The resources it books, from GET /v1/resources.',
  },
  {
    name: 'version',
    type: 'integer',
    description: 'Send it back as expected_version when you change the offering or its departures.',
  },
  {
    name: 'departures',
    type: 'object[]',
    description: 'For a tour or class: its departures that have not ended. Empty otherwise.',
  },
];

export const DEPARTURE_FIELDS: FieldDoc[] = [
  { name: 'id', type: 'string', description: 'The departure’s id, as departure_id.' },
  { name: 'starts_at', type: 'timestamp', description: 'When it leaves or starts.' },
  { name: 'ends_at', type: 'timestamp', description: 'When it ends.' },
  { name: 'capacity', type: 'integer', description: 'Seats or places on it.' },
  { name: 'published', type: 'boolean', description: 'false: closed to new bookings.' },
  {
    name: 'resource_ids',
    type: 'string[]',
    description: 'The guides, vehicles or places it uses.',
  },
  {
    name: 'version',
    type: 'integer',
    description: 'Send it back as expected_departure_version when you change it.',
  },
];

export const RESOURCE_FIELDS: FieldDoc[] = [
  {
    name: 'id',
    type: 'string',
    description: 'The resource’s id, as reservations name it in resource_ids.',
  },
  { name: 'name', type: 'string', nullable: true, description: 'Its name, for example Van one.' },
  {
    name: 'kind',
    type: 'string',
    nullable: true,
    description: 'staff, asset, vehicle, room, space, equipment or capacity_pool.',
  },
  {
    name: 'quantity',
    type: 'integer',
    nullable: true,
    description: 'How many it holds: 1 for a vehicle or room, the places in a pool.',
  },
  { name: 'active', type: 'boolean', description: 'false: not in use.' },
  {
    name: 'schedule',
    type: 'object',
    nullable: true,
    description: 'Its working days (0 is Sunday) and its start and end time, in Nairobi time.',
  },
  {
    name: 'closures',
    type: 'object[]',
    description: 'Times it is closed that have not ended: busy elsewhere, maintenance, time off.',
  },
  {
    name: 'version',
    type: 'integer',
    description: 'Send it back as expected_version when you add or remove a closure.',
  },
];

export const CLOSURE_FIELDS: FieldDoc[] = [
  { name: 'id', type: 'string', description: 'The closure’s id, to remove it.' },
  { name: 'starts_at', type: 'timestamp', description: 'When it starts.' },
  { name: 'ends_at', type: 'timestamp', description: 'When it ends.' },
  {
    name: 'reason',
    type: 'string',
    nullable: true,
    description: 'Why, as your team wrote it. Customers never see it.',
  },
];

export const BOOKING_REQUEST_FIELDS: FieldDoc[] = [
  { name: 'service', type: 'string', description: 'A service code from GET /v1/services.' },
  {
    name: 'quantity',
    type: 'integer',
    description:
      'How many units, 1 to 60. Defaults to 1. For a transfer, passengers. A flat-priced service, such as a venue booking, costs the same whatever the quantity.',
  },
  {
    name: 'pickup_label',
    type: 'string',
    description: 'Where to collect from. Needed for a ride or a courier.',
  },
  { name: 'pickup_lat', type: 'number', description: 'Pickup latitude.' },
  { name: 'pickup_lng', type: 'number', description: 'Pickup longitude.' },
  {
    name: 'dropoff_label',
    type: 'string',
    description: 'Where to go. Needed for a ride or a courier.',
  },
  { name: 'dropoff_lat', type: 'number', description: 'Drop-off latitude.' },
  { name: 'dropoff_lng', type: 'number', description: 'Drop-off longitude.' },
  {
    name: 'scheduled_for',
    type: 'timestamp',
    description: 'When, with a UTC offset. Leave it out for as soon as possible.',
  },
  {
    name: 'passengers',
    type: 'array',
    description: 'Up to 60 of { name, phone, flight } for the people travelling.',
  },
  {
    name: 'payment_method',
    type: 'string',
    description:
      'on_account, the default and the only method today: charged to your merchant’s account with NexG.',
  },
  {
    name: 'note',
    type: 'string',
    description: 'Anything the driver should know. Up to 1,000 characters.',
  },
];

export const BOOKING_RECEIPT_FIELDS: FieldDoc[] = [
  {
    name: 'order_id',
    type: 'uuid',
    description: 'NexG’s id for the new order. GET /v1/orders/{order_id} reads it in full.',
  },
  { name: 'reference', type: 'string', description: 'The reference people read.' },
  { name: 'service', type: 'string', description: 'The service code you booked.' },
  { name: 'quantity', type: 'integer', description: 'How many units.' },
  {
    name: 'total_cents',
    type: 'integer',
    description:
      'What it cost, in cents, priced by NexG from its fee settings. A caller never sets a price.',
  },
  { name: 'currency', type: 'string', description: 'Always KES.' },
  { name: 'payment_method', type: 'string', description: 'How it will be paid: on_account.' },
  {
    name: 'scheduled_for',
    type: 'timestamp',
    nullable: true,
    description: 'When it is booked for, in UTC. Null for as soon as possible.',
  },
];
