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
    description: 'Whether guests may pay cash on delivery.',
  },
  {
    name: 'pay_on_delivery_cap_kes',
    type: 'integer',
    nullable: true,
    description: 'The largest order, in whole shillings, that can be paid on delivery.',
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
    description: 'Whether cash on delivery is offered in the zone.',
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
      'Ticket prices at the organiser’s face value: a list of { label, price_kes, currency }. NexG never adds a margin to a ticket.',
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
      'What a day around the event usually includes: a list of { kind, mood, slot, title, swap_group }.',
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
    description: 'What one unit is called, for example passenger or parcel.',
  },
  {
    name: 'active',
    type: 'boolean',
    description: 'Always true: inactive services are not listed.',
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
    name: 'stage',
    type: 'string',
    description:
      'Where the order is: placed, confirmed, preparing, ready, picked_up, arriving, delivered, cancelled, disputed or refunded. The same stage the merchant console shows.',
  },
  {
    name: 'payment_method',
    type: 'string',
    description: 'mpesa_stk, card, bank_transfer, cash_on_delivery, charge_to_room or on_account.',
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
];

export const BOOKING_REQUEST_FIELDS: FieldDoc[] = [
  { name: 'service', type: 'string', description: 'A service code from GET /v1/services.' },
  {
    name: 'quantity',
    type: 'integer',
    description: 'How many units, 1 to 60. Defaults to 1. For a transfer, passengers.',
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
    description: 'on_account (the default), mpesa_stk or card.',
  },
  {
    name: 'note',
    type: 'string',
    description: 'Anything the driver should know. Up to 1,000 characters.',
  },
];

export const BOOKING_RECEIPT_FIELDS: FieldDoc[] = [
  { name: 'ok', type: 'boolean', description: 'Always true on a receipt.' },
  { name: 'order_id', type: 'uuid', description: 'NexG’s id for the new order.' },
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
  { name: 'payment_method', type: 'string', description: 'How it will be paid.' },
  {
    name: 'scheduled_for',
    type: 'timestamp',
    nullable: true,
    description: 'When it is booked for, if scheduled.',
  },
];
