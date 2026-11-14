import {
  BOOKING_RECEIPT_FIELDS,
  BOOKING_REQUEST_FIELDS,
  CATALOGUE_ITEM_FIELDS,
  EVENT_FIELDS,
  MERCHANT_FIELDS,
  ORDER_FIELDS,
  SERVICE_FIELDS,
  ZONE_FIELDS,
} from './resources';
import { HOSTS, type EndpointDoc, type ErrorDoc, type ParamDoc } from './types';

/**
 * Every endpoint the NexG API serves or has designed: the one list the
 * reference, the sidebar, the home page and the changelog are built from.
 *
 * Changing the API? Change this file in the same pull request:
 *
 * - A new route: add an entry with status `live` and a changelog entry
 *   that names its slug.
 * - A coming-soon endpoint that ships: flip it to `live`, set `since`,
 *   and add the changelog entry.
 * - A removed or renamed route: keep the entry, mark it in the changelog.
 *
 * `tests/reference.test.ts` fails when a route file serves a method this
 * file does not list as live, when a live entry has no handler, when a
 * coming-soon entry already has one, and when an example or a field list
 * no longer matches the schemas in `@nexg/contracts/api`.
 *
 * Example values are illustrative. Merchant and catalogue names come from
 * NexG's demo data; amounts are not NexG prices.
 */

const MERCHANT_ID = '9b2f6c1e-4a7d-4c3b-8e21-5f0a7d3c9e14';
const NAIROBI_ID = 'c1a5e2d4-7b3f-4e8a-9c6d-2f1b0e4a8d37';

const SOKONI = {
  id: MERCHANT_ID,
  trading_name: 'Sokoni Grill House',
  category: 'restaurant',
  category_other: null,
  cover_photo_path: '/images/merchants/grill-restaurant.jpg',
  featured: true,
  city_slug: 'nairobi',
  city_name: 'Nairobi',
  branch_name: 'Westlands',
  branch_address: 'Woodvale Grove, Westlands, Nairobi',
  branch_latitude: -1.2648,
  branch_longitude: 36.8027,
  listed_at: '2026-10-21T08:15:00+00:00',
  explore_visible: true,
  concierge_pick: true,
  accepting_orders: true,
  pay_on_delivery_enabled: true,
  pay_on_delivery_cap_kes: 5000,
  prep_minutes: 25,
  busy_mode_until: null,
  closed_early_at: null,
  parent_merchant_id: null,
  subcategory: null,
};

/* ───────────────────────────────────────────── shared parameter and error rows */

const AUTH_HEADERS: ParamDoc[] = [
  {
    name: 'X-Api-Key',
    in: 'header',
    type: 'string',
    required: false,
    description:
      'Your API key. Or send it as Authorization: Bearer <key>, but never both in one request.',
  },
];

const KEY_REQUIRED_HEADERS: ParamDoc[] = [
  {
    name: 'X-Api-Key',
    in: 'header',
    type: 'string',
    required: true,
    description:
      'A key bound to your merchant, with merchant_read. Or send it as Authorization: Bearer <key>.',
  },
];

const LIMIT_PARAM: ParamDoc = {
  name: 'limit',
  in: 'query',
  type: 'integer',
  required: false,
  description:
    'Results per page, 1 to 100. Defaults to 25. A value outside that range is refused with 400.',
};

const CURSOR_PARAM: ParamDoc = {
  name: 'cursor',
  in: 'query',
  type: 'string',
  required: false,
  description:
    'The next_cursor from the previous page, passed back unchanged. Leave it out for the first page. A cursor this endpoint did not issue is refused with 400.',
};

/** Every unexpected failure now answers with the JSON envelope. */
const UNEXPECTED_ERROR: ErrorDoc = {
  status: 500,
  code: 'internal_error',
  when: 'Something unexpected failed on NexG’s side. NexG logs the X-Request-Id: quote it if you report the failure.',
};

function credentialErrors(scope: string, anonymousAllowed: boolean): ErrorDoc[] {
  return [
    {
      status: 400,
      code: 'invalid_request',
      when: 'Both X-Api-Key and Authorization were sent, or Authorization is not a Bearer key.',
    },
    {
      status: 401,
      code: 'not_found',
      when: 'The key is unknown, revoked or expired, or its merchant cannot use the API right now. All of these get the same answer on purpose.',
    },
    {
      status: 403,
      code: 'not_found',
      when: anonymousAllowed
        ? `A key was sent but it does not have ${scope}.`
        : `No key was sent, or the key does not have ${scope}.`,
    },
    {
      status: 429,
      code: 'rate_limited',
      when: 'Your token bucket is empty. Wait the number of seconds in the Retry-After header.',
    },
    {
      status: 503,
      code: 'internal_error',
      when: 'NexG could not check the key or the rate limit. Retry with backoff.',
    },
  ];
}

const QUERY_ERROR: ErrorDoc = {
  status: 400,
  code: 'invalid_request',
  when: 'A query parameter is not one this endpoint accepts, or fails validation. error.fields names it.',
};

/* ─────────────────────────────────────────────────────────────── the endpoints */

export const ENDPOINTS: EndpointDoc[] = [
  {
    slug: 'list-merchants',
    method: 'GET',
    host: 'api',
    path: '/v1/catalog/merchants',
    status: 'live',
    group: 'Catalogue',
    title: 'List merchants',
    summary: 'Live merchants on NexG, newest first, filtered by city, category or a search.',
    description: [
      'Returns merchants that are live on nexgapp.com: verified by NexG and published. Merchants still in onboarding, paused or delisted are never in this list.',
      'Results are sorted by when the merchant went live, newest first. Each merchant is the same object nexgapp.com reads, with the fields the public is allowed to see. Contact details, legal names and settlement accounts are never part of it.',
    ],
    auth: { kind: 'optional_key', scope: 'public_read' },
    rateCost: 1,
    cache: 'public, s-maxage=60, stale-while-revalidate=300',
    paginated: true,
    params: [
      ...AUTH_HEADERS,
      {
        name: 'city',
        in: 'query',
        type: 'string',
        required: false,
        description: 'A city slug, such as nairobi. Up to 64 characters.',
      },
      {
        name: 'category',
        in: 'query',
        type: 'string',
        required: false,
        description: 'A taxonomy vertical, such as restaurant or pharmacy. Up to 64 characters.',
      },
      {
        name: 'q',
        in: 'query',
        type: 'string',
        required: false,
        description:
          'Free text matched against the trading name, branch name and category_other, ignoring case. Up to 120 characters.',
      },
      CURSOR_PARAM,
      LIMIT_PARAM,
    ],
    example: { query: { city: 'nairobi', category: 'restaurant' } },
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: { items: [SOKONI], next_cursor: null },
      meta: { api_version: 'v1', limit: 25 },
    },
    responseResources: [
      { schema: 'PublicMerchant', title: 'Merchant', at: 'data.items[]', fields: MERCHANT_FIELDS },
    ],
    errors: [
      ...credentialErrors('public_read', true),
      QUERY_ERROR,
      { status: 500, code: 'internal_error', when: 'NexG could not read the merchants.' },
      UNEXPECTED_ERROR,
    ],
    since: '2026-10-21',
    source: 'apps/api/app/v1/catalog/merchants/route.ts',
  },
  {
    slug: 'get-merchant',
    method: 'GET',
    host: 'api',
    path: '/v1/catalog/merchants/{id}',
    status: 'live',
    group: 'Catalogue',
    title: 'Get a merchant and its catalogue',
    summary: 'One live merchant with every item it sells, in catalogue order.',
    description: [
      'Returns one live merchant and its catalogue. Items come in the merchant’s own order (by sort, then name), the same order its storefront on nexgapp.com uses.',
      'Age-restricted items are listed only when the merchant holds a verified licence for them, and their age_restricted flag is true so you can label them.',
    ],
    auth: { kind: 'optional_key', scope: 'public_read' },
    rateCost: 1,
    cache: 'public, s-maxage=60, stale-while-revalidate=300',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'uuid',
        required: true,
        description: 'The merchant’s id, from List merchants.',
      },
      ...AUTH_HEADERS,
    ],
    example: { path: { id: MERCHANT_ID } },
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        merchant: SOKONI,
        catalogue: [
          {
            id: '5d8e1f2a-3b4c-4d5e-8f6a-7b8c9d0e1f2a',
            merchant_id: MERCHANT_ID,
            section_id: '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
            name: 'Nyama choma platter',
            description: 'Half kilo of goat ribs, kachumbari, ugali',
            price_kes: 1450,
            available: true,
            age_restricted: false,
            highlighted: true,
            sort: 0,
          },
          {
            id: '6e9f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b',
            merchant_id: MERCHANT_ID,
            section_id: '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
            name: 'Grilled tilapia',
            description: 'Whole fish, lemon and chilli, sukuma wiki',
            price_kes: 1200,
            available: true,
            age_restricted: false,
            highlighted: true,
            sort: 1,
          },
        ],
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      { schema: 'PublicMerchant', title: 'Merchant', at: 'data.merchant', fields: MERCHANT_FIELDS },
      {
        schema: 'CatalogueItem',
        title: 'Catalogue item',
        at: 'data.catalogue[]',
        fields: CATALOGUE_ITEM_FIELDS,
      },
    ],
    errors: [
      ...credentialErrors('public_read', true),
      { status: 400, code: 'invalid_request', when: 'The id is not a UUID.' },
      { status: 404, code: 'not_found', when: 'No live merchant has that id.' },
      {
        status: 500,
        code: 'internal_error',
        when: 'NexG could not read the merchant or its catalogue.',
      },
      UNEXPECTED_ERROR,
    ],
    since: '2026-10-21',
    source: 'apps/api/app/v1/catalog/merchants/[id]/route.ts',
  },
  {
    slug: 'list-zones',
    method: 'GET',
    host: 'api',
    path: '/v1/zones',
    status: 'live',
    group: 'Zones',
    title: 'List delivery zones',
    summary: 'Every active delivery zone, with its bounding box and delivery times.',
    description: [
      'Returns the zones NexG delivers to, sorted by name. Each zone carries a bounding box, so you can tell whether a point is roughly inside it, and the delivery times guests are quoted there.',
      'The box is an approximation of the zone’s shape. Whether an exact address can be served is decided by NexG at checkout.',
    ],
    auth: { kind: 'optional_key', scope: 'public_read' },
    rateCost: 1,
    cache: 'public, s-maxage=300, stale-while-revalidate=3600',
    paginated: false,
    params: [...AUTH_HEADERS],
    example: {},
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        items: [
          {
            id: '7f1e2d3c-4b5a-4968-8776-655443322110',
            city_id: NAIROBI_ID,
            name: 'Kilimani',
            tier: 'core',
            eta_min: 20,
            eta_max: 30,
            cod_allowed: true,
            west: 36.765,
            south: -1.3,
            east: 36.8,
            north: -1.27,
          },
          {
            id: '8a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
            city_id: NAIROBI_ID,
            name: 'Westlands',
            tier: 'core',
            eta_min: 25,
            eta_max: 35,
            cod_allowed: true,
            west: 36.795,
            south: -1.275,
            east: 36.83,
            north: -1.245,
          },
        ],
        next_cursor: null,
      },
      meta: { api_version: 'v1', limit: 100 },
    },
    responseResources: [
      { schema: 'PublicZone', title: 'Zone', at: 'data.items[]', fields: ZONE_FIELDS },
    ],
    errors: [
      ...credentialErrors('public_read', true),
      { status: 500, code: 'internal_error', when: 'NexG could not read the zones.' },
      UNEXPECTED_ERROR,
    ],
    notes: ['Zones are a small set and change rarely, so the whole list comes in one response.'],
    since: '2026-10-21',
    source: 'apps/api/app/v1/zones/route.ts',
  },
  {
    slug: 'list-experiences',
    method: 'GET',
    host: 'api',
    path: '/v1/experiences',
    status: 'live',
    group: 'Experiences',
    title: 'List experiences',
    summary: 'Upcoming published events: music, sport, food and more, soonest first.',
    description: [
      'Returns events published on nexgapp.com that have not started yet, soonest first. Events in the past and drafts are never listed.',
      'Ticket prices are the organiser’s face value. NexG does not sell tickets or add a margin to them; it charges for the day it plans around an event.',
    ],
    auth: { kind: 'optional_key', scope: 'public_read' },
    rateCost: 1,
    cache: 'public, s-maxage=60, stale-while-revalidate=300',
    paginated: true,
    params: [
      ...AUTH_HEADERS,
      {
        name: 'city',
        in: 'query',
        type: 'string',
        required: false,
        description: 'A city slug, such as nairobi. A slug no city has returns an empty list.',
      },
      {
        name: 'q',
        in: 'query',
        type: 'string',
        required: false,
        description:
          'Free text matched against the event name and venue name, ignoring case. Up to 120 characters.',
      },
      CURSOR_PARAM,
      LIMIT_PARAM,
    ],
    example: { query: { city: 'nairobi' } },
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        items: [
          {
            id: '4c5d6e7f-8a9b-4c0d-9e1f-2a3b4c5d6e7f',
            city_id: NAIROBI_ID,
            name: 'RnB House',
            category: 'music',
            venue_name: 'Westlands rooftop',
            venue_address: 'Westlands, Nairobi',
            starts_at: '2026-11-22T18:00:00+00:00',
            ends_at: '2026-11-22T23:00:00+00:00',
            doors_at: '2026-11-22T17:30:00+00:00',
            cover_path: null,
            featured: true,
            anchor_slot: 'night',
            organiser_name: 'Example Events',
            organiser_url: null,
            ticket_url: null,
            ticket_bands: [
              { label: 'Regular', price_kes: 3500, currency: 'KES' },
              { label: 'VIP', price_kes: 8000, currency: 'KES' },
            ],
            nexg_can_hold_tickets: true,
            practical_note: 'Parking fills by 21:00. The driver drops at the door.',
            suggested_blocks: [
              {
                kind: 'meal',
                mood: 'taste',
                slot: 'evening',
                title: 'Dinner first',
                swap_group: 'evening_taste',
              },
            ],
          },
        ],
        next_cursor: null,
      },
      meta: { api_version: 'v1', limit: 25 },
    },
    responseResources: [
      { schema: 'PublicEvent', title: 'Experience', at: 'data.items[]', fields: EVENT_FIELDS },
    ],
    errors: [
      ...credentialErrors('public_read', true),
      QUERY_ERROR,
      { status: 500, code: 'internal_error', when: 'NexG could not read the events.' },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'Ticket bands are entered by hand. An event whose bands cannot be read is left out of the list, and logged for NexG to correct, rather than failing the whole list.',
    ],
    since: '2026-10-21',
    source: 'apps/api/app/v1/experiences/route.ts',
  },
  {
    slug: 'list-services',
    method: 'GET',
    host: 'api',
    path: '/v1/services',
    status: 'live',
    group: 'Services',
    title: 'List bookable services',
    summary: 'The service codes a merchant will be able to book through the API.',
    description: [
      'Returns the active services: airport and intercity transfers, couriers and venue bookings. Each has a stable code. A new kind of service is a new row here, not a new endpoint.',
      'The list is public because a developer needs to know what can be booked before they have a key. Booking itself (POST /v1/orders) is coming soon.',
    ],
    auth: { kind: 'optional_key', scope: 'public_read' },
    rateCost: 1,
    cache: 'public, s-maxage=300, stale-while-revalidate=3600',
    paginated: false,
    params: [...AUTH_HEADERS],
    example: {},
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        items: [
          {
            code: 'airport_transfer',
            label: 'Airport transfer',
            kind: 'ride',
            unit_label: 'passenger',
            active: true,
          },
          {
            code: 'courier',
            label: 'Courier',
            kind: 'courier',
            unit_label: 'parcel',
            active: true,
          },
          {
            code: 'intercity_transfer',
            label: 'Intercity transfer',
            kind: 'ride',
            unit_label: 'passenger',
            active: true,
          },
          {
            code: 'venue_booking',
            label: 'Venue booking',
            kind: 'booking',
            unit_label: 'booking',
            active: true,
          },
        ],
        next_cursor: null,
      },
      meta: { api_version: 'v1', limit: 100 },
    },
    responseResources: [
      { schema: 'ApiService', title: 'Service', at: 'data.items[]', fields: SERVICE_FIELDS },
    ],
    errors: [
      ...credentialErrors('public_read', true),
      { status: 500, code: 'internal_error', when: 'NexG could not read the services.' },
    ],
    since: '2026-10-21',
    source: 'apps/api/app/v1/services/route.ts',
  },
  {
    slug: 'list-orders',
    method: 'GET',
    host: 'api',
    path: '/v1/orders',
    status: 'live',
    group: 'Orders',
    title: 'List your orders',
    summary: 'Your merchant’s orders, newest first. The key decides which merchant.',
    description: [
      'Returns orders placed with the merchant your key is bound to, newest first: guest orders from nexgapp.com and, once booking ships, service bookings made through the API.',
      'You never send a merchant id. The key decides the merchant, so a key can never read another merchant’s orders. The stage is the one the merchant console shows, read from the order rather than worked out again.',
      'Poll this endpoint to keep your system in step with NexG. Each call costs 3 tokens; at the default 60 tokens a minute, polling once a minute leaves plenty of room for catalogue reads.',
    ],
    auth: { kind: 'key', scope: 'merchant_read', merchantBound: true },
    rateCost: 3,
    cache: 'no-store',
    paginated: true,
    params: [...KEY_REQUIRED_HEADERS, CURSOR_PARAM, LIMIT_PARAM],
    example: {},
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        items: [
          {
            order_id: '0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b',
            reference: 'NX-261110-0003',
            service: '',
            quantity: 3,
            stage: 'preparing',
            payment_method: 'mpesa_stk',
            payment_status: 'paid',
            currency: 'KES',
            total_cents: 161625,
            scheduled_for: null,
            pickup_label: null,
            dropoff_label: 'Rhapta Road, Westlands, Nairobi',
            created_at: '2026-11-10T09:42:17.204+00:00',
          },
        ],
        next_cursor: null,
      },
      meta: { api_version: 'v1', limit: 25 },
    },
    responseResources: [
      { schema: 'ApiOrder', title: 'Order', at: 'data.items[]', fields: ORDER_FIELDS },
    ],
    errors: [
      ...credentialErrors('merchant_read', false),
      QUERY_ERROR,
      {
        status: 403,
        code: 'not_found',
        when: 'NexG refused the read for this key, for example because it is not bound to a merchant.',
      },
      { status: 500, code: 'internal_error', when: 'NexG could not read the orders.' },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'The city, category and q parameters other list endpoints take are accepted here and ignored.',
      'Merchant keys work only while the merchant may operate: not while it is paused, suspended or delisted, and not while its application is waiting for approval.',
    ],
    since: '2026-10-22',
    source: 'apps/api/app/v1/orders/route.ts',
  },
  {
    slug: 'get-order',
    method: 'GET',
    host: 'api',
    path: '/v1/orders/{id}',
    status: 'live',
    group: 'Orders',
    title: 'Get one order',
    summary: 'One of your merchant’s orders, by its order_id.',
    description: [
      'Returns one order placed with the merchant your key is bound to. The order is the same object List your orders returns, so one parser reads both.',
      'An id that belongs to another merchant gets the same 404 as an id that does not exist, so a key cannot find out which order ids are real.',
    ],
    auth: { kind: 'key', scope: 'merchant_read', merchantBound: true },
    rateCost: 3,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'uuid',
        required: true,
        description: 'The order_id, from List your orders.',
      },
      ...KEY_REQUIRED_HEADERS,
    ],
    example: { path: { id: '0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b' } },
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        order: {
          order_id: '0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b',
          reference: 'NX-261110-0003',
          service: '',
          quantity: 3,
          stage: 'delivered',
          payment_method: 'mpesa_stk',
          payment_status: 'paid',
          currency: 'KES',
          total_cents: 161625,
          scheduled_for: null,
          pickup_label: null,
          dropoff_label: 'Rhapta Road, Westlands, Nairobi',
          created_at: '2026-11-10T09:42:17.204+00:00',
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      { schema: 'ApiOrder', title: 'Order', at: 'data.order', fields: ORDER_FIELDS },
    ],
    errors: [
      ...credentialErrors('merchant_read', false),
      { status: 400, code: 'invalid_request', when: 'The id is not a UUID.' },
      {
        status: 403,
        code: 'not_found',
        when: 'NexG refused the read for this key, for example because it is not bound to a merchant.',
      },
      {
        status: 404,
        code: 'not_found',
        when: 'Your merchant has no order with that id.',
      },
      { status: 500, code: 'internal_error', when: 'NexG could not read the order.' },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'Merchant keys work only while the merchant may operate: not while it is paused, suspended or delisted, and not while its application is waiting for approval.',
    ],
    since: '2026-11-10',
    source: 'apps/api/app/v1/orders/[id]/route.ts',
  },
  {
    slug: 'create-order',
    method: 'POST',
    host: 'api',
    path: '/v1/orders',
    status: 'live',
    group: 'Orders',
    title: 'Book a service',
    summary: 'A merchant books a transfer, courier or venue for its guests, priced by NexG.',
    description: [
      'For a business that books NexG services for its own guests: a hotel or tour company booking an airport transfer, for example. The booking becomes a real NexG order, charged to your merchant’s account.',
      'You say what and how many; NexG works out the price from its fee settings for your city, the same way checkout does. A request can never state a price. The total is frozen on the order when it is placed.',
      'Every booking needs an Idempotency-Key header. A retry with the same key gets the first answer back instead of booking twice, so a timeout is always safe to retry.',
      'The answer is 201 with the receipt as data.booking and a Location header. The booking then appears in GET /v1/orders, and GET /v1/orders/{id} reads it in full.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'X-Api-Key',
        in: 'header',
        type: 'string',
        required: true,
        description: 'A key bound to your merchant, with merchant_write.',
      },
      {
        name: 'Idempotency-Key',
        in: 'header',
        type: 'string',
        required: true,
        description:
          '16 to 128 characters, unique per booking. Reuse it only to retry the same booking.',
      },
      {
        name: 'Content-Type',
        in: 'header',
        type: 'string',
        required: true,
        description: 'application/json',
      },
    ],
    example: {
      headers: { 'Idempotency-Key': 'booking-2026-11-14-jkia-0001' },
      body: {
        service: 'airport_transfer',
        quantity: 2,
        pickup_label: 'JKIA Terminal 1A',
        pickup_lat: -1.3192,
        pickup_lng: 36.9278,
        dropoff_label: 'Woodvale Grove, Westlands, Nairobi',
        dropoff_lat: -1.2648,
        dropoff_lng: 36.8027,
        scheduled_for: '2026-11-14T06:30:00+03:00',
        passengers: [{ name: 'Amina Wekesa', phone: '+254700000101', flight: 'KQ 101' }],
        payment_method: 'on_account',
        note: 'Two large suitcases.',
      },
    },
    requestResources: [
      {
        schema: 'ServiceBooking',
        title: 'Booking request',
        at: 'body',
        fields: BOOKING_REQUEST_FIELDS,
      },
    ],
    responseStatus: '201 Created',
    responseExample: {
      ok: true,
      data: {
        booking: {
          order_id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
          reference: 'NX-261114-0012',
          service: 'airport_transfer',
          quantity: 2,
          total_cents: 450000,
          currency: 'KES',
          payment_method: 'on_account',
          scheduled_for: '2026-11-14T03:30:00+00:00',
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      {
        schema: 'BookingReceipt',
        title: 'Receipt',
        at: 'data.booking',
        fields: BOOKING_RECEIPT_FIELDS,
      },
    ],
    errors: [
      ...credentialErrors('merchant_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, or one outside 16 to 128 characters.',
      },
      {
        status: 400,
        code: 'invalid_request',
        when: 'The body is not JSON, has a field a booking does not take (a price, for one), or fails validation. error.fields names it.',
      },
      {
        status: 400,
        code: 'invalid_request',
        when: 'NexG cannot book it: the service is not one it offers, it is not priced in your city yet, a ride or courier has no pickup or drop-off point, or the time has passed. The message says which.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant, or the merchant is not live.',
      },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'Only on_account is accepted today: the booking is charged to your merchant’s account with NexG. Paying an API booking by M-Pesa or card is not available yet.',
      'There is no test mode yet. Every booking is a real order NexG will act on, so agree a test booking with NexG before building against it.',
      'A service can be booked in a city only once NexG has priced it there. Until then a booking is refused, and the message says so.',
      'Keys with merchant_write are not offered in the developer console yet. Ask NexG for one.',
      'Merchant keys work only while the merchant may operate: not while it is paused, suspended or delisted, and not while its application is waiting for approval.',
    ],
    since: '2026-11-14',
    source: 'apps/api/app/v1/orders/route.ts',
  },
  {
    slug: 'bank-webhook',
    method: 'POST',
    host: 'web',
    path: '/api/payments/bank/webhook',
    status: 'sandbox',
    group: 'Callbacks to NexG',
    title: 'Send a bank collection event',
    summary: 'A bank tells NexG a collection succeeded, failed, expired or was cancelled.',
    description: [
      'The URL NexG gives a bank as callback_url when it opens a collection. The bank posts every status change here, signed with the shared webhook secret. Only a verified event marks an order paid.',
      'Today it works with the NexG Sandbox Bank on test deployments. On the production site it answers 503 no_bank_configured until a real bank is connected.',
    ],
    auth: { kind: 'signature', header: 'X-Bank-Signature' },
    rateCost: null,
    cache: null,
    paginated: false,
    params: [
      {
        name: 'X-Bank-Signature',
        in: 'header',
        type: 'string',
        required: true,
        description:
          't=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">, signed with the webhook secret. Sign every attempt afresh.',
      },
      {
        name: 'X-Bank-Event-Id',
        in: 'header',
        type: 'string',
        required: false,
        description: 'The event id, repeated from the body for your logs.',
      },
      {
        name: 'Content-Type',
        in: 'header',
        type: 'string',
        required: true,
        description: 'application/json',
      },
    ],
    example: {},
    samples: [
      {
        language: 'curl',
        label: 'curl',
        code: `# Sign "<t>.<body>" with the shared secret, then send the same bytes.
body='{"id":"evt_Q1rM7kHf0b2vYp3n","type":"collection.succeeded","created_at":"2026-11-10T11:20:43.018Z","livemode":false,"data":{"id":"col_IwUUEAPrDf55OFD0","status":"succeeded","merchant_reference":"NXP-261110-7FD3EEA0C8","amount":161625,"currency":"KES","bank_reference":"SBXB2FACAB615"}}'
t=$(date +%s)
v1=$(printf '%s.%s' "$t" "$body" | openssl dgst -sha256 -hmac "$BANK_WEBHOOK_SECRET" | sed 's/^.* //')

curl -X POST "https://nexgapp.com/api/payments/bank/webhook" \\
  -H "Content-Type: application/json" \\
  -H "X-Bank-Signature: t=$t,v1=$v1" \\
  -H "X-Bank-Event-Id: evt_Q1rM7kHf0b2vYp3n" \\
  --data "$body"`,
      },
      {
        language: 'javascript',
        label: 'Node.js',
        code: `import { createHmac } from 'node:crypto';

export async function sendBankEvent(event, secret) {
  const body = JSON.stringify(event); // sign exactly the bytes you send
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(\`\${t}.\${body}\`).digest('hex');

  const res = await fetch('https://nexgapp.com/api/payments/bank/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bank-Signature': \`t=\${t},v1=\${v1}\`,
      'X-Bank-Event-Id': event.id,
    },
    body,
  });
  // 2xx: done, do not retry. 5xx: retry later, signing again.
  return res.status;
}`,
      },
      {
        language: 'python',
        label: 'Python',
        code: `import hashlib, hmac, json, time
import requests

def send_bank_event(event: dict, secret: str) -> int:
    body = json.dumps(event, separators=(",", ":"))  # sign exactly what you send
    t = str(int(time.time()))
    v1 = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    res = requests.post(
        "https://nexgapp.com/api/payments/bank/webhook",
        data=body.encode(),
        headers={
            "Content-Type": "application/json",
            "X-Bank-Signature": f"t={t},v1={v1}",
            "X-Bank-Event-Id": event["id"],
        },
        timeout=10,
    )
    # 2xx: done, do not retry. 5xx: retry later, signing again.
    return res.status_code`,
      },
    ],
    requestResources: [
      {
        title: 'Collection event',
        at: 'body',
        fields: [
          {
            name: 'id',
            type: 'string',
            description:
              'Unique per event, and the same on every retry. NexG records each id once.',
          },
          {
            name: 'type',
            type: 'string',
            description:
              'collection.succeeded, collection.failed, collection.expired, collection.cancelled or collection.processing.',
          },
          { name: 'created_at', type: 'timestamp', description: 'When the event happened.' },
          { name: 'livemode', type: 'boolean', description: 'false for a sandbox bank.' },
          {
            name: 'data.id',
            type: 'string',
            description: 'The bank’s collection id, as returned when NexG opened it.',
          },
          {
            name: 'data.status',
            type: 'string',
            description: 'succeeded, failed, expired, cancelled or processing.',
          },
          {
            name: 'data.merchant_reference',
            type: 'string',
            description: 'NexG’s payment reference, such as NXP-261110-7FD3EEA0C8.',
          },
          {
            name: 'data.amount',
            type: 'integer',
            description: 'In cents. Must equal the amount NexG asked for.',
          },
          { name: 'data.currency', type: 'string', description: 'Must be KES.' },
          {
            name: 'data.bank_reference',
            type: 'string',
            nullable: true,
            description: 'The bank’s own reference for the transfer, kept on the payment.',
          },
          {
            name: 'data.failure_reason',
            type: 'string',
            nullable: true,
            description: 'Why it failed, in words a guest can read.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: { ok: true, result: { ok: true, state: 'paid' } },
    responseResources: [],
    errors: [
      {
        status: 400,
        code: 'bad_signature',
        when: 'The signature did not verify, or t is more than five minutes from NexG’s clock. Do not resend the same bytes; sign again.',
      },
      {
        status: 500,
        code: 'not_recorded',
        when: 'NexG could not record the event right now. Retry with backoff, signing each attempt again.',
      },
      {
        status: 503,
        code: 'no_bank_configured',
        when: 'Bank payments are switched off on this deployment. Retry later.',
      },
    ],
    notes: [
      'A 200 means NexG is done with the event: handled, a duplicate, or permanently refused. Read result to see which, and do not retry any of them.',
      'result.duplicate is true for an event id NexG has already recorded. result.ignored is true for a status NexG does not act on (processing). result.reason explains a refusal: unknown_reference, collection_mismatch, currency_mismatch, invalid_amount, amount_mismatch, incomplete_event or unreadable.',
    ],
    since: '2026-11-10',
    source: 'apps/web/app/api/payments/bank/webhook/route.ts',
  },
  {
    slug: 'bank-webhook-check',
    method: 'GET',
    host: 'web',
    path: '/api/payments/bank/webhook',
    status: 'live',
    group: 'Callbacks to NexG',
    title: 'Check the bank webhook',
    summary: 'Confirms the webhook URL is reachable and whether a bank is configured.',
    description: [
      'A quick check a bank (or a person) can run before sending events. It needs no signature and changes nothing.',
    ],
    auth: { kind: 'none' },
    rateCost: null,
    cache: null,
    paginated: false,
    params: [],
    example: {},
    responseStatus: '200 OK',
    responseExample: { ok: true, endpoint: 'bank webhook', configured: false },
    responseResources: [],
    errors: [],
    notes: ['configured is false on the production site until a real bank is connected.'],
    since: '2026-11-10',
    source: 'apps/web/app/api/payments/bank/webhook/route.ts',
  },
];

export function endpointBySlug(slug: string): EndpointDoc | undefined {
  return ENDPOINTS.find((endpoint) => endpoint.slug === slug);
}

export const ENDPOINT_GROUPS = [
  'Catalogue',
  'Zones',
  'Experiences',
  'Services',
  'Orders',
  'Callbacks to NexG',
] as const;

export function endpointsInGroup(group: (typeof ENDPOINT_GROUPS)[number]): EndpointDoc[] {
  return ENDPOINTS.filter((endpoint) => endpoint.group === group);
}

/** The full URL a caller writes, with `{param}` placeholders left in. */
export function endpointUrl(endpoint: Pick<EndpointDoc, 'host' | 'path'>): string {
  return `${HOSTS[endpoint.host]}${endpoint.path}`;
}
