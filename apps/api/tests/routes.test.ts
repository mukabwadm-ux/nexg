import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Route-level tests for the 2026-11-10 fixes: limit, keyset paging,
 * unreadable cursors, search escaping, the experiences schema, unknown
 * cities, error statuses, the JSON envelope on crashes and GET
 * /v1/orders/{id}. Supabase is replaced by a fake that records every
 * query-builder call, so each test can check the filter a route sends.
 */

const { rpc, from, createClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { encodeCursor } from '../lib/http';
import { GET as listMerchants } from '../app/v1/catalog/merchants/route';
import { GET as getMerchant } from '../app/v1/catalog/merchants/[id]/route';
import { GET as listExperiences } from '../app/v1/experiences/route';
import { GET as listZones } from '../app/v1/zones/route';
import { GET as listServices } from '../app/v1/services/route';
import { GET as listOrders, POST as createOrder } from '../app/v1/orders/route';
import { GET as getOrder } from '../app/v1/orders/[id]/route';

type Result = { data: unknown; error: unknown };

/** A PostgREST query builder that records its calls and resolves to `result`. */
function fakeQuery(result: Result) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          calls.push([String(prop), args]);
          return builder;
        };
      },
    },
  );
  return { builder, calls };
}

const called = (calls: Array<[string, unknown[]]>, name: string) =>
  calls.filter(([method]) => method === name).map(([, args]) => args);

const MERCHANT = {
  id: '9b2f6c1e-4a7d-4c3b-8e21-5f0a7d3c9e14',
  trading_name: 'Sokoni Grill House',
  category: 'restaurant',
  category_other: null,
  cover_photo_path: null,
  featured: true,
  city_slug: 'nairobi',
  city_name: 'Nairobi',
  branch_name: 'Westlands',
  branch_address: 'Woodvale Grove, Westlands, Nairobi',
  branch_latitude: -1.2648,
  branch_longitude: 36.8027,
  listed_at: '2026-10-21T08:15:00.123456+00:00',
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

const EVENT = {
  id: '4c5d6e7f-8a9b-4c0d-9e1f-2a3b4c5d6e7f',
  city_id: 'c1a5e2d4-7b3f-4e8a-9c6d-2f1b0e4a8d37',
  name: 'RnB House',
  category: 'music',
  venue_name: null,
  venue_address: 'Westlands, Nairobi',
  starts_at: '2026-11-22T18:00:00+00:00',
  ends_at: null,
  doors_at: null,
  cover_path: null,
  featured: true,
  anchor_slot: 'night',
  organiser_name: null,
  organiser_url: null,
  ticket_url: null,
  ticket_bands: [
    { label: 'Regular', price_kes: 3500, currency: 'KES' },
    { label: 'VIP', price_kes: '8000' },
  ],
  nexg_can_hold_tickets: true,
  practical_note: null,
  suggested_blocks: [{ kind: 'meal', slot: 'evening', title: 'Dinner first' }],
};

const ORDER = {
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
};

const MERCHANT_KEY = {
  key_id: '11111111-1111-4111-8111-111111111111',
  merchant_id: '22222222-2222-4222-8222-222222222222',
  scopes: ['public_read', 'merchant_read'],
  rate_limit: 60,
};

/** Anonymous requests spend from the shared bucket; this one always has room. */
function allowRequests(orderRead?: (args: Record<string, unknown>) => Result) {
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'fn_api_key_lookup') return { data: [MERCHANT_KEY], error: null };
    if (name === 'fn_api_request_spend') {
      return { data: [{ allowed: true, retry_after: 0, remaining: 50 }], error: null };
    }
    if (name === 'rpc_order_read_api' && orderRead) return orderRead(args);
    throw new Error(`unexpected rpc ${name}`);
  });
}

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://api.test${path}`, { headers });
const keyed = (path: string) => get(path, { 'x-api-key': 'a-merchant-key' });

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key');
  vi.stubEnv('API_TRUSTED_PROXY_IP_HEADER', '');
  createClient.mockReturnValue({ rpc, from });
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  allowRequests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

describe('GET /v1/catalog/merchants', () => {
  it('accepts limit and fetches one extra row to see a next page', async () => {
    const { builder, calls } = fakeQuery({ data: [MERCHANT, MERCHANT], error: null });
    from.mockReturnValue(builder);

    const res = await listMerchants(get('/v1/catalog/merchants?limit=1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(called(calls, 'limit')).toEqual([[2]]);
    expect(body.meta.limit).toBe(1);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.next_cursor).toBe(encodeCursor(MERCHANT.listed_at, MERCHANT.id));
  });

  it('pages from the cursor’s (listed_at, id) as one row comparison', async () => {
    const { builder, calls } = fakeQuery({ data: [], error: null });
    from.mockReturnValue(builder);
    const cursor = encodeCursor(MERCHANT.listed_at, MERCHANT.id);

    const res = await listMerchants(get(`/v1/catalog/merchants?cursor=${cursor}`));

    expect(res.status).toBe(200);
    expect(called(calls, 'or')).toEqual([
      [
        `listed_at.lt.${MERCHANT.listed_at},and(listed_at.eq.${MERCHANT.listed_at},id.lt.${MERCHANT.id})`,
      ],
    ]);
    // The old filter compared the columns separately and skipped rows.
    expect(called(calls, 'lt')).toEqual([]);
  });

  it('refuses a cursor it did not issue instead of restarting at page one', async () => {
    const res = await listMerchants(get('/v1/catalog/merchants?cursor=not-a-cursor'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.fields.cursor).toBeTruthy();
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps commas and parentheses in a search as text', async () => {
    const { builder, calls } = fakeQuery({ data: [], error: null });
    from.mockReturnValue(builder);

    await listMerchants(get('/v1/catalog/merchants?q=Grill%2C%20(Westlands)%22'));

    const [[filter]] = called(calls, 'or') as [[string]];
    expect(filter).toBe(
      'trading_name.ilike."%Grill, (Westlands) %",branch_name.ilike."%Grill, (Westlands) %",category_other.ilike."%Grill, (Westlands) %"',
    );
  });

  it('answers a database failure with 500 and logs it with the request id', async () => {
    const { builder } = fakeQuery({ data: null, error: { message: 'relation is missing' } });
    from.mockReturnValue(builder);

    const res = await listMerchants(get('/v1/catalog/merchants'));
    const body = await res.json();
    const requestId = res.headers.get('x-request-id');

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('internal_error');
    // The database's own words stay in the log, never in the response.
    expect(JSON.stringify(body)).not.toContain('relation is missing');
    expect(String(errorLog.mock.calls[0]?.[0])).toContain(String(requestId));
  });

  it('keeps an unexpected crash inside the JSON envelope', async () => {
    // A row that fails the response schema throws inside the handler.
    const { builder } = fakeQuery({ data: [{ ...MERCHANT, featured: 'yes' }], error: null });
    from.mockReturnValue(builder);

    const res = await listMerchants(get('/v1/catalog/merchants'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ ok: false, error: { code: 'internal_error' } });
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(String(errorLog.mock.calls[0]?.[0])).toContain(String(res.headers.get('x-request-id')));
  });
});

describe('GET /v1/catalog/merchants/{id}', () => {
  it('answers an unknown merchant with 404', async () => {
    const { builder } = fakeQuery({ data: null, error: null });
    from.mockReturnValue(builder);

    const res = await getMerchant(get(`/v1/catalog/merchants/${MERCHANT.id}`), {
      params: { id: MERCHANT.id },
    });

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('answers a catalogue failure with 500', async () => {
    from.mockImplementation((table: string) =>
      table === 'merchant_public'
        ? fakeQuery({ data: MERCHANT, error: null }).builder
        : fakeQuery({ data: null, error: { message: 'timeout' } }).builder,
    );

    const res = await getMerchant(get(`/v1/catalog/merchants/${MERCHANT.id}`), {
      params: { id: MERCHANT.id },
    });

    expect(res.status).toBe(500);
  });
});

describe('GET /v1/experiences', () => {
  it('lists upcoming events as the database stores them', async () => {
    const { builder } = fakeQuery({ data: [EVENT], error: null });
    from.mockReturnValue(builder);

    const res = await listExperiences(get('/v1/experiences'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items[0].ticket_bands).toEqual([
      { label: 'Regular', price_kes: 3500, currency: 'KES' },
      { label: 'VIP', price_kes: 8000 },
    ]);
    expect(body.data.items[0].suggested_blocks).toEqual(EVENT.suggested_blocks);
  });

  it('leaves out an event it cannot read instead of failing the list', async () => {
    const broken = { ...EVENT, id: '5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a', ticket_bands: 'free' };
    const { builder } = fakeQuery({ data: [EVENT, broken], error: null });
    from.mockReturnValue(builder);

    const res = await listExperiences(get('/v1/experiences'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items.map((item: { id: string }) => item.id)).toEqual([EVENT.id]);
    expect(String(errorLog.mock.calls[0]?.[0])).toContain(broken.id);
  });

  it('returns an empty list for a city that does not exist', async () => {
    const events = fakeQuery({ data: [EVENT], error: null });
    const cities = fakeQuery({ data: null, error: null });
    from.mockImplementation((table: string) =>
      table === 'city' ? cities.builder : events.builder,
    );

    const res = await listExperiences(get('/v1/experiences?city=atlantis'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ items: [], next_cursor: null });
  });

  it('pages from the cursor’s (starts_at, id), soonest first', async () => {
    const { builder, calls } = fakeQuery({ data: [], error: null });
    from.mockReturnValue(builder);
    const cursor = encodeCursor(EVENT.starts_at, EVENT.id);

    await listExperiences(get(`/v1/experiences?cursor=${cursor}`));

    expect(called(calls, 'or')).toEqual([
      [`starts_at.gt.${EVENT.starts_at},and(starts_at.eq.${EVENT.starts_at},id.lt.${EVENT.id})`],
    ]);
    expect(called(calls, 'gt')).toEqual([]);
  });
});

describe('GET /v1/zones', () => {
  it('answers a database failure with 500', async () => {
    const { builder } = fakeQuery({ data: null, error: { message: 'down' } });
    from.mockReturnValue(builder);

    const res = await listZones(get('/v1/zones'));

    expect(res.status).toBe(500);
  });
});

describe('GET /v1/orders', () => {
  it('refuses a cursor it did not issue', async () => {
    const res = await listOrders(keyed('/v1/orders?cursor=bm90LWEtY3Vyc29y'));

    expect(res.status).toBe(400);
    expect(rpc.mock.calls.some(([name]) => name === 'rpc_order_read_api')).toBe(false);
  });

  it('passes a valid cursor and limit to the order read', async () => {
    allowRequests(() => ({ data: { ok: true, items: [ORDER], next_cursor: null }, error: null }));
    const cursor = encodeCursor(ORDER.created_at, ORDER.order_id);

    const res = await listOrders(keyed(`/v1/orders?limit=10&cursor=${cursor}`));

    expect(res.status).toBe(200);
    expect(rpc.mock.calls.find(([name]) => name === 'rpc_order_read_api')?.[1]).toEqual({
      p_api_key: 'a-merchant-key',
      p_limit: 10,
      p_cursor_created_at: ORDER.created_at,
      p_cursor_id: ORDER.order_id,
    });
  });
});

describe('GET /v1/orders/{id}', () => {
  const params = { params: { id: ORDER.order_id } };

  it('returns the order as data.order', async () => {
    allowRequests(() => ({ data: { ok: true, items: [ORDER], next_cursor: null }, error: null }));

    const res = await getOrder(keyed(`/v1/orders/${ORDER.order_id}`), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, data: { order: ORDER }, meta: { api_version: 'v1' } });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(rpc.mock.calls.find(([name]) => name === 'rpc_order_read_api')?.[1]).toEqual({
      p_api_key: 'a-merchant-key',
      p_order_id: ORDER.order_id,
    });
  });

  it('answers 404 for an order this merchant does not have', async () => {
    allowRequests(() => ({
      data: null,
      error: { message: 'That order does not exist.', code: '22023' },
    }));

    const res = await getOrder(keyed(`/v1/orders/${ORDER.order_id}`), params);

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('refuses an id that is not a UUID before reading anything', async () => {
    const res = await getOrder(keyed('/v1/orders/123'), { params: { id: '123' } });

    expect(res.status).toBe(400);
    expect(rpc.mock.calls.some(([name]) => name === 'rpc_order_read_api')).toBe(false);
  });

  it('refuses a request without a key', async () => {
    const res = await getOrder(get(`/v1/orders/${ORDER.order_id}`), params);

    expect(res.status).toBe(403);
  });
});

/*
 * Who may cache an answer (2026-11-11). Vercel's CDN answered cached public
 * URLs without running the route, so a key sent as X-Api-Key was never
 * checked there. Answers to requests without a key stay shareable and vary on
 * the credential headers; answers to requests with a key are never stored
 * and say how many tokens are left.
 */
describe('who may cache an answer', () => {
  const merchantParams = { params: { id: MERCHANT.id } };
  const publicReads: Array<[string, (request: Request) => Promise<Response>, string, string]> = [
    [
      '/v1/catalog/merchants',
      (r) => listMerchants(r),
      'public, s-maxage=60, stale-while-revalidate=300',
      'list',
    ],
    [
      `/v1/catalog/merchants/${MERCHANT.id}`,
      (r) => getMerchant(r, merchantParams),
      'public, s-maxage=60, stale-while-revalidate=300',
      'merchant',
    ],
    [
      '/v1/experiences',
      (r) => listExperiences(r),
      'public, s-maxage=60, stale-while-revalidate=300',
      'list',
    ],
    ['/v1/zones', (r) => listZones(r), 'public, s-maxage=300, stale-while-revalidate=3600', 'list'],
    [
      '/v1/services',
      (r) => listServices(r),
      'public, s-maxage=300, stale-while-revalidate=3600',
      'list',
    ],
  ];

  function serve(kind: string) {
    from.mockImplementation((table: string) =>
      kind === 'merchant' && table === 'merchant_public'
        ? fakeQuery({ data: MERCHANT, error: null }).builder
        : fakeQuery({ data: [], error: null }).builder,
    );
  }

  it.each(publicReads)(
    '%s without a key is shareable and varies on the key',
    async (path, route, cache, kind) => {
      serve(kind);

      const res = await route(get(path));

      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe(cache);
      expect(res.headers.get('vary')).toBe('X-Api-Key, Authorization');
      expect(res.headers.get('ratelimit-remaining')).toBeNull();
    },
  );

  it.each(publicReads)(
    '%s with a key is never stored and reports the tokens left',
    async (path, route, _cache, kind) => {
      serve(kind);

      const res = await route(keyed(path));

      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('vary')).toBe('X-Api-Key, Authorization');
      expect(res.headers.get('ratelimit-remaining')).toBe('50');
      expect(rpc.mock.calls.some(([name]) => name === 'fn_api_key_lookup')).toBe(true);
    },
  );

  it('reports the tokens left on order reads', async () => {
    allowRequests(() => ({ data: { ok: true, items: [ORDER], next_cursor: null }, error: null }));

    const list = await listOrders(keyed('/v1/orders'));
    const one = await getOrder(keyed(`/v1/orders/${ORDER.order_id}`), {
      params: { id: ORDER.order_id },
    });

    for (const res of [list, one]) {
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('ratelimit-remaining')).toBe('50');
    }
  });

  it('leaves the header out when the limiter does not report a count', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'fn_api_key_lookup') return { data: [MERCHANT_KEY], error: null };
      if (name === 'fn_api_request_spend') {
        return { data: [{ allowed: true, retry_after: 0 }], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    serve('list');

    const res = await listZones(keyed('/v1/zones'));

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('ratelimit-remaining')).toBeNull();
  });
});

/*
 * POST /v1/orders: booking a service (2026-11-14). The database function
 * resolves the key, prices the booking and stores the Idempotency-Key with
 * the order; the route checks the scope, the header and the body, and turns
 * the function's refusals into statuses.
 */
describe('POST /v1/orders', () => {
  const WRITER_KEY = {
    ...MERCHANT_KEY,
    scopes: ['public_read', 'merchant_read', 'merchant_write'],
  };
  const RECEIPT = {
    order_id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    reference: 'NX-261114-0012',
    service: 'airport_transfer',
    quantity: 2,
    total_cents: 450000,
    currency: 'KES',
    payment_method: 'on_account',
    scheduled_for: '2026-11-14T03:30:00+00:00',
  };
  const BOOKING = {
    service: 'airport_transfer',
    quantity: 2,
    pickup_label: 'JKIA Terminal 1A',
    pickup_lat: -1.3192,
    pickup_lng: 36.9278,
    dropoff_label: 'Woodvale Grove, Westlands, Nairobi',
    dropoff_lat: -1.2648,
    dropoff_lng: 36.8027,
    scheduled_for: '2026-11-14T06:30:00+03:00',
    passengers: [{ name: 'Amina Wekesa', flight: 'KQ 101' }],
  };

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://api.test/v1/orders', {
      method: 'POST',
      headers: {
        'x-api-key': 'a-merchant-key',
        'idempotency-key': 'booking-2026-11-14-0001',
        'content-type': 'application/json',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  /** A key that may book; `place` answers for the booking function. */
  function allowBookings(
    place: (args: Record<string, unknown>) => Result,
    key: Record<string, unknown> = WRITER_KEY,
  ) {
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'fn_api_key_lookup') return { data: [key], error: null };
      if (name === 'fn_api_request_spend') {
        return { data: [{ allowed: true, retry_after: 0, remaining: 45 }], error: null };
      }
      if (name === 'rpc_order_place_api') return place(args);
      throw new Error(`unexpected rpc ${name}`);
    });
  }
  const placeCalls = () => rpc.mock.calls.filter(([name]) => name === 'rpc_order_place_api');
  const placed = () => ({ data: { ok: true, ...RECEIPT }, error: null });

  it('books a service and answers 201 with the receipt', async () => {
    allowBookings(placed);

    const res = await createOrder(post(BOOKING));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ ok: true, data: { booking: RECEIPT }, meta: { api_version: 'v1' } });
    expect(res.headers.get('location')).toBe(`/v1/orders/${RECEIPT.order_id}`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('ratelimit-remaining')).toBe('45');
    expect(placeCalls()).toHaveLength(1);
    expect(placeCalls()[0]?.[1]).toEqual({
      p_api_key: 'a-merchant-key',
      p_idempotency_key: 'booking-2026-11-14-0001',
      p_payload: { ...BOOKING, payment_method: 'on_account' },
    });
    const spend = rpc.mock.calls.find(([name]) => name === 'fn_api_request_spend')?.[1];
    expect(spend).toMatchObject({ p_operation: 'merchant_write' });
  });

  it('refuses a key without merchant_write, and a key bound to no merchant', async () => {
    // The default key from allowRequests() reads but cannot book.
    const res = await createOrder(post(BOOKING));

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('not_found');

    allowBookings(placed, { ...WRITER_KEY, merchant_id: null });
    const unbound = await createOrder(post(BOOKING));

    expect(unbound.status).toBe(403);
    expect(placeCalls()).toHaveLength(0);
  });

  it.each(['', 'too-short'])(
    'needs an Idempotency-Key of 16 to 128 characters (%j)',
    async (idempotencyKey) => {
      allowBookings(placed);

      const res = await createOrder(post(BOOKING, { 'idempotency-key': idempotencyKey }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.fields['Idempotency-Key']).toBeTruthy();
      expect(placeCalls()).toHaveLength(0);
    },
  );

  it('refuses a body that is not JSON', async () => {
    allowBookings(placed);

    const res = await createOrder(post('{ not json'));

    expect(res.status).toBe(400);
    expect(placeCalls()).toHaveLength(0);
  });

  it.each([
    ['a price', { ...BOOKING, total_cents: 0 }],
    ['another payment method', { ...BOOKING, payment_method: 'mpesa_stk' }],
    ['a quantity over 60', { ...BOOKING, quantity: 61 }],
    ['a time without an offset', { ...BOOKING, scheduled_for: '2026-11-14T06:30:00' }],
  ])('refuses %s before the database sees it', async (_label, body) => {
    allowBookings(placed);

    const res = await createOrder(post(body));
    const answer = await res.json();

    expect(res.status).toBe(400);
    expect(answer.error.code).toBe('invalid_request');
    expect(Object.keys(answer.error.fields ?? {}).length).toBeGreaterThan(0);
    expect(placeCalls()).toHaveLength(0);
  });

  it.each([
    ['22023', 'That service is not one we offer.', 400],
    ['22023', 'Where are we collecting from?', 400],
    ['42501', 'This merchant is not live.', 403],
    ['42501', 'That API key is not valid.', 401],
    ['P0001', 'That service is not priced yet. Our team has to set it up first.', 400],
  ])('passes on the database refusal %s "%s" as %i', async (code, message, status) => {
    allowBookings(() => ({ data: null, error: { code, message } }));

    const res = await createOrder(post(BOOKING));
    const body = await res.json();

    expect(res.status).toBe(status);
    expect(body.error.message).toBe(message);
  });

  it('answers any other database failure with a logged 500', async () => {
    allowBookings(() => ({ data: null, error: { code: 'P0001', message: 'audit chain broken' } }));

    const res = await createOrder(post(BOOKING));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.message).not.toContain('audit');
    expect(errorLog).toHaveBeenCalled();
  });

  it('asks once more when two requests race on the same key', async () => {
    let calls = 0;
    allowBookings(() =>
      ++calls === 1
        ? { data: null, error: { code: '23505', message: 'duplicate key value' } }
        : placed(),
    );

    const res = await createOrder(post(BOOKING));

    expect(res.status).toBe(201);
    expect(placeCalls()).toHaveLength(2);
  });

  it('answers 500 when the receipt cannot be read back', async () => {
    allowBookings(() => ({ data: { ok: true, ...RECEIPT, order_id: 'not-a-uuid' }, error: null }));

    const res = await createOrder(post(BOOKING));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.message).toContain('same Idempotency-Key');
  });
});
