import {
  BRANCH_FIELDS,
  BOOKING_RECEIPT_FIELDS,
  BOOKING_REQUEST_FIELDS,
  CATALOGUE_ITEM_FIELDS,
  DELIVERY_CHECK_FIELDS,
  DELIVERY_CHECK_REQUEST_FIELDS,
  DELIVERY_DROPOFF_FIELDS,
  DELIVERY_PICKUP_FIELDS,
  EVENT_FIELDS,
  MERCHANT_FIELDS,
  ORDER_FIELDS,
  CLOSURE_FIELDS,
  DEPARTURE_FIELDS,
  OFFERING_FIELDS,
  RESERVATION_DRIVER_FIELDS,
  RESERVATION_FIELDS,
  RESERVATION_OFFERING_FIELDS,
  RESERVATION_TRIP_FIELDS,
  RESOURCE_FIELDS,
  RIDER_FIELDS,
  RIDER_LOCATION_FIELDS,
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
  pay_on_delivery_enabled: false,
  pay_on_delivery_cap_kes: null,
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

/* ───────────────────────────────────────── reservations and the booking setup */

function keyHeader(scope: string, test: string): ParamDoc {
  return {
    name: 'X-Api-Key',
    in: 'header',
    type: 'string',
    required: true,
    description: `A key bound to your merchant, with ${scope}. ${test}`,
  };
}

const CHANGE_KEY: ParamDoc = {
  name: 'Idempotency-Key',
  in: 'header',
  type: 'string',
  required: true,
  description: '16 to 128 characters, new for each change. Reuse it only to retry the same change.',
};

const EXPECTED_VERSION_FIELD = {
  name: 'expected_version',
  type: 'integer',
  description:
    'The version you read. If it changed since, the answer is 409 conflict and nothing changes: read it again.',
};

/** Shown until the booking engine is connected to the API. */
const ENGINE_WARNING =
  'Being switched on: until NexG connects the booking engine, this answers 503.';
const ENGINE_ISSUES = [
  'Until NexG connects the API to its booking engine, these calls answer 503 internal_error: with a live key, and for offerings and resources with a test key too. Test reservations already work. The changelog says when it is on.',
];

const ENGINE_ERRORS: ErrorDoc[] = [
  {
    status: 409,
    code: 'conflict',
    when: 'The version you sent is not the current one, or the booking engine refused the change. The message says why.',
  },
  {
    status: 503,
    code: 'internal_error',
    when: 'The booking engine did not answer. Retry with the same Idempotency-Key.',
  },
  UNEXPECTED_ERROR,
];

const SAMPLE_RESERVATION = {
  id: '01a21c69-35e2-710e-98e3-6a142af6ded1',
  kind: 'reservation' as const,
  status: 'confirmed' as const,
  stage: 'confirmed',
  offering: {
    id: '01a21c60-1b2c-7d3e-8f40-5a6b7c8d9e0f',
    name: 'JKIA to Westlands',
    model: 'TRANSFER',
  },
  starts_at: '2026-11-28T03:30:00.000Z',
  ends_at: '2026-11-28T04:30:00.000Z',
  quantity: 3,
  payment_state: 'paid',
  version: 3,
  updated_at: '2026-11-27T18:20:31.004Z',
  occurrence_id: null,
  resource_ids: ['01a21c5e-7f80-7a91-b2c3-d4e5f6a7b8c9'],
  ticket_type: null,
  capacity_unit: 'place',
  guest_name: 'Amina',
  trip: {
    pickup_area: 'JKIA',
    pickup_address: 'Terminal 1A arrivals',
    dropoff_area: 'Westlands',
    dropoff_address: 'Woodvale Grove, Westlands, Nairobi',
    flight_number: 'KQ 101' as string | null,
  },
  service_location: null,
  notes: 'Two large suitcases.',
  currency: 'KES' as const,
  total_cents: 450000,
  paid_cents: 450000,
  checked_in_at: null,
  booked_on: 'nexg' as const,
  created_at: '2026-11-27T09:02:44.903Z',
  driver: {
    first_name: 'Juma',
    vehicle: 'White Toyota Noah',
    plate: 'KDA 123A',
    assigned_at: '2026-11-27T18:20:31.004Z',
    location: { latitude: -1.319167, longitude: 36.927778, at: '2026-11-28T03:24:10.000Z' },
  },
  refund_state: null as string | null,
};

const RESERVATION_RESOURCES = [
  {
    schema: 'ApiReservation' as const,
    title: 'Reservation',
    at: 'data.reservation',
    fields: RESERVATION_FIELDS,
  },
  {
    schema: 'ApiReservationDriver' as const,
    title: 'Driver',
    at: 'data.reservation.driver',
    fields: RESERVATION_DRIVER_FIELDS,
  },
];

const SAMPLE_OFFERING = {
  id: '01a21c60-1b2c-7d3e-8f40-5a6b7c8d9e0f',
  name: 'JKIA to Westlands',
  model: 'TRANSFER',
  active: true,
  booking_enabled: true,
  currency: 'KES' as const,
  price_cents: 450000,
  pricing_basis: 'per_booking',
  duration_minutes: 60,
  capacity: null,
  capacity_unit: 'place',
  resource_ids: ['01a21c5e-7f80-7a91-b2c3-d4e5f6a7b8c9'],
  version: 4,
  departures: [],
};

const SAMPLE_TOUR = {
  id: '01a21c61-2c3d-7e4f-9a50-6b7c8d9e0f1a',
  name: 'Nairobi National Park morning game drive',
  model: 'SESSION_CAPACITY',
  active: true,
  booking_enabled: true,
  currency: 'KES' as const,
  price_cents: 650000,
  pricing_basis: 'per_quantity',
  duration_minutes: 240,
  capacity: 7,
  capacity_unit: 'place',
  resource_ids: ['01a21c5f-8091-7ba2-c3d4-e5f6a7b8c9d0'],
  version: 2,
  departures: [
    {
      id: '01a21c70-3d4e-7f50-8a61-7c8d9e0f1a2b',
      starts_at: '2026-11-29T03:30:00.000Z',
      ends_at: '2026-11-29T07:30:00.000Z',
      capacity: 7,
      published: true,
      resource_ids: ['01a21c5f-8091-7ba2-c3d4-e5f6a7b8c9d0'],
      version: 1,
    },
  ],
};

const OFFERING_RESOURCES = (at: string) => [
  { schema: 'ApiOffering' as const, title: 'Offering', at, fields: OFFERING_FIELDS },
  {
    schema: 'ApiDeparture' as const,
    title: 'Departure',
    at: `${at}.departures[]`,
    fields: DEPARTURE_FIELDS,
  },
];

const SAMPLE_RESOURCE = {
  id: '01a21c5e-7f80-7a91-b2c3-d4e5f6a7b8c9',
  name: 'Van one (KDA 123A)',
  kind: 'vehicle',
  quantity: 1,
  active: true,
  schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '04:00', end: '23:00' },
  closures: [
    {
      id: '6f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4c',
      starts_at: '2026-11-30T05:00:00.000Z',
      ends_at: '2026-11-30T09:00:00.000Z',
      reason: 'Booked on our own website',
    },
  ],
  version: 6,
};

const RESOURCE_RESOURCES = (at: string) => [
  { schema: 'ApiResource' as const, title: 'Resource', at, fields: RESOURCE_FIELDS },
  {
    schema: 'ApiClosure' as const,
    title: 'Closure',
    at: `${at}.closures[]`,
    fields: CLOSURE_FIELDS,
  },
];

/** The answer's applied flag: a test key's change to the setup is a dry run. */
const SETUP_APPLIED = {
  title: 'Saved',
  at: 'data',
  fields: [
    {
      name: 'applied',
      type: 'boolean',
      description:
        'true when the change was saved, with a live key. false with a test key: the answer shows the change as it would be, and nothing was saved.',
    },
  ],
};
const SETUP_TEST_KEY =
  'A test key (nexg_test_…) tries the change on your real setup and saves nothing.';
const SETUP_DRY_RUN =
  'With a test key it is a dry run: every rule is checked against your real setup and the answer shows the change as it would be, with applied false, but nothing is saved and no event is sent.';

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
    summary: 'One live merchant, every open branch, and every item it sells, in catalogue order.',
    description: [
      'Returns one live merchant, its open branches and its catalogue. Items come in the merchant’s own order (by sort, then name), the same order its storefront on nexgapp.com uses.',
      'branches lists every open branch, the primary one first, with today’s hours. The merchant’s own branch_ fields describe the primary branch only.',
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
        branches: [
          {
            id: '0f1e2d3c-4b5a-4968-8776-655443322110',
            name: 'Westlands',
            address: 'Woodvale Grove, Westlands, Nairobi',
            latitude: -1.2648,
            longitude: 36.8027,
            is_primary: true,
            place_type: 'physical',
            contact: '+254700000201',
            paused: false,
            opens_today: '08:00:00',
            closes_today: '22:00:00',
            closed_today: false,
          },
          {
            id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e',
            name: 'Kilimani',
            address: 'Argwings Kodhek Road, Kilimani, Nairobi',
            latitude: -1.2921,
            longitude: 36.7836,
            is_primary: false,
            place_type: 'physical',
            contact: null,
            paused: false,
            opens_today: '10:00:00',
            closes_today: '21:00:00',
            closed_today: false,
          },
        ],
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
      { schema: 'PublicBranch', title: 'Branch', at: 'data.branches[]', fields: BRANCH_FIELDS },
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
        when: 'NexG could not read the merchant, its branches or its catalogue.',
      },
      UNEXPECTED_ERROR,
    ],
    since: '2026-10-21',
    source: 'apps/api/app/v1/catalog/merchants/[id]/route.ts',
  },
  {
    slug: 'list-catalogue-items',
    method: 'GET',
    host: 'api',
    path: '/v1/catalog/items',
    status: 'live',
    group: 'Catalogue',
    title: 'List your catalogue items',
    summary:
      'Every item your merchant sells, sold-out ones included. The key decides the merchant.',
    description: [
      'Returns every catalogue item of the merchant your key is bound to, in menu order: by section, then each item’s sort, then name. Unlike Get a merchant and its catalogue, it includes items that are sold out (available false), so your system can find them again to put them back on sale.',
      'Each item is the same object the public catalogue returns, so one parser reads both. Use the ids with Update a catalogue item. The whole catalogue comes back in one answer, without paging.',
    ],
    auth: { kind: 'key', scope: 'catalogue_write', merchantBound: true },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'X-Api-Key',
        in: 'header',
        type: 'string',
        required: true,
        description:
          'A key bound to your merchant, with catalogue_write or merchant_read. Or send it as Authorization: Bearer <key>.',
      },
    ],
    example: {},
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        items: [
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
            available: false,
            age_restricted: false,
            highlighted: true,
            sort: 1,
          },
        ],
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      {
        schema: 'CatalogueItem',
        title: 'Catalogue item',
        at: 'data.items[]',
        fields: CATALOGUE_ITEM_FIELDS,
      },
    ],
    errors: [
      ...credentialErrors('catalogue_write or merchant_read', false),
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 500, code: 'internal_error', when: 'NexG could not read the catalogue.' },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'A key with catalogue_write spends one token; a key with only merchant_read spends three, as an order read does.',
      'An item the merchant has not priced yet has price_kes null.',
      'Merchant keys work only while the merchant may operate: not while it is paused, suspended or delisted, and not while its application is waiting for approval.',
    ],
    since: '2026-11-17',
    source: 'apps/api/app/v1/catalog/items/route.ts',
  },
  {
    slug: 'update-catalogue-item',
    method: 'PATCH',
    host: 'api',
    path: '/v1/catalog/items/{id}',
    status: 'live',
    group: 'Catalogue',
    title: 'Update a catalogue item',
    summary: 'Change an item’s price or availability, from your till or ERP.',
    description: [
      'Changes one of your merchant’s catalogue items: its price (price_kes), whether it is on sale (available), or both in one call. Send only what changes. This is how your own till or ERP keeps NexG in step.',
      'With a live key the change is saved at once and applies to the next order, because checkout always reads the current price. NexG keeps a record of each change and the key that made it. The public catalogue may show the old values for a few minutes, because its answers are cached.',
      'With a test key nothing is saved: the answer shows the item as the change would leave it, with applied false, so you can build without touching real prices.',
    ],
    auth: { kind: 'key', scope: 'catalogue_write', merchantBound: true },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'uuid',
        required: true,
        description: 'The item’s id, from List your catalogue items.',
      },
      {
        name: 'X-Api-Key',
        in: 'header',
        type: 'string',
        required: true,
        description:
          'A key bound to your merchant, with catalogue_write. A test key (nexg_test_…) changes nothing.',
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
      path: { id: '6e9f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b' },
      body: { price_kes: 1250, available: false },
    },
    requestResources: [
      {
        title: 'Change',
        at: 'body',
        fields: [
          {
            name: 'price_kes',
            type: 'integer',
            description: 'The new price, in whole shillings from 1 to 1,000,000. Optional.',
          },
          {
            name: 'available',
            type: 'boolean',
            description:
              'false while the item is sold out, true when it is back on sale. Optional.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        item: {
          id: '6e9f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b',
          merchant_id: MERCHANT_ID,
          section_id: '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
          name: 'Grilled tilapia',
          description: 'Whole fish, lemon and chilli, sukuma wiki',
          price_kes: 1250,
          available: false,
          age_restricted: false,
          highlighted: true,
          sort: 1,
        },
        applied: true,
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      {
        schema: 'CatalogueItem',
        title: 'Catalogue item',
        at: 'data.item',
        fields: CATALOGUE_ITEM_FIELDS,
      },
      {
        title: 'Saved',
        at: 'data',
        fields: [
          {
            name: 'applied',
            type: 'boolean',
            description:
              'true when the change was saved, with a live key. false with a test key, which saves nothing.',
          },
        ],
      },
    ],
    errors: [
      ...credentialErrors('catalogue_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'The id is not a UUID, or the body is not JSON with price_kes, available or both. error.fields names the field.',
      },
      {
        status: 400,
        code: 'invalid_request',
        when: 'A price that is not whole shillings from 1 to 1,000,000, an available that is not true or false, or any other field. The message says which.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      {
        status: 404,
        code: 'not_found',
        when: 'Your merchant has no item with that id.',
      },
      { status: 500, code: 'internal_error', when: 'NexG could not update the item.' },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'catalogue_write is a scope of its own: an owner can put it on a live key in the developer console. It cannot book services or read orders.',
      'Names, descriptions, photos, sections and new items are changed in the merchant console or by CSV import, not through the API yet.',
      'Merchant keys work only while the merchant may operate: not while it is paused, suspended or delisted, and not while its application is waiting for approval.',
    ],
    since: '2026-11-17',
    source: 'apps/api/app/v1/catalog/items/[id]/route.ts',
  },
  {
    slug: 'update-catalogue-items',
    method: 'PATCH',
    host: 'api',
    path: '/v1/catalog/items',
    status: 'live',
    group: 'Catalogue',
    title: 'Update many catalogue items',
    summary: 'Change the price or availability of up to 100 items in one call.',
    description: [
      'Changes up to 100 of your merchant’s catalogue items in one call: each one’s price (price_kes), whether it is on sale (available), or both. Name each item by its id and send only what changes. This is how a till or ERP keeps a whole price list in step without one call per item.',
      'It is all or nothing. If any item is refused (an id your merchant does not have, an item listed twice, or a change that breaks the rules), nothing in the call is saved. Ids your merchant does not have come back together, each named by its place in the list, so you can drop them and send the rest again.',
      'Each change follows the same rules as Update a catalogue item. With a live key the changes are saved at once and apply to the next order, and NexG keeps a record of each one and the key that made it. With a test key nothing is saved: the answer shows the items as the changes would leave them, with applied false.',
    ],
    auth: { kind: 'key', scope: 'catalogue_write', merchantBound: true },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'X-Api-Key',
        in: 'header',
        type: 'string',
        required: true,
        description:
          'A key bound to your merchant, with catalogue_write. A test key (nexg_test_…) changes nothing.',
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
      body: {
        items: [
          { id: '6e9f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b', price_kes: 1250 },
          { id: '7f0a3b4c-5d6e-4f70-8b9c-0d1e2f3a4b5c', available: false },
        ],
      },
    },
    requestResources: [
      {
        title: 'Changes',
        at: 'body',
        fields: [
          {
            name: 'items',
            type: 'array',
            description: 'From 1 to 100 changes, each item once. See Change.',
          },
        ],
      },
      {
        title: 'Change',
        at: 'body.items[]',
        fields: [
          {
            name: 'id',
            type: 'uuid',
            description: 'The item’s id, from List your catalogue items.',
          },
          {
            name: 'price_kes',
            type: 'integer',
            description: 'The new price, in whole shillings from 1 to 1,000,000. Optional.',
          },
          {
            name: 'available',
            type: 'boolean',
            description:
              'false while the item is sold out, true when it is back on sale. Optional, but send price_kes, available or both.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        items: [
          {
            id: '6e9f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b',
            merchant_id: MERCHANT_ID,
            section_id: '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
            name: 'Grilled tilapia',
            description: 'Whole fish, lemon and chilli, sukuma wiki',
            price_kes: 1250,
            available: true,
            age_restricted: false,
            highlighted: true,
            sort: 1,
          },
          {
            id: '7f0a3b4c-5d6e-4f70-8b9c-0d1e2f3a4b5c',
            merchant_id: MERCHANT_ID,
            section_id: '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
            name: 'Nyama choma platter',
            description: 'Goat ribs, kachumbari, ugali',
            price_kes: 1800,
            available: false,
            age_restricted: false,
            highlighted: false,
            sort: 2,
          },
        ],
        applied: true,
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      {
        schema: 'CatalogueItem',
        title: 'Catalogue item',
        at: 'data.items[]',
        fields: CATALOGUE_ITEM_FIELDS,
      },
      {
        title: 'Saved',
        at: 'data',
        fields: [
          {
            name: 'applied',
            type: 'boolean',
            description:
              'true when the changes were saved, with a live key. false with a test key, which saves nothing.',
          },
        ],
      },
    ],
    errors: [
      ...credentialErrors('catalogue_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'The body is not JSON with items, the list is empty or longer than 100, an item is listed twice, or an item has no id, no change, a price that is not whole shillings from 1 to 1,000,000, an available that is not true or false, or another field. error.fields names each one, as items.3.price_kes.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      {
        status: 404,
        code: 'not_found',
        when: 'Your merchant has no item with one or more of the ids. error.fields names each, as items.3.id. Nothing was changed.',
      },
      { status: 500, code: 'internal_error', when: 'NexG could not update the items.' },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'One call costs one token, however many items it carries.',
      'The answer lists the items in the order you sent them, each with the public catalogue’s fields, as Update a catalogue item answers one.',
      'Sending a value an item already has changes nothing and records nothing, so you can send a whole price list each time.',
    ],
    since: '2026-11-18',
    source: 'apps/api/app/v1/catalog/items/route.ts',
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
            cod_allowed: false,
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
            cod_allowed: false,
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
    slug: 'check-delivery',
    method: 'POST',
    host: 'api',
    path: '/v1/delivery/check',
    status: 'live',
    group: 'Zones',
    title: 'Check a delivery',
    summary:
      'Whether NexG can deliver between two points, how long it usually takes and what it costs.',
    description: [
      'Send a pickup and a drop-off. The answer says whether NexG can take the trip now. When it can, you get the drop-off zone’s usual delivery time and the delivery fee from NexG’s rate card. When it cannot, deliverable is false and reason says why: the pickup or the drop-off is outside the areas NexG serves, the trip is longer than NexG goes in that city, or deliveries into the drop-off zone are paused.',
      'NexG answers with the rules its own checkout uses. Distances are in a straight line. The fee is a base fee covering the first kilometre plus a per-kilometre rate for each further kilometre begun, both set per city.',
      'The check reserves nothing and is not binding: a zone can be paused at any minute, and an order is priced when it is placed. A courier booked through Book a service for the same pickup and drop-off costs exactly this fee; a transfer is priced per passenger instead.',
    ],
    auth: { kind: 'optional_key', scope: 'public_read' },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [
      ...AUTH_HEADERS,
      {
        name: 'Content-Type',
        in: 'header',
        type: 'string',
        required: true,
        description: 'application/json',
      },
    ],
    example: {
      body: {
        pickup_lat: -1.2648,
        pickup_lng: 36.8027,
        dropoff_lat: -1.2921,
        dropoff_lng: 36.7865,
      },
    },
    requestResources: [
      {
        schema: 'DeliveryCheckRequest',
        title: 'Trip',
        at: 'body',
        fields: DELIVERY_CHECK_REQUEST_FIELDS,
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        deliverable: true,
        reason: null,
        message: null,
        city_slug: 'nairobi',
        city_name: 'Nairobi',
        pickup: {
          served: true,
          zone_id: '8a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
          zone_name: 'Westlands',
        },
        dropoff: {
          served: true,
          zone_id: '7f1e2d3c-4b5a-4968-8776-655443322110',
          zone_name: 'Kilimani',
          paused: false,
        },
        distance_km: 3.5,
        max_distance_km: 15,
        eta_min: 20,
        eta_max: 30,
        delivery_fee_cents: 15500,
        currency: 'KES',
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      {
        schema: 'DeliveryCheck',
        title: 'Delivery check',
        at: 'data',
        fields: DELIVERY_CHECK_FIELDS,
      },
      {
        schema: 'DeliveryPickup',
        title: 'Pickup',
        at: 'data.pickup',
        fields: DELIVERY_PICKUP_FIELDS,
      },
      {
        schema: 'DeliveryDropoff',
        title: 'Drop-off',
        at: 'data.dropoff',
        fields: DELIVERY_DROPOFF_FIELDS,
      },
    ],
    errors: [
      ...credentialErrors('public_read', true),
      {
        status: 400,
        code: 'invalid_request',
        when: 'The body is not JSON, a coordinate is missing or out of range (latitudes -90 to 90, longitudes -180 to 180), or it has another field. error.fields names it.',
      },
      { status: 500, code: 'internal_error', when: 'NexG could not check the trip.' },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'A trip NexG cannot take still answers 200 OK: deliverable is false, with a reason and a message a person can read.',
      'The body has the same four fields Book a service takes for a ride or courier, so you can check a trip and then book it with the same values.',
      'It is a POST so that a customer’s address stays out of URLs and the logs that keep them. It changes nothing, and its answer is never cached.',
    ],
    since: '2026-11-18',
    source: 'apps/api/app/v1/delivery/check/route.ts',
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
      'Returns orders placed with the merchant your key is bound to, newest first: guest orders from nexgapp.com and service bookings made through the API. With a test key it returns your test bookings instead, never real orders.',
      'You never send a merchant id. The key decides the merchant, so a key can never read another merchant’s orders. The stage is the one the merchant console shows, read from the order rather than worked out again.',
      'To keep your system in step with NexG, add an order events endpoint and NexG posts each new booking and status change to you. Poll this endpoint as a backstop: each call costs 3 tokens; at the default 60 tokens a minute, polling once a minute leaves plenty of room for catalogue reads.',
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
            order_id: '5d4c3b2a-1908-4f7e-a6d5-c4b3a2918070',
            reference: 'NX-261110-0007',
            service: 'courier',
            quantity: 1,
            status: 'in_progress',
            stage: 'picked_up',
            payment_method: 'on_account',
            payment_status: 'pending',
            currency: 'KES',
            total_cents: 30500,
            scheduled_for: null,
            pickup_label: 'Sarit Centre, Westlands',
            dropoff_label: 'Ngong Road, Kilimani, Nairobi',
            created_at: '2026-11-10T10:05:51.630+00:00',
            rider: {
              first_name: 'Juma',
              vehicle: 'motorbike',
              plate: 'KMEA 123A',
              assigned_at: '2026-11-10T10:09:12.014+00:00',
              location: {
                latitude: -1.284731,
                longitude: 36.802114,
                at: '2026-11-10T10:21:40.552+00:00',
              },
            },
          },
          {
            order_id: '0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b',
            reference: 'NX-261110-0003',
            service: '',
            quantity: 3,
            status: 'confirmed',
            stage: 'preparing',
            payment_method: 'mpesa_stk',
            payment_status: 'paid',
            currency: 'KES',
            total_cents: 161625,
            scheduled_for: null,
            pickup_label: null,
            dropoff_label: 'Rhapta Road, Westlands, Nairobi',
            created_at: '2026-11-10T09:42:17.204+00:00',
            rider: null,
          },
        ],
        next_cursor: null,
      },
      meta: { api_version: 'v1', limit: 25 },
    },
    responseResources: [
      { schema: 'ApiOrder', title: 'Order', at: 'data.items[]', fields: ORDER_FIELDS },
      { schema: 'ApiBookingRider', title: 'Rider', at: 'data.items[].rider', fields: RIDER_FIELDS },
      {
        schema: 'ApiBookingRiderLocation',
        title: 'Rider location',
        at: 'data.items[].rider.location',
        fields: RIDER_LOCATION_FIELDS,
      },
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
          status: 'completed',
          stage: 'delivered',
          payment_method: 'mpesa_stk',
          payment_status: 'paid',
          currency: 'KES',
          total_cents: 161625,
          scheduled_for: null,
          pickup_label: null,
          dropoff_label: 'Rhapta Road, Westlands, Nairobi',
          created_at: '2026-11-10T09:42:17.204+00:00',
          rider: {
            first_name: 'Juma',
            vehicle: 'motorbike',
            plate: 'KMEA 123A',
            assigned_at: '2026-11-10T09:58:40.310+00:00',
            location: null,
          },
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      { schema: 'ApiOrder', title: 'Order', at: 'data.order', fields: ORDER_FIELDS },
      { schema: 'ApiBookingRider', title: 'Rider', at: 'data.order.rider', fields: RIDER_FIELDS },
      {
        schema: 'ApiBookingRiderLocation',
        title: 'Rider location',
        at: 'data.order.rider.location',
        fields: RIDER_LOCATION_FIELDS,
      },
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
    slug: 'cancel-order',
    method: 'POST',
    host: 'api',
    path: '/v1/orders/{id}/cancel',
    status: 'live',
    group: 'Orders',
    title: 'Cancel a booking',
    summary: 'Cancel one of your API bookings, free of charge, until a rider is assigned.',
    description: [
      'Cancels a booking your merchant made through the API, at no cost, as long as no rider has taken it. NexG cancels the dispatch job, records who cancelled and why, and sends booking.status_changed to your endpoints.',
      'Once a rider is assigned, the booking is under way or it has been paid, the answer is 409 conflict and nothing changes: the rider is already on the way, so NexG support handles the cancellation.',
      'Cancelling a booking that is already cancelled answers 200 with cancelled false, so a retry is safe. With a test key it cancels a sandbox booking, under the same rule: not once a test rider is assigned.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'uuid',
        required: true,
        description: 'The order_id, from Book a service or List your orders.',
      },
      {
        name: 'X-Api-Key',
        in: 'header',
        type: 'string',
        required: true,
        description:
          'A key bound to your merchant, with merchant_write. A test key (nexg_test_…) cancels sandbox bookings.',
      },
      {
        name: 'Content-Type',
        in: 'header',
        type: 'string',
        required: false,
        description: 'application/json, when you send a reason.',
      },
    ],
    example: {
      path: { id: '0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b' },
      body: { reason: 'The guest changed their flight.' },
    },
    requestResources: [
      {
        title: 'Cancellation',
        at: 'body',
        fields: [
          {
            name: 'reason',
            type: 'string',
            description:
              'Why, in up to 500 characters. Optional: the body itself is optional. It is kept with the order.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        order: {
          order_id: '0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b',
          reference: 'NX-261123-0007',
          service: 'airport_transfer',
          quantity: 2,
          status: 'cancelled',
          stage: 'cancelled',
          payment_method: 'on_account',
          payment_status: 'pending',
          currency: 'KES',
          total_cents: 450000,
          scheduled_for: '2026-11-24T06:30:00+03:00',
          pickup_label: 'JKIA Terminal 1A',
          dropoff_label: 'Woodvale Grove, Westlands, Nairobi',
          created_at: '2026-11-23T09:12:40.118+00:00',
          rider: null,
        },
        cancelled: true,
        previous_status: 'requested',
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      { schema: 'ApiOrder', title: 'Order', at: 'data.order', fields: ORDER_FIELDS },
      {
        title: 'Cancellation',
        at: 'data',
        fields: [
          {
            name: 'cancelled',
            type: 'boolean',
            description:
              'true when this call cancelled the booking; false when it was already cancelled.',
          },
          {
            name: 'previous_status',
            type: 'string',
            description: 'The status the booking had before this call.',
          },
        ],
      },
    ],
    errors: [
      ...credentialErrors('merchant_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'The id is not a UUID, or the body is not empty or JSON with a reason of up to 500 characters.',
      },
      { status: 403, code: 'not_found', when: 'The key is not bound to a merchant.' },
      {
        status: 404,
        code: 'not_found',
        when: 'Your merchant made no API booking with that id. Orders from the website and other merchants’ bookings answer the same.',
      },
      {
        status: 409,
        code: 'conflict',
        when: 'A rider has taken the booking, it is under way or completed, or it has been paid. The message says which; NexG support handles it from there.',
      },
      { status: 500, code: 'internal_error', when: 'NexG could not cancel the booking.' },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'Only bookings made through the API can be cancelled here. A customer’s order from the website or the app is the customer’s to cancel.',
      'Cancelling costs nothing before a rider is assigned, and nothing is charged to your account.',
    ],
    since: '2026-11-23',
    source: 'apps/api/app/v1/orders/[id]/cancel/route.ts',
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
      'For a business that books NexG services for its own guests: a hotel or tour company booking an airport transfer, for example. With a live key the booking becomes a real NexG order, charged to your merchant’s account. Live bookings need NexG’s approval first, with a monthly limit: until then a live booking is refused with 403, and a test key books in the sandbox.',
      'With a test key it is a sandbox booking: same checks, a TEST- reference, and nothing dispatched or charged. A service NexG has not priced in your city yet gets a sample price of KES 1,000 a unit, so you can build before prices are set. See Environments.',
      'You say what and how many; NexG works out the price. A courier is priced per kilometre by the delivery check (POST /v1/delivery/check), once per trip: the fee the check quotes for the same pickup and drop-off is exactly what you pay, and a trip the check refuses cannot be booked. A transfer is charged per passenger and a venue booking once whatever the quantity, from NexG’s fee settings for your city. A request can never state a price. The total is frozen on the order when it is placed.',
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
        description:
          'A key bound to your merchant, with merchant_write. A test key (nexg_test_…) books in the sandbox.',
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
        when: 'NexG cannot book it: the service is not one it offers, it is not priced in your city yet, a ride or courier has no pickup or drop-off point, the time has passed, or the delivery check refuses the courier trip (outside the areas NexG serves, too long, or the drop-off zone paused). The message says which.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant, the merchant is not live, or NexG has not switched on live API bookings for it.',
      },
      {
        status: 409,
        code: 'conflict',
        when: 'The booking would take this calendar month’s live API bookings (Nairobi time, cancelled ones aside) over your merchant’s monthly limit. The message gives the figures; ask NexG to raise it.',
      },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'Only on_account is accepted today: the booking is charged to your merchant’s account with NexG. Paying an API booking by M-Pesa or card is not available yet.',
      'Build against it with a test key (nexg_test_…). A test booking is recorded in the sandbox with a TEST- reference and never becomes an order; a booking with a live key is a real order NexG will act on.',
      'With a live key, a service can be booked in a city only once NexG has priced it there. Until then a booking is refused, and the message says so. A test key gets a sample price instead.',
      'The developer console offers merchant_write on test keys. For a live key that books, ask NexG: it switches on live API bookings for your merchant, with a monthly limit.',
      'Cancel a booking, free of charge, until a rider is assigned with POST /v1/orders/{id}/cancel.',
      'Merchant keys work only while the merchant may operate: not while it is paused, suspended or delisted, and not while its application is waiting for approval.',
    ],
    since: '2026-11-14',
    source: 'apps/api/app/v1/orders/route.ts',
  },
  {
    slug: 'move-test-order',
    method: 'POST',
    host: 'api',
    path: '/v1/test/orders/{id}/status',
    status: 'live',
    group: 'Orders',
    title: 'Move a test booking',
    summary:
      'Sandbox only: move a test booking to a later status or stage, to try status and stage events.',
    description: [
      'A real booking changes as the merchant, NexG and the rider work on it. A test booking has nobody working on it, so this endpoint moves it for you: book with a test key, move the booking on, and watch the events arrive at your test endpoint.',
      'Send a status (confirmed, in_progress, completed or cancelled) or a stage (confirmed, preparing, ready, picked_up, arriving, delivered or cancelled). A status gets the first stage a real order uses for it. A move that changes the status sends booking.status_changed; one inside a status, such as picked_up to arriving, sends booking.stage_changed.',
      'A booking only moves forward. You may skip steps, and you may cancel it at any point before it is completed. Completed and cancelled are final.',
      'Test keys only. A live key is refused with 403: real bookings move only as the work happens. The developer console does the same with buttons, under Test bookings.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'uuid',
        required: true,
        description: 'The order_id of a test booking, from Book a service or List your orders.',
      },
      {
        name: 'X-Api-Key',
        in: 'header',
        type: 'string',
        required: true,
        description: 'A test key (nexg_test_…) bound to your merchant, with merchant_write.',
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
      path: { id: '7c6b5a49-3827-4615-a4b3-c2d1e0f9a8b7' },
      body: { status: 'confirmed' },
    },
    requestResources: [
      {
        title: 'Move',
        at: 'body',
        fields: [
          {
            name: 'status',
            type: "'confirmed' | 'in_progress' | 'completed' | 'cancelled'",
            description:
              'Where to move the booking: a status later than the one it has, or cancelled. Send this or stage.',
          },
          {
            name: 'stage',
            type: "'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'arriving' | 'delivered' | 'cancelled'",
            description:
              'Where to move the booking: a stage later than the one it has, or cancelled. Send this or status.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        order: {
          order_id: '7c6b5a49-3827-4615-a4b3-c2d1e0f9a8b7',
          reference: 'TEST-261117-A1B2C3',
          service: 'airport_transfer',
          quantity: 2,
          status: 'confirmed',
          stage: 'confirmed',
          payment_method: 'on_account',
          payment_status: 'pending',
          currency: 'KES',
          total_cents: 200000,
          scheduled_for: '2026-11-18T03:30:00+00:00',
          pickup_label: 'JKIA Terminal 1A',
          dropoff_label: 'Woodvale Grove, Westlands, Nairobi',
          created_at: '2026-11-17T09:12:44.512+00:00',
          rider: null,
        },
        previous_status: 'requested',
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      { schema: 'ApiOrder', title: 'Order', at: 'data.order', fields: ORDER_FIELDS },
      {
        title: 'Before the move',
        at: 'data',
        fields: [
          {
            name: 'previous_status',
            type: 'string',
            description: 'The status the booking had before this move.',
          },
          {
            name: 'previous_stage',
            type: 'string',
            description:
              'The stage the booking had before this move. Sent when you moved it by stage.',
          },
        ],
      },
    ],
    errors: [
      ...credentialErrors('merchant_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'The id is not a UUID, or the body is not JSON with one of status or stage, set to a value listed above.',
      },
      {
        status: 400,
        code: 'invalid_request',
        when: 'The booking cannot move there: it is already there, it is past it, or it is completed or cancelled. The message says which.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is a live key, or it is not bound to a merchant.',
      },
      {
        status: 404,
        code: 'not_found',
        when: 'Your merchant has no test booking with that id.',
      },
      { status: 500, code: 'internal_error', when: 'NexG could not move the booking.' },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'Each move sends one event to your enabled test endpoints, with the booking as GET /v1/orders/{id} returns it: booking.status_changed with previous_status and previous_stage, or booking.stage_changed with previous_stage. Cancelling sends booking.status_changed.',
      'Give a test ride or courier a test rider with Assign a test rider, to try booking.rider_assigned.',
      'Test bookings made in the developer console move the same way, and appear in List your orders for your test keys.',
    ],
    since: '2026-11-17',
    source: 'apps/api/app/v1/test/orders/[id]/status/route.ts',
  },
  {
    slug: 'assign-test-rider',
    method: 'POST',
    host: 'api',
    path: '/v1/test/orders/{id}/rider',
    status: 'live',
    group: 'Orders',
    title: 'Assign a test rider',
    summary: 'Sandbox only: give a test ride or courier a rider, to try booking.rider_assigned.',
    description: [
      'A real ride or courier gets a rider when one accepts its delivery job, and NexG sends booking.rider_assigned. A test booking has no riders, so this endpoint assigns a test rider and sends the same event to your test endpoint. Call it again to try a new rider taking over.',
      'The booking then answers a made-up rider in the shape a live booking does: first name Test, a motorbike, plate KTEST 001. Move it to picked_up and rider.location is the pickup point; to arriving, the drop-off point. Both need the booking to have been made with coordinates.',
      'Rides and couriers only, and not once the booking is completed or cancelled. There is no body. Test keys only: a live key is refused with 403.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'uuid',
        required: true,
        description: 'The order_id of a test ride or courier.',
      },
      {
        name: 'X-Api-Key',
        in: 'header',
        type: 'string',
        required: true,
        description: 'A test key (nexg_test_…) bound to your merchant, with merchant_write.',
      },
    ],
    example: { path: { id: '7c6b5a49-3827-4615-a4b3-c2d1e0f9a8b7' } },
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        order: {
          order_id: '7c6b5a49-3827-4615-a4b3-c2d1e0f9a8b7',
          reference: 'TEST-261117-A1B2C3',
          service: 'airport_transfer',
          quantity: 2,
          status: 'confirmed',
          stage: 'confirmed',
          payment_method: 'on_account',
          payment_status: 'pending',
          currency: 'KES',
          total_cents: 200000,
          scheduled_for: '2026-11-18T03:30:00+00:00',
          pickup_label: 'JKIA Terminal 1A',
          dropoff_label: 'Woodvale Grove, Westlands, Nairobi',
          created_at: '2026-11-17T09:12:44.512+00:00',
          rider: {
            first_name: 'Test',
            vehicle: 'motorbike',
            plate: 'KTEST 001',
            assigned_at: '2026-11-17T09:20:03.118+00:00',
            location: null,
          },
        },
        assigned_at: '2026-11-17T09:20:03.118+00:00',
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      { schema: 'ApiOrder', title: 'Order', at: 'data.order', fields: ORDER_FIELDS },
      { schema: 'ApiBookingRider', title: 'Rider', at: 'data.order.rider', fields: RIDER_FIELDS },
      {
        title: 'The rider',
        at: 'data',
        fields: [
          {
            name: 'assigned_at',
            type: 'string',
            description:
              'When the test rider was assigned. booking.rider_assigned carries the same.',
          },
        ],
      },
    ],
    errors: [
      ...credentialErrors('merchant_write', false),
      { status: 400, code: 'invalid_request', when: 'The id is not a UUID.' },
      {
        status: 400,
        code: 'invalid_request',
        when: 'The booking is not a ride or a courier, or it is completed or cancelled. The message says which.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is a live key, or it is not bound to a merchant.',
      },
      {
        status: 404,
        code: 'not_found',
        when: 'Your merchant has no test booking with that id.',
      },
      { status: 500, code: 'internal_error', when: 'NexG could not assign the test rider.' },
      UNEXPECTED_ERROR,
    ],
    notes: ['booking.rider_assigned carries the booking, with its rider, and assigned_at.'],
    since: '2026-11-18',
    source: 'apps/api/app/v1/test/orders/[id]/rider/route.ts',
  },
  {
    slug: 'list-reservations',
    method: 'GET',
    host: 'api',
    path: '/v1/reservations',
    status: 'live',
    group: 'Reservations',
    title: 'List your reservations',
    summary:
      'Your merchant’s tours, transfers, rentals, appointments and requests, oldest change first.',
    description: [
      'Returns the reservations of the merchant your key is bound to: what customers booked with you on NexG, and what your team entered in the merchant console’s calendar. Tour seats, transfers, rentals, appointments, and requests waiting for you to accept them. These come from NexG’s booking engine; orders and the services you book stay under Orders.',
      'They come oldest change first. Page forward with next_cursor until it is null, keep the updated_at of the last reservation, and next time pass it as updated_after to get only what changed since. With reservation events on your webhook endpoint, NexG tells you as each one changes, and this list is the backstop.',
      'A reservation never carries a phone number or an email address. The guest’s name, the trip’s addresses and the notes are here, not in events.',
    ],
    auth: { kind: 'key', scope: 'merchant_read', merchantBound: true },
    rateCost: 3,
    cache: 'no-store',
    paginated: true,
    params: [
      ...KEY_REQUIRED_HEADERS,
      CURSOR_PARAM,
      LIMIT_PARAM,
      {
        name: 'updated_after',
        in: 'query',
        type: 'timestamp',
        required: false,
        description:
          'Only reservations changed after this time, for example 2026-11-27T08:00:00Z. Pass the updated_at of the last reservation you stored.',
      },
    ],
    example: { query: { updated_after: '2026-11-27T08:00:00Z' } },
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        items: [
          {
            id: '01a21c69-35e2-710e-98e3-6a142af6ded1',
            kind: 'reservation',
            status: 'confirmed',
            stage: 'confirmed',
            offering: {
              id: '01a21c60-1b2c-7d3e-8f40-5a6b7c8d9e0f',
              name: 'JKIA to Westlands',
              model: 'TRANSFER',
            },
            starts_at: '2026-11-28T03:30:00.000Z',
            ends_at: '2026-11-28T04:30:00.000Z',
            quantity: 3,
            payment_state: 'paid',
            version: 2,
            updated_at: '2026-11-27T09:14:05.221Z',
            occurrence_id: null,
            resource_ids: ['01a21c5e-7f80-7a91-b2c3-d4e5f6a7b8c9'],
            ticket_type: null,
            capacity_unit: 'place',
            guest_name: 'Amina',
            trip: {
              pickup_area: 'JKIA',
              pickup_address: 'Terminal 1A arrivals',
              dropoff_area: 'Westlands',
              dropoff_address: 'Woodvale Grove, Westlands, Nairobi',
              flight_number: 'KQ 101',
            },
            service_location: null,
            notes: 'Two large suitcases.',
            currency: 'KES',
            total_cents: 450000,
            paid_cents: 450000,
            checked_in_at: null,
            booked_on: 'nexg',
            created_at: '2026-11-27T09:02:44.903Z',
            driver: null,
            refund_state: null,
          },
        ],
        next_cursor: null,
      },
      meta: { api_version: 'v1', limit: 25 },
    },
    responseResources: [
      {
        schema: 'ApiReservation',
        title: 'Reservation',
        at: 'data.items[]',
        fields: RESERVATION_FIELDS,
      },
      {
        schema: 'ApiReservationOffering',
        title: 'Offering',
        at: 'data.items[].offering',
        fields: RESERVATION_OFFERING_FIELDS,
      },
      {
        schema: 'ApiReservationTrip',
        title: 'Trip',
        at: 'data.items[].trip',
        fields: RESERVATION_TRIP_FIELDS,
      },
    ],
    errors: [
      ...credentialErrors('merchant_read', false),
      QUERY_ERROR,
      {
        status: 400,
        code: 'invalid_request',
        when: 'The cursor was not issued by this endpoint.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      {
        status: 503,
        code: 'internal_error',
        when: 'The booking engine did not answer. Retry with backoff.',
      },
      UNEXPECTED_ERROR,
    ],
    notes: [
      'A test key lists its test reservations, made with POST /v1/test/reservations.',
      'Each call costs 3 tokens, like an order read.',
    ],
    warning: 'Being switched on: until NexG connects the booking engine, this answers 503.',
    knownIssues: [
      'Until NexG connects the API to its booking engine, every call answers 503 internal_error. The changelog says when it is on.',
    ],
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/route.ts',
  },
  {
    slug: 'get-reservation',
    method: 'GET',
    host: 'api',
    path: '/v1/reservations/{id}',
    status: 'live',
    group: 'Reservations',
    title: 'Get one reservation',
    summary: 'One of your merchant’s reservations, by its id, with the guest’s name and the trip.',
    description: [
      'Returns one reservation of the merchant your key is bound to, as List your reservations returns it, read from the booking engine when you ask.',
      'Call it when a reservation event arrives: the event says what changed and where the reservation stands, and this adds what events leave out, the name it is under, the trip’s addresses and the notes.',
      'An id that belongs to another merchant gets the same 404 as an id that does not exist.',
    ],
    auth: { kind: 'key', scope: 'merchant_read', merchantBound: true },
    rateCost: 3,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The reservation’s id, from a list or from a reservation event.',
      },
      ...KEY_REQUIRED_HEADERS,
    ],
    example: { path: { id: '01a21c69-35e2-710e-98e3-6a142af6ded1' } },
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        reservation: {
          id: '01a21c69-35e2-710e-98e3-6a142af6ded1',
          kind: 'reservation',
          status: 'in_progress',
          stage: 'confirmed',
          offering: {
            id: '01a21c60-1b2c-7d3e-8f40-5a6b7c8d9e0f',
            name: 'JKIA to Westlands',
            model: 'TRANSFER',
          },
          starts_at: '2026-11-28T03:30:00.000Z',
          ends_at: '2026-11-28T04:30:00.000Z',
          quantity: 3,
          payment_state: 'paid',
          version: 3,
          updated_at: '2026-11-28T03:41:10.502Z',
          occurrence_id: null,
          resource_ids: ['01a21c5e-7f80-7a91-b2c3-d4e5f6a7b8c9'],
          ticket_type: null,
          capacity_unit: 'place',
          guest_name: 'Amina',
          trip: {
            pickup_area: 'JKIA',
            pickup_address: 'Terminal 1A arrivals',
            dropoff_area: 'Westlands',
            dropoff_address: 'Woodvale Grove, Westlands, Nairobi',
            flight_number: 'KQ 101',
          },
          service_location: null,
          notes: 'Two large suitcases.',
          currency: 'KES',
          total_cents: 450000,
          paid_cents: 450000,
          checked_in_at: '2026-11-28T03:41:10.502Z',
          booked_on: 'nexg',
          created_at: '2026-11-27T09:02:44.903Z',
          driver: {
            first_name: 'Juma',
            vehicle: 'White Toyota Noah',
            plate: 'KDA 123A',
            assigned_at: '2026-11-27T18:20:31.004Z',
            location: { latitude: -1.319167, longitude: 36.927778, at: '2026-11-28T03:24:10.000Z' },
          },
          refund_state: null,
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      {
        schema: 'ApiReservation',
        title: 'Reservation',
        at: 'data.reservation',
        fields: RESERVATION_FIELDS,
      },
      {
        schema: 'ApiReservationOffering',
        title: 'Offering',
        at: 'data.reservation.offering',
        fields: RESERVATION_OFFERING_FIELDS,
      },
      {
        schema: 'ApiReservationTrip',
        title: 'Trip',
        at: 'data.reservation.trip',
        fields: RESERVATION_TRIP_FIELDS,
      },
      {
        schema: 'ApiReservationDriver',
        title: 'Driver',
        at: 'data.reservation.driver',
        fields: RESERVATION_DRIVER_FIELDS,
      },
    ],
    errors: [
      ...credentialErrors('merchant_read', false),
      { status: 400, code: 'invalid_request', when: 'The id is not a reservation id.' },
      { status: 403, code: 'not_found', when: 'The key is not bound to a merchant.' },
      {
        status: 404,
        code: 'not_found',
        when: 'Your merchant has no reservation with that id. A test key reads only its test reservations.',
      },
      {
        status: 503,
        code: 'internal_error',
        when: 'The booking engine did not answer. Retry with backoff.',
      },
      UNEXPECTED_ERROR,
    ],
    warning: 'Being switched on: until NexG connects the booking engine, this answers 503.',
    knownIssues: [
      'Until NexG connects the API to its booking engine, every call answers 503 internal_error. The changelog says when it is on.',
    ],
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/[id]/route.ts',
  },
  {
    slug: 'accept-reservation',
    method: 'POST',
    host: 'api',
    path: '/v1/reservations/{id}/accept',
    status: 'live',
    group: 'Reservations',
    title: 'Accept a reservation',
    summary: 'Confirm a reservation or request that is waiting for your business.',
    description: [
      'Confirms a reservation that is waiting for you, a request you can take, or accepts a work request. The answer is the reservation as it is now, and reservation.status_changed goes to your endpoints.',
      'A customer booking on NexG confirms itself once it is paid, so one still waiting for payment is refused with 409.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The reservation’s id.',
      },
      keyHeader('merchant_write', 'A test key accepts test reservations.'),
      CHANGE_KEY,
    ],
    example: { path: { id: SAMPLE_RESERVATION.id }, body: { expected_version: 2 } },
    requestResources: [{ title: 'Acceptance', at: 'body', fields: [EXPECTED_VERSION_FIELD] }],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: { reservation: SAMPLE_RESERVATION },
      meta: { api_version: 'v1' },
    },
    responseResources: RESERVATION_RESOURCES,
    errors: [
      ...credentialErrors('merchant_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, or the body is not { expected_version }.',
      },
      { status: 403, code: 'not_found', when: 'The key is not bound to a merchant.' },
      { status: 404, code: 'not_found', when: 'Your merchant has no reservation with that id.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/[id]/accept/route.ts',
  },
  {
    slug: 'decline-reservation',
    method: 'POST',
    host: 'api',
    path: '/v1/reservations/{id}/decline',
    status: 'live',
    group: 'Reservations',
    title: 'Decline a reservation',
    summary: 'Decline a reservation that is still waiting and unpaid.',
    description: [
      'Declines a reservation or request that is still waiting for you and has not been paid, with an optional reason. reservation.status_changed goes to your endpoints.',
      'A confirmed or paid booking cannot be declined here: the customer has paid NexG, so NexG support cancels it and handles the refund. The answer is 409.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The reservation’s id.',
      },
      keyHeader('merchant_write', 'A test key declines test reservations.'),
      CHANGE_KEY,
    ],
    example: {
      path: { id: SAMPLE_RESERVATION.id },
      body: { expected_version: 1, reason: 'No vehicle free at that time.' },
    },
    requestResources: [
      {
        title: 'Decline',
        at: 'body',
        fields: [
          EXPECTED_VERSION_FIELD,
          {
            name: 'reason',
            type: 'string',
            description: 'Why, in up to 500 characters. Optional.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        reservation: {
          ...SAMPLE_RESERVATION,
          status: 'cancelled',
          stage: 'cancelled',
          payment_state: 'not_required',
          paid_cents: 0,
          version: 2,
          driver: null,
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [RESERVATION_RESOURCES[0]!],
    errors: [
      ...credentialErrors('merchant_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, or the body is not { expected_version, reason }.',
      },
      { status: 403, code: 'not_found', when: 'The key is not bound to a merchant.' },
      { status: 404, code: 'not_found', when: 'Your merchant has no reservation with that id.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/[id]/decline/route.ts',
  },
  {
    slug: 'set-reservation-driver',
    method: 'PUT',
    host: 'api',
    path: '/v1/reservations/{id}/driver',
    status: 'live',
    group: 'Reservations',
    title: 'Set the driver',
    summary: 'Tell the customer who is coming: first name, vehicle and plate.',
    description: [
      'Sets the driver of a reservation, typically a transfer: the driver’s first name, the vehicle and its plate. The customer sees them on their booking, and reservation.updated goes to your endpoints. Send driver: null to clear it.',
      'Never a phone number or a surname: a body with any other field is refused. A cancelled or finished booking cannot be given a driver.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The reservation’s id.',
      },
      keyHeader('merchant_write', 'A test key sets test reservations’ drivers.'),
      CHANGE_KEY,
    ],
    example: {
      path: { id: SAMPLE_RESERVATION.id },
      body: {
        expected_version: 2,
        driver: { first_name: 'Juma', vehicle: 'White Toyota Noah', plate: 'KDA 123A' },
      },
    },
    requestResources: [
      {
        title: 'Driver',
        at: 'body',
        fields: [
          EXPECTED_VERSION_FIELD,
          {
            name: 'driver',
            type: 'object',
            nullable: true,
            description:
              'first_name (up to 60 characters), vehicle (up to 80) and plate (optional, up to 20), or null to clear it.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: { reservation: SAMPLE_RESERVATION },
      meta: { api_version: 'v1' },
    },
    responseResources: RESERVATION_RESOURCES,
    errors: [
      ...credentialErrors('merchant_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, or the driver has another field than first_name, vehicle and plate.',
      },
      { status: 403, code: 'not_found', when: 'The key is not bound to a merchant.' },
      { status: 404, code: 'not_found', when: 'Your merchant has no reservation with that id.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/[id]/driver/route.ts',
  },
  {
    slug: 'share-driver-location',
    method: 'PUT',
    host: 'api',
    path: '/v1/reservations/{id}/driver/location',
    status: 'live',
    group: 'Reservations',
    title: 'Share where the driver is',
    summary:
      'Let the customer follow the driver on their booking, the way NexG riders show theirs.',
    description: [
      'Send the driver’s position as often as your system has it, every 10 to 30 seconds while they drive. The customer sees it on their booking, with the time it was taken, while the booking is confirmed or under way and the position is under 30 minutes old.',
      'Set the driver first. A position changes no version and sends no event, so it never clashes with your other changes; a position older than the one NexG holds is ignored. A new driver starts with none, and NexG deletes positions once a day old.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The reservation’s id.',
      },
      keyHeader('merchant_write', 'A test key shares a test reservation’s driver position.'),
    ],
    example: {
      path: { id: SAMPLE_RESERVATION.id },
      body: { latitude: -1.3192, longitude: 36.9278, at: '2026-12-04T06:21:30+03:00' },
    },
    requestResources: [
      {
        title: 'Position',
        at: 'body',
        fields: [
          { name: 'latitude', type: 'number', description: 'From -90 to 90.' },
          { name: 'longitude', type: 'number', description: 'From -180 to 180.' },
          {
            name: 'at',
            type: 'string',
            nullable: true,
            description:
              'When the driver was there, with its offset. At most 30 minutes ago; leave it out for now.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        reservation: {
          ...SAMPLE_RESERVATION,
          driver: {
            first_name: 'Juma',
            vehicle: 'White Toyota Noah',
            plate: 'KDA 123A',
            assigned_at: '2026-12-04T05:40:00.000Z',
            location: { latitude: -1.3192, longitude: 36.9278, at: '2026-12-04T03:21:30.000Z' },
          },
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: RESERVATION_RESOURCES,
    errors: [
      ...credentialErrors('merchant_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'A coordinate is out of range, at is more than 30 minutes ago, or the body has another field.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'Your merchant has no reservation with that id.' },
      {
        status: 409,
        code: 'conflict',
        when: 'The reservation has no driver yet, or it is not confirmed or under way.',
      },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/[id]/driver/location/route.ts',
  },
  {
    slug: 'create-test-reservation',
    method: 'POST',
    host: 'api',
    path: '/v1/test/reservations',
    status: 'live',
    group: 'Reservations',
    title: 'Make a test reservation',
    summary: 'A sandbox reservation for trying your integration with a test key.',
    description: [
      'With a test key, makes a test reservation: a transfer for tomorrow under the name Test Guest unless you say otherwise. reservation.created goes to your test endpoints, and GET /v1/reservations with the same key lists it. Nothing real is booked or charged.',
      'Accept, decline, reschedule, start, complete or cancel it, set its driver and share where they are, under the same rules as real reservations, or move it on with POST /v1/test/reservations/{id}/status. The developer console also sends a sample reservation event to a test endpoint. A total_cents above 0 makes it wait for payment, as a customer booking does. Test reservations are kept 30 days.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [keyHeader('merchant_write', 'A test key (nexg_test_…) only.')],
    example: {
      body: {
        offering_name: 'JKIA to Westlands',
        starts_at: '2026-11-28T06:30:00+03:00',
        quantity: 3,
        guest_name: 'Amina',
        trip: { pickup_area: 'JKIA', dropoff_area: 'Westlands' },
      },
    },
    requestResources: [
      {
        title: 'Test reservation',
        at: 'body',
        fields: [
          {
            name: 'kind',
            type: 'string',
            description: 'reservation (the default) or request.',
          },
          { name: 'offering_name', type: 'string', description: 'Defaults to Test transfer.' },
          {
            name: 'offering_model',
            type: 'string',
            description: 'TRANSFER (the default), TOUR, APPOINTMENT or another model.',
          },
          { name: 'starts_at', type: 'timestamp', description: 'Defaults to this hour tomorrow.' },
          { name: 'ends_at', type: 'timestamp', description: 'Defaults to an hour later.' },
          { name: 'quantity', type: 'integer', description: '1 to 1000. Defaults to 1.' },
          { name: 'guest_name', type: 'string', description: 'Defaults to Test Guest.' },
          {
            name: 'trip',
            type: 'object',
            description: 'pickup_area, pickup_address, dropoff_area, dropoff_address.',
          },
          { name: 'notes', type: 'string', description: 'Up to 2000 characters.' },
          {
            name: 'total_cents',
            type: 'integer',
            description: 'Defaults to 0. Above 0 it waits for payment.',
          },
        ],
      },
    ],
    responseStatus: '201 Created',
    responseExample: {
      ok: true,
      data: {
        reservation: {
          ...SAMPLE_RESERVATION,
          id: '5b9e1c2d-3f4a-4b6c-8d7e-9f0a1b2c3d4e',
          status: 'requested',
          stage: 'pending',
          offering: { id: null, name: 'JKIA to Westlands', model: 'TRANSFER' },
          starts_at: '2026-11-28T03:30:00+00:00',
          ends_at: '2026-11-28T04:30:00+00:00',
          payment_state: 'not_required',
          version: 1,
          updated_at: '2026-11-27T10:02:44.903+00:00',
          resource_ids: [],
          trip: {
            pickup_area: 'JKIA',
            pickup_address: null,
            dropoff_area: 'Westlands',
            dropoff_address: null,
            flight_number: null,
          },
          notes: null,
          total_cents: 0,
          paid_cents: 0,
          created_at: '2026-11-27T10:02:44.903+00:00',
          driver: null,
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [RESERVATION_RESOURCES[0]!],
    errors: [
      ...credentialErrors('merchant_write', false),
      { status: 400, code: 'invalid_request', when: 'A field is unknown or out of range.' },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is a live key, or it is not bound to a merchant.',
      },
      {
        status: 409,
        code: 'conflict',
        when: 'Your merchant has 500 test reservations. Older ones go after 30 days.',
      },
      UNEXPECTED_ERROR,
    ],
    since: '2026-11-27',
    source: 'apps/api/app/v1/test/reservations/route.ts',
  },
  {
    slug: 'move-test-reservation',
    method: 'POST',
    host: 'api',
    path: '/v1/test/reservations/{id}/status',
    status: 'live',
    group: 'Reservations',
    title: 'Move a test reservation',
    summary: 'Move a test reservation to confirmed, in_progress, completed or cancelled.',
    description: [
      'With a test key, moves a test reservation forward, as the customer and your team would move a real one: confirmed (as if the customer had paid), in_progress, completed, or cancelled before it is completed. reservation.status_changed goes to your test endpoints.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'uuid',
        required: true,
        description: 'The test reservation’s id.',
      },
      keyHeader('merchant_write', 'A test key (nexg_test_…) only.'),
    ],
    example: {
      path: { id: '5b9e1c2d-3f4a-4b6c-8d7e-9f0a1b2c3d4e' },
      body: { status: 'confirmed' },
    },
    requestResources: [
      {
        title: 'Move',
        at: 'body',
        fields: [
          {
            name: 'status',
            type: 'string',
            description: 'confirmed, in_progress, completed or cancelled.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        reservation: {
          ...SAMPLE_RESERVATION,
          id: '5b9e1c2d-3f4a-4b6c-8d7e-9f0a1b2c3d4e',
          offering: { id: null, name: 'JKIA to Westlands', model: 'TRANSFER' },
          version: 2,
          resource_ids: [],
          driver: null,
        },
        previous_status: 'requested',
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [
      RESERVATION_RESOURCES[0]!,
      {
        title: 'Move',
        at: 'data',
        fields: [
          {
            name: 'previous_status',
            type: 'string',
            description: 'The status it had before this call.',
          },
        ],
      },
    ],
    errors: [
      ...credentialErrors('merchant_write', false),
      { status: 400, code: 'invalid_request', when: 'The status is not one of the four.' },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is a live key, or it is not bound to a merchant.',
      },
      {
        status: 404,
        code: 'not_found',
        when: 'Your merchant has no test reservation with that id.',
      },
      {
        status: 409,
        code: 'conflict',
        when: 'It would move backwards, or it is already completed or cancelled.',
      },
      UNEXPECTED_ERROR,
    ],
    since: '2026-11-27',
    source: 'apps/api/app/v1/test/reservations/[id]/status/route.ts',
  },
  {
    slug: 'create-reservation',
    method: 'POST',
    host: 'api',
    path: '/v1/reservations',
    status: 'live',
    group: 'Reservations',
    title: 'Record a booking taken elsewhere',
    summary: 'Put a booking your team took by phone or at the desk into NexG’s calendar.',
    description: [
      'Records a booking your business took outside NexG, so NexG’s calendar holds the time and nobody books it twice: a transfer booked by phone, a walk-in at the desk. It is checked like any booking (free time, capacity, the offering’s rules) and comes back as a reservation with booked_on merchant.',
      'It needs the guest’s email or phone number, kept by NexG for your business only and never returned by the API. Customers pay you directly for these: NexG collects nothing.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      keyHeader('merchant_write', 'A live key: a test key makes test reservations instead.'),
      CHANGE_KEY,
    ],
    example: {
      body: {
        offering_id: SAMPLE_RESERVATION.offering.id,
        starts_at: '2026-11-28T06:30:00+03:00',
        quantity: 3,
        guest: { name: 'Amina', phone: '+254700000000' },
        trip: {
          pickup_area: 'JKIA',
          pickup_address: 'Terminal 1A arrivals',
          dropoff_area: 'Westlands',
          dropoff_address: 'Woodvale Grove, Westlands, Nairobi',
          flight_number: 'KQ 101',
        },
      },
    },
    requestResources: [
      {
        title: 'Booking',
        at: 'body',
        fields: [
          {
            name: 'offering_id',
            type: 'string',
            description: 'The offering, from List your offerings.',
          },
          { name: 'starts_at', type: 'timestamp', description: 'When it starts, with an offset.' },
          {
            name: 'ends_at',
            type: 'timestamp',
            description: 'When it ends, for a booking whose length you choose.',
          },
          {
            name: 'quantity',
            type: 'integer',
            description: 'Seats, passengers or units. Defaults to 1.',
          },
          {
            name: 'resource_ids',
            type: 'string[]',
            description: 'The resources to hold, when you choose them.',
          },
          {
            name: 'occurrence_id',
            type: 'string',
            description: 'The departure, for a tour or class.',
          },
          {
            name: 'ticket_type_id',
            type: 'string',
            description: 'The ticket type, when the offering has them.',
          },
          {
            name: 'guest',
            type: 'object',
            description: 'name, and email or phone (at least one). Kept for your business only.',
          },
          { name: 'notes', type: 'string', description: 'Up to 2000 characters.' },
          {
            name: 'trip',
            type: 'object',
            description:
              'For a transfer: pickup_area, pickup_address, dropoff_area, dropoff_address, and flight_number for an airport pickup.',
          },
          {
            name: 'service_location',
            type: 'object',
            description: 'area and address, for a visit.',
          },
          {
            name: 'hold',
            type: 'boolean',
            description: 'true holds the time until you accept it.',
          },
        ],
      },
    ],
    responseStatus: '201 Created',
    responseExample: {
      ok: true,
      data: {
        reservation: {
          ...SAMPLE_RESERVATION,
          payment_state: 'not_required',
          paid_cents: 0,
          version: 1,
          booked_on: 'merchant' as const,
          notes: null,
          driver: null,
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: [RESERVATION_RESOURCES[0]!],
    errors: [
      ...credentialErrors('merchant_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, a field out of range, no email or phone, a time that is not free, or a flight number that is not one.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is a test key, or it is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'Your business has no offering with that id.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/route.ts',
  },
  {
    slug: 'check-in-reservation',
    method: 'POST',
    host: 'api',
    path: '/v1/reservations/check-in',
    status: 'live',
    group: 'Reservations',
    title: 'Check a customer in',
    summary: 'Check the booking code a customer shows, and mark them arrived.',
    description: [
      'A customer booking on NexG has a six-character code the customer shows at your desk or to the driver once it is paid. Send it with the name they give: NexG checks both and marks the customer arrived. The answer is the reservation, never the code.',
      'A code works once, only while the booking is paid and on, and ten wrong codes or names in 15 minutes lock your key out of check-ins for a while.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      keyHeader('merchant_write', 'A live key: test reservations have no codes.'),
      CHANGE_KEY,
    ],
    example: { body: { code: 'K7M2QX', name: 'Amina' } },
    requestResources: [
      {
        title: 'Check-in',
        at: 'body',
        fields: [
          {
            name: 'code',
            type: 'string',
            description: 'The six-character code the customer shows.',
          },
          {
            name: 'name',
            type: 'string',
            description: 'The name they give. Optional, but checked when sent.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        reservation: {
          ...SAMPLE_RESERVATION,
          status: 'in_progress',
          checked_in_at: '2026-11-28T03:41:10.502Z',
          version: 4,
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: RESERVATION_RESOURCES,
    errors: [
      ...credentialErrors('merchant_write', false),
      { status: 400, code: 'invalid_request', when: 'No Idempotency-Key, or no code.' },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is a test key, or it is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'No booking of yours has that code.' },
      ...ENGINE_ERRORS,
    ],
    notes: [
      'A 409 says why: already used, not paid yet, the name does not match, or the booking is over.',
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/check-in/route.ts',
  },
  {
    slug: 'reschedule-reservation',
    method: 'POST',
    host: 'api',
    path: '/v1/reservations/{id}/reschedule',
    status: 'live',
    group: 'Reservations',
    title: 'Move a reservation',
    summary: 'Move a reservation to another time, before it starts.',
    description: [
      'Moves a reservation to another time before it starts, under the merchant console’s rules: the new time must be free, and a time that would cost more than was paid is refused with 409 and nothing changes. reservation.updated goes to your endpoints, and the customer sees the new time.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The reservation’s id.',
      },
      keyHeader('merchant_write', 'A test key does this to test reservations.'),
      CHANGE_KEY,
    ],
    example: {
      path: { id: SAMPLE_RESERVATION.id },
      body: { expected_version: 3, starts_at: '2026-11-28T08:00:00+03:00' },
    },
    requestResources: [
      {
        title: 'New time',
        at: 'body',
        fields: [
          EXPECTED_VERSION_FIELD,
          { name: 'starts_at', type: 'timestamp', description: 'The new start, with an offset.' },
          {
            name: 'ends_at',
            type: 'timestamp',
            description: 'The new end, for a booking whose length you choose.',
          },
          {
            name: 'expected_total_cents',
            type: 'integer',
            description:
              'The price you expect. If the new time costs something else, the answer is 409.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        reservation: {
          ...SAMPLE_RESERVATION,
          starts_at: '2026-11-28T05:00:00.000Z',
          ends_at: '2026-11-28T06:00:00.000Z',
          version: 4,
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: RESERVATION_RESOURCES,
    errors: [
      ...credentialErrors('merchant_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, or the new time is not free or not allowed.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'Your merchant has no reservation with that id.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/[id]/reschedule/route.ts',
  },
  {
    slug: 'start-reservation',
    method: 'POST',
    host: 'api',
    path: '/v1/reservations/{id}/start',
    status: 'live',
    group: 'Reservations',
    title: 'Start a reservation',
    summary: 'The trip or work has begun; a rental is handed over.',
    description: [
      'Marks a confirmed reservation as begun: the driver has the guest, the tour has left. For a rental it records the hand-over. The status becomes in_progress and reservation.status_changed goes to your endpoints.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The reservation’s id.',
      },
      keyHeader('merchant_write', 'A test key does this to test reservations.'),
      CHANGE_KEY,
    ],
    example: { path: { id: SAMPLE_RESERVATION.id }, body: { expected_version: 3 } },
    requestResources: [{ title: 'Start', at: 'body', fields: [EXPECTED_VERSION_FIELD] }],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: { reservation: { ...SAMPLE_RESERVATION, status: 'in_progress', version: 4 } },
      meta: { api_version: 'v1' },
    },
    responseResources: RESERVATION_RESOURCES,
    errors: [
      ...credentialErrors('merchant_write', false),
      { status: 400, code: 'invalid_request', when: 'No Idempotency-Key, or no expected_version.' },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'Your merchant has no reservation with that id.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/[id]/start/route.ts',
  },
  {
    slug: 'complete-reservation',
    method: 'POST',
    host: 'api',
    path: '/v1/reservations/{id}/complete',
    status: 'live',
    group: 'Reservations',
    title: 'Complete a reservation',
    summary: 'The trip or work is done; a rental is returned.',
    description: [
      'Marks a reservation as done, with a short note kept with the booking: Dropped at the hotel at 10:42. For a rental it records the return. The status becomes completed and reservation.status_changed goes to your endpoints.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The reservation’s id.',
      },
      keyHeader('merchant_write', 'A test key does this to test reservations.'),
      CHANGE_KEY,
    ],
    example: {
      path: { id: SAMPLE_RESERVATION.id },
      body: { expected_version: 4, note: 'Dropped at the hotel at 10:42.' },
    },
    requestResources: [
      {
        title: 'Completion',
        at: 'body',
        fields: [
          EXPECTED_VERSION_FIELD,
          { name: 'note', type: 'string', description: 'How it went, up to 2000 characters.' },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        reservation: { ...SAMPLE_RESERVATION, status: 'completed', stage: 'completed', version: 5 },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: RESERVATION_RESOURCES,
    errors: [
      ...credentialErrors('merchant_write', false),
      { status: 400, code: 'invalid_request', when: 'No Idempotency-Key, or no note.' },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'Your merchant has no reservation with that id.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/[id]/complete/route.ts',
  },
  {
    slug: 'cancel-reservation',
    method: 'POST',
    host: 'api',
    path: '/v1/reservations/{id}/cancel',
    status: 'live',
    group: 'Reservations',
    title: 'Cancel a reservation',
    summary: 'Cancel a reservation before it starts, paid or not.',
    description: [
      'Cancels a reservation before it starts, with a reason the customer sees on their booking. reservation.status_changed goes to your endpoints.',
      'When the customer has paid, NexG refunds them in full: the reservation answers refund_state review_required while NexG Finance makes the refund. Your settlement leaves out a cancelled booking.',
    ],
    auth: { kind: 'key', scope: 'merchant_write', merchantBound: true },
    rateCost: 5,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The reservation’s id.',
      },
      keyHeader('merchant_write', 'A test key does this to test reservations.'),
      CHANGE_KEY,
    ],
    example: {
      path: { id: SAMPLE_RESERVATION.id },
      body: { expected_version: 3, reason: 'The vehicle broke down. We are sorry.' },
    },
    requestResources: [
      {
        title: 'Cancellation',
        at: 'body',
        fields: [
          EXPECTED_VERSION_FIELD,
          {
            name: 'reason',
            type: 'string',
            description: 'Shown to the customer, up to 500 characters.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: {
        reservation: {
          ...SAMPLE_RESERVATION,
          status: 'cancelled',
          stage: 'cancelled',
          version: 4,
          refund_state: 'review_required',
        },
      },
      meta: { api_version: 'v1' },
    },
    responseResources: RESERVATION_RESOURCES,
    errors: [
      ...credentialErrors('merchant_write', false),
      { status: 400, code: 'invalid_request', when: 'No Idempotency-Key, or no reason.' },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'Your merchant has no reservation with that id.' },
      ...ENGINE_ERRORS,
    ],
    notes: ['Once a reservation has started, it can no longer be cancelled (409).'],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/reservations/[id]/cancel/route.ts',
  },
  {
    slug: 'create-offering',
    method: 'POST',
    host: 'api',
    path: '/v1/offerings',
    status: 'live',
    group: 'Booking setup',
    title: 'Add an offering',
    summary: 'A new transfer, tour, rental or appointment, on NexG’s standard terms.',
    description: [
      'Adds something your business sells as a booking, using resources you already have. It takes NexG’s standard terms: customers pay through NexG before a booking confirms, and a booking can change before it starts.',
      'Each kind has its own needs: a transfer needs a vehicle and a driver together and the areas you serve; a class or tour needs its capacity and then departures. The answer says what is missing.',
      SETUP_DRY_RUN,
    ],
    auth: { kind: 'key', scope: 'catalogue_write', merchantBound: true },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [keyHeader('catalogue_write', SETUP_TEST_KEY), CHANGE_KEY],
    example: {
      body: {
        name: 'JKIA to Westlands',
        model: 'TRANSFER',
        duration_minutes: 60,
        price_cents: 450000,
        resource_ids: [
          '01a21c5e-7f80-7a91-b2c3-d4e5f6a7b8c9',
          '01a21c5f-8091-7ba2-c3d4-e5f6a7b8c9d0',
        ],
        service_areas: ['JKIA', 'Westlands'],
        transport_included: true,
      },
    },
    requestResources: [
      {
        title: 'Offering',
        at: 'body',
        fields: [
          { name: 'name', type: 'string', description: 'Its name, as customers see it.' },
          {
            name: 'model',
            type: 'string',
            description: 'TRANSFER, SESSION_CAPACITY, APPOINTMENT, ASSET_INTERVAL and others.',
          },
          { name: 'price_cents', type: 'integer', description: 'The price in cents.' },
          {
            name: 'resource_ids',
            type: 'string[]',
            description: 'The resources it books, from List your resources.',
          },
          { name: 'duration_minutes', type: 'integer', description: 'How long one booking lasts.' },
          {
            name: 'pricing_basis',
            type: 'string',
            description: 'per_booking (default), per_quantity, per_duration or per_night.',
          },
          { name: 'capacity', type: 'integer', description: 'Places per booking or session.' },
          {
            name: 'capacity_unit',
            type: 'string',
            description: 'What capacity counts, for example place.',
          },
          {
            name: 'service_areas',
            type: 'string[]',
            description: 'For a transfer or a visit: the areas you serve.',
          },
          {
            name: 'transport_included',
            type: 'boolean',
            description: 'A transfer: true when it takes the guest to a drop-off.',
          },
          {
            name: 'with_driver',
            type: 'boolean',
            description: 'A rental: true when it comes with a driver.',
          },
          {
            name: 'travel_minutes',
            type: 'integer',
            description:
              'A transfer or visit: time kept free after each to travel back. Default 0.',
          },
          { name: 'description', type: 'string', description: 'Up to 2000 characters.' },
          { name: 'booking_enabled', type: 'boolean', description: 'Defaults to true.' },
          { name: 'active', type: 'boolean', description: 'Defaults to true.' },
          {
            name: 'lead_time_minutes',
            type: 'integer',
            description: 'How long before it starts a booking must be made. Default 60.',
          },
          {
            name: 'horizon_days',
            type: 'integer',
            description: 'How far ahead it can be booked. Default 365.',
          },
        ],
      },
    ],
    responseStatus: '201 Created',
    responseExample: {
      ok: true,
      data: { offering: { ...SAMPLE_OFFERING, version: 1 }, applied: true },
      meta: { api_version: 'v1' },
    },
    responseResources: [...OFFERING_RESOURCES('data.offering'), SETUP_APPLIED],
    errors: [
      ...credentialErrors('catalogue_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, or the offering is missing something its kind needs. The message says what.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'A resource it names was not found.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/offerings/route.ts',
  },
  {
    slug: 'create-resource',
    method: 'POST',
    host: 'api',
    path: '/v1/resources',
    status: 'live',
    group: 'Booking setup',
    title: 'Add a resource',
    summary: 'A new vehicle, room, guide or pool of places, with its hours.',
    description: [
      'Adds something your bookings hold: a vehicle, a driver or guide (staff), a room, a pool of places. Give its working days and hours in Nairobi time. Then name it in an offering’s resource_ids.',
      SETUP_DRY_RUN,
    ],
    auth: { kind: 'key', scope: 'catalogue_write', merchantBound: true },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [keyHeader('catalogue_write', SETUP_TEST_KEY), CHANGE_KEY],
    example: {
      body: {
        name: 'Van one (KDA 123A)',
        kind: 'vehicle',
        quantity: 1,
        schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '04:00', end: '23:00' },
      },
    },
    requestResources: [
      {
        title: 'Resource',
        at: 'body',
        fields: [
          { name: 'name', type: 'string', description: 'Its name.' },
          {
            name: 'kind',
            type: 'string',
            description: 'staff, asset, vehicle, room, space, equipment or capacity_pool.',
          },
          {
            name: 'quantity',
            type: 'integer',
            description: '1 for a vehicle or room; the places in a pool.',
          },
          {
            name: 'schedule',
            type: 'object',
            description: 'days (0 is Sunday), start and end, as HH:MM in Nairobi time.',
          },
          { name: 'capacity_mode', type: 'string', description: 'per-reservation or per-guest.' },
          {
            name: 'capacity_unit',
            type: 'string',
            description: 'What quantity counts, for example place.',
          },
          {
            name: 'party_capacity',
            type: 'integer',
            description: 'A vehicle or room: how many people it takes.',
          },
          { name: 'active', type: 'boolean', description: 'Defaults to true.' },
        ],
      },
    ],
    responseStatus: '201 Created',
    responseExample: {
      ok: true,
      data: { resource: { ...SAMPLE_RESOURCE, closures: [], version: 1 }, applied: true },
      meta: { api_version: 'v1' },
    },
    responseResources: [...RESOURCE_RESOURCES('data.resource'), SETUP_APPLIED],
    errors: [
      ...credentialErrors('catalogue_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, or a field out of range.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/resources/route.ts',
  },
  {
    slug: 'list-offerings',
    method: 'GET',
    host: 'api',
    path: '/v1/offerings',
    status: 'live',
    group: 'Booking setup',
    title: 'List your offerings',
    summary: 'What your business sells as bookings: prices, on or off, departures.',
    description: [
      'Returns what your business sells as bookings on NexG: transfers, tours, rentals, appointments. Each has its price, whether it takes bookings, its version for changes, and, for a tour or class, its departures that have not ended.',
      'Use the ids to read reservations (offering.id) and to change prices and departures. A test key reads the same setup.',
    ],
    auth: { kind: 'key', scope: 'merchant_read', merchantBound: true },
    rateCost: 3,
    cache: 'no-store',
    paginated: false,
    params: [...KEY_REQUIRED_HEADERS],
    example: {},
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: { items: [SAMPLE_OFFERING, SAMPLE_TOUR] },
      meta: { api_version: 'v1' },
    },
    responseResources: OFFERING_RESOURCES('data.items[]'),
    errors: [
      ...credentialErrors('merchant_read', false),
      { status: 403, code: 'not_found', when: 'The key is not bound to a merchant.' },
      {
        status: 503,
        code: 'internal_error',
        when: 'The booking engine did not answer. Retry with backoff.',
      },
      UNEXPECTED_ERROR,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/offerings/route.ts',
  },
  {
    slug: 'update-offering',
    method: 'PATCH',
    host: 'api',
    path: '/v1/offerings/{id}',
    status: 'live',
    group: 'Booking setup',
    title: 'Change an offering',
    summary: 'Change its price, switch it off, or stop new bookings.',
    description: [
      'Changes an offering’s price (price_cents), switches it off (active: false) or stops new bookings while it stays visible (booking_enabled: false). Send the version you read; the answer is the offering as it is now.',
      'Bookings already made keep the price they were made at. While an offering has open bookings its price cannot change (409): make a new offering with the new price, as in the merchant console.',
      SETUP_DRY_RUN,
    ],
    auth: { kind: 'key', scope: 'catalogue_write', merchantBound: true },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The offering’s id, from List your offerings.',
      },
      keyHeader('catalogue_write', SETUP_TEST_KEY),
      CHANGE_KEY,
    ],
    example: {
      path: { id: SAMPLE_OFFERING.id },
      body: { expected_version: 3, price_cents: 450000 },
    },
    requestResources: [
      {
        title: 'Change',
        at: 'body',
        fields: [
          EXPECTED_VERSION_FIELD,
          { name: 'price_cents', type: 'integer', description: 'The new price, in cents.' },
          { name: 'active', type: 'boolean', description: 'false switches it off.' },
          {
            name: 'booking_enabled',
            type: 'boolean',
            description: 'false keeps it visible but takes no new bookings.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: { offering: SAMPLE_OFFERING, applied: true },
      meta: { api_version: 'v1' },
    },
    responseResources: [...OFFERING_RESOURCES('data.offering'), SETUP_APPLIED],
    errors: [
      ...credentialErrors('catalogue_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, no change in the body, or a field it does not take.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'Your business has no offering with that id.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/offerings/[id]/route.ts',
  },
  {
    slug: 'add-departure',
    method: 'POST',
    host: 'api',
    path: '/v1/offerings/{id}/departures',
    status: 'live',
    group: 'Booking setup',
    title: 'Add or change a departure',
    summary: 'Add a tour departure or class, or change or close one.',
    description: [
      'Adds a departure to a tour or class: when it starts and ends, how many places, and whether customers can book it. To change one, send its departure_id and its version; published: false closes it to new bookings.',
      'Send the offering’s version as expected_version. The answer is the offering with its departures.',
      SETUP_DRY_RUN,
    ],
    auth: { kind: 'key', scope: 'catalogue_write', merchantBound: true },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The offering’s id: a tour or class.',
      },
      keyHeader('catalogue_write', SETUP_TEST_KEY),
      CHANGE_KEY,
    ],
    example: {
      path: { id: SAMPLE_TOUR.id },
      body: {
        expected_version: 1,
        starts_at: '2026-11-29T06:30:00+03:00',
        ends_at: '2026-11-29T10:30:00+03:00',
        capacity: 7,
        published: true,
      },
    },
    requestResources: [
      {
        title: 'Departure',
        at: 'body',
        fields: [
          { ...EXPECTED_VERSION_FIELD, description: 'The offering’s version.' },
          {
            name: 'departure_id',
            type: 'string',
            description: 'To change a departure. Leave it out to add one.',
          },
          {
            name: 'expected_departure_version',
            type: 'integer',
            description: 'The departure’s version, when changing one.',
          },
          { name: 'starts_at', type: 'timestamp', description: 'When it starts, with an offset.' },
          { name: 'ends_at', type: 'timestamp', description: 'When it ends.' },
          { name: 'capacity', type: 'integer', description: 'Seats or places.' },
          { name: 'published', type: 'boolean', description: 'false closes it to new bookings.' },
          {
            name: 'resource_ids',
            type: 'string[]',
            description: 'The guides or vehicles it uses. Defaults to the offering’s.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: { offering: SAMPLE_TOUR, applied: true },
      meta: { api_version: 'v1' },
    },
    responseResources: [...OFFERING_RESOURCES('data.offering'), SETUP_APPLIED],
    errors: [
      ...credentialErrors('catalogue_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, a field missing or out of range, or an offering that has no departures (only tours and classes do).',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'Your business has no offering with that id.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/offerings/[id]/departures/route.ts',
  },
  {
    slug: 'list-resources',
    method: 'GET',
    host: 'api',
    path: '/v1/resources',
    status: 'live',
    group: 'Booking setup',
    title: 'List your resources',
    summary: 'Your vehicles, rooms, guides and places, with their hours and closures.',
    description: [
      'Returns the resources your bookings hold: vehicles, rooms, guides, pools of places. Each has its working hours, the closures that have not ended, and its version for changes. A test key reads the same setup.',
    ],
    auth: { kind: 'key', scope: 'merchant_read', merchantBound: true },
    rateCost: 3,
    cache: 'no-store',
    paginated: false,
    params: [...KEY_REQUIRED_HEADERS],
    example: {},
    responseStatus: '200 OK',
    responseExample: { ok: true, data: { items: [SAMPLE_RESOURCE] }, meta: { api_version: 'v1' } },
    responseResources: RESOURCE_RESOURCES('data.items[]'),
    errors: [
      ...credentialErrors('merchant_read', false),
      { status: 403, code: 'not_found', when: 'The key is not bound to a merchant.' },
      {
        status: 503,
        code: 'internal_error',
        when: 'The booking engine did not answer. Retry with backoff.',
      },
      UNEXPECTED_ERROR,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/resources/route.ts',
  },
  {
    slug: 'close-resource',
    method: 'POST',
    host: 'api',
    path: '/v1/resources/{id}/closures',
    status: 'live',
    group: 'Booking setup',
    title: 'Close a resource for a time',
    summary: 'Mark a vehicle, room or guide as busy, so NexG takes no booking then.',
    description: [
      'Marks a resource as busy or closed between two times: a booking on your own website, maintenance, time off. NexG takes no booking that needs it then.',
      'A closure cannot cover a booking you have already accepted (409): decline or move that booking first. Send the version you read; the answer is the resource with its closures.',
      SETUP_DRY_RUN,
    ],
    auth: { kind: 'key', scope: 'catalogue_write', merchantBound: true },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The resource’s id, from List your resources.',
      },
      keyHeader('catalogue_write', SETUP_TEST_KEY),
      CHANGE_KEY,
    ],
    example: {
      path: { id: SAMPLE_RESOURCE.id },
      body: {
        expected_version: 5,
        starts_at: '2026-11-30T08:00:00+03:00',
        ends_at: '2026-11-30T12:00:00+03:00',
        reason: 'Booked on our own website',
      },
    },
    requestResources: [
      {
        title: 'Closure',
        at: 'body',
        fields: [
          EXPECTED_VERSION_FIELD,
          { name: 'starts_at', type: 'timestamp', description: 'When it starts, with an offset.' },
          { name: 'ends_at', type: 'timestamp', description: 'When it ends.' },
          {
            name: 'reason',
            type: 'string',
            description: 'Up to 300 characters. Your team sees it; customers never do.',
          },
        ],
      },
    ],
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: { resource: SAMPLE_RESOURCE, applied: true },
      meta: { api_version: 'v1' },
    },
    responseResources: [...RESOURCE_RESOURCES('data.resource'), SETUP_APPLIED],
    errors: [
      ...credentialErrors('catalogue_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, or a field missing or out of range.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'Your business has no resource with that id.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/resources/[id]/closures/route.ts',
  },
  {
    slug: 'reopen-resource',
    method: 'DELETE',
    host: 'api',
    path: '/v1/resources/{id}/closures/{closure_id}',
    status: 'live',
    group: 'Booking setup',
    title: 'Open a closed time again',
    summary: 'Remove a closure, so the time can be booked again.',
    description: [
      'Removes one of a resource’s closures. Send the resource’s version as ?expected_version= (a DELETE has no body). The answer is the resource with its remaining closures.',
      SETUP_DRY_RUN,
    ],
    auth: { kind: 'key', scope: 'catalogue_write', merchantBound: true },
    rateCost: 1,
    cache: 'no-store',
    paginated: false,
    params: [
      { name: 'id', in: 'path', type: 'string', required: true, description: 'The resource’s id.' },
      {
        name: 'closure_id',
        in: 'path',
        type: 'string',
        required: true,
        description: 'The closure’s id, from the resource.',
      },
      {
        name: 'expected_version',
        in: 'query',
        type: 'integer',
        required: true,
        description: 'The resource’s version you read.',
      },
      keyHeader('catalogue_write', SETUP_TEST_KEY),
      CHANGE_KEY,
    ],
    example: {
      path: { id: SAMPLE_RESOURCE.id, closure_id: SAMPLE_RESOURCE.closures[0]!.id },
      query: { expected_version: '6' },
    },
    responseStatus: '200 OK',
    responseExample: {
      ok: true,
      data: { resource: { ...SAMPLE_RESOURCE, closures: [], version: 7 }, applied: true },
      meta: { api_version: 'v1' },
    },
    responseResources: [...RESOURCE_RESOURCES('data.resource'), SETUP_APPLIED],
    errors: [
      ...credentialErrors('catalogue_write', false),
      {
        status: 400,
        code: 'invalid_request',
        when: 'No Idempotency-Key, or no expected_version in the query.',
      },
      {
        status: 403,
        code: 'not_found',
        when: 'The key is not bound to a merchant.',
      },
      { status: 404, code: 'not_found', when: 'No such resource or closure.' },
      ...ENGINE_ERRORS,
    ],
    warning: ENGINE_WARNING,
    knownIssues: ENGINE_ISSUES,
    since: '2026-11-27',
    source: 'apps/api/app/v1/resources/[id]/closures/[closure_id]/route.ts',
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
  'Reservations',
  'Booking setup',
  'Callbacks to NexG',
] as const;

export function endpointsInGroup(group: (typeof ENDPOINT_GROUPS)[number]): EndpointDoc[] {
  return ENDPOINTS.filter((endpoint) => endpoint.group === group);
}

/** The full URL a caller writes, with `{param}` placeholders left in. */
export function endpointUrl(endpoint: Pick<EndpointDoc, 'host' | 'path'>): string {
  return `${HOSTS[endpoint.host]}${endpoint.path}`;
}
