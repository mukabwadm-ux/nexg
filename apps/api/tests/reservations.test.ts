import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Reservations: GET /v1/reservations, GET /v1/reservations/{id} and the
 * engine's events (POST /internal/booking-events). Supabase is a fake that
 * answers the key lookup, the rate limiter and the ingest function; the
 * booking engine is a fake fetch. What the engine does is tested in
 * apps/booking-engine/tests/api-reservations.test.ts, and what the database
 * records in supabase/tests/262_api_reservation_events.sql.
 */

const { rpc, createClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { GET as list } from '../app/v1/reservations/route';
import { GET as one } from '../app/v1/reservations/[id]/route';
import { POST as ingest } from '../app/internal/booking-events/route';

const SECRET = 'bridge-secret-for-tests-0123456789abcdef';
const ENGINE = 'https://booking.test';
const MERCHANT_ID = '22222222-2222-4222-8222-222222222222';
const KEY_ID = '11111111-1111-4111-8111-111111111111';
const KEY = {
  key_id: KEY_ID,
  merchant_id: MERCHANT_ID,
  scopes: ['public_read', 'merchant_read'],
  rate_limit: 60,
  environment: 'live',
};

const SUMMARY = {
  id: '01a21c69-35e2-710e-98e3-6a142af6ded1',
  kind: 'reservation',
  status: 'confirmed',
  stage: 'confirmed',
  offering: { id: 'off-1', name: 'JKIA to Westlands', model: 'TRANSFER' },
  starts_at: '2026-11-28T03:30:00.000Z',
  ends_at: '2026-11-28T04:30:00.000Z',
  quantity: 3,
  payment_state: 'paid',
  version: 2,
  updated_at: '2026-11-27T09:14:05.221Z',
};
const RESERVATION = {
  ...SUMMARY,
  occurrence_id: null,
  resource_ids: ['van-1'],
  ticket_type: null,
  capacity_unit: 'place',
  guest_name: 'Amina',
  trip: {
    pickup_area: 'JKIA',
    pickup_address: 'Terminal 1A',
    dropoff_area: 'Westlands',
    dropoff_address: 'Woodvale Grove',
    flight_number: 'KQ 101',
  },
  service_location: null,
  notes: 'Two suitcases.',
  currency: 'KES',
  total_cents: 450000,
  paid_cents: 450000,
  checked_in_at: null,
  booked_on: 'nexg',
  created_at: '2026-11-27T09:02:44.903Z',
  driver: null,
  refund_state: null,
};
/** A sandbox reservation, as rpc_reservation_read_api_test answers it. */
const TEST_RESERVATION = {
  ...RESERVATION,
  id: '5b9e1c2d-3f4a-4b6c-8d7e-9f0a1b2c3d4e',
  offering: { ...RESERVATION.offering, id: null },
  resource_ids: [],
};

const fetchMock = vi.fn();

function keys(key: object = KEY) {
  rpc.mockImplementation(async (name: string, args: unknown) => {
    if (name === 'fn_api_key_lookup') return { data: [key], error: null };
    if (name === 'fn_api_request_spend') {
      return { data: [{ allowed: true, retry_after: 0, remaining: 55 }], error: null };
    }
    if (name === 'rpc_api_reservation_events_ingest') {
      const events = (args as { p_events: { event_key: string }[] }).p_events;
      return { data: { accepted: events.map((event) => event.event_key) }, error: null };
    }
    if (name === 'rpc_reservation_read_api_test') {
      return { data: { ok: true, items: [TEST_RESERVATION], next_cursor: null }, error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  });
}

function engineAnswers(status: number, body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const get = (path: string) =>
  new Request(`https://api.test${path}`, { headers: { 'x-api-key': 'a-reading-key' } });

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key');
  vi.stubEnv('API_TRUSTED_PROXY_IP_HEADER', '');
  vi.stubEnv('BOOKING_ENGINE_URL', ENGINE);
  vi.stubEnv('BOOKING_BRIDGE_SECRET', SECRET);
  vi.stubGlobal('fetch', fetchMock);
  createClient.mockReturnValue({ rpc });
  keys();
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  errorLog.mockRestore();
});

describe('GET /v1/reservations', () => {
  it('reads the key’s merchant’s reservations from the engine as NexG', async () => {
    engineAnswers(200, { items: [RESERVATION], next_cursor: 'bmV4dA' });

    const res = await list(get('/v1/reservations'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { items: [RESERVATION], next_cursor: 'bmV4dA' },
      meta: { api_version: 'v1', limit: 25 },
    });
    expect(res.headers.get('cache-control')).toBe('no-store');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${ENGINE}/v1/platform/reservations?limit=25`);
    const headers = init.headers as Record<string, string>;
    const context = headers['x-nexg-booking-context']!;
    expect(headers['x-nexg-booking-signature']).toBe(
      createHmac('sha256', SECRET).update(context).digest('hex'),
    );
    const claims = JSON.parse(Buffer.from(context, 'base64url').toString('utf8'));
    expect(claims).toMatchObject({
      businessId: MERCHANT_ID,
      role: 'platform',
      userId: `api_key_${KEY_ID}`,
    });
    expect(claims.expiresAt - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it('passes the cursor, the limit and updated_after on', async () => {
    engineAnswers(200, { items: [], next_cursor: null });

    const res = await list(
      get('/v1/reservations?limit=5&cursor=abc&updated_after=2026-11-27T08:00:00Z'),
    );

    expect(res.status).toBe(200);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '5',
      cursor: 'abc',
      updated_after: '2026-11-27T08:00:00Z',
    });
  });

  it('refuses a query it does not accept before asking the engine', async () => {
    for (const query of ['updated_after=yesterday', 'limit=0', 'status=confirmed']) {
      const res = await list(get(`/v1/reservations?${query}`));
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers a test key with its test reservations, without asking the engine', async () => {
    keys({ ...KEY, environment: 'test' });

    const res = await list(get('/v1/reservations?limit=10&updated_after=2026-11-27T08:00:00Z'));

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ items: [TEST_RESERVATION], next_cursor: null });
    expect(fetchMock).not.toHaveBeenCalled();
    const call = rpc.mock.calls.find(([name]) => name === 'rpc_reservation_read_api_test');
    expect(call?.[1]).toEqual({
      p_api_key: 'a-reading-key',
      p_limit: 10,
      p_cursor_updated_at: null,
      p_cursor_id: null,
      p_updated_after: '2026-11-27T08:00:00Z',
    });
  });

  it('refuses a key that is not bound to a merchant', async () => {
    keys({ ...KEY, merchant_id: null });

    const res = await list(get('/v1/reservations'));

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 while the engine is not configured or not answering', async () => {
    vi.stubEnv('BOOKING_BRIDGE_SECRET', '');
    expect((await list(get('/v1/reservations'))).status).toBe(503);

    vi.stubEnv('BOOKING_BRIDGE_SECRET', SECRET);
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect((await list(get('/v1/reservations'))).status).toBe(503);

    engineAnswers(500, { detail: 'down' });
    expect((await list(get('/v1/reservations'))).status).toBe(503);

    engineAnswers(401, { detail: 'Invalid session.' });
    expect((await list(get('/v1/reservations'))).status).toBe(503);
  });

  it('passes the engine’s refusal of a cursor on as 400', async () => {
    engineAnswers(400, { detail: 'That cursor was not issued here.' });

    const res = await list(get('/v1/reservations?cursor=nope'));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_request');
  });

  it('never passes on a field the contract does not have', async () => {
    engineAnswers(200, {
      items: [{ ...RESERVATION, guest_phone: '+254700000000' }],
      next_cursor: null,
    });

    const res = await list(get('/v1/reservations'));

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('+254700000000');
  });
});

describe('GET /v1/reservations/{id}', () => {
  const read = (id: string) => one(get(`/v1/reservations/${id}`), { params: { id } });

  it('reads one reservation from the engine', async () => {
    engineAnswers(200, RESERVATION);

    const res = await read(RESERVATION.id);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { reservation: RESERVATION },
      meta: { api_version: 'v1' },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${ENGINE}/v1/platform/reservations/${RESERVATION.id}`,
    );
  });

  it('answers 404 for a reservation the engine does not have for this merchant', async () => {
    engineAnswers(404, { detail: 'This record was not found.' });

    const res = await read('someone-elses');

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('refuses an id that is not a reservation id', async () => {
    const res = await read('a b');

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads a test key’s test reservation, without asking the engine', async () => {
    keys({ ...KEY, environment: 'test' });

    const res = await read(TEST_RESERVATION.id);

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ reservation: TEST_RESERVATION });
    expect(fetchMock).not.toHaveBeenCalled();

    const notOurs = await read('01a21c69-not-a-uuid');
    expect(notOurs.status).toBe(404);
  });
});

describe('POST /internal/booking-events', () => {
  const EVENT = {
    event_key: '01a21c69-4000-7000-8000-000000000001',
    event_type: 'booking.paid',
    business_id: MERCHANT_ID,
    record_id: SUMMARY.id,
    occurred_at: '2026-11-27T09:14:05.221Z',
    reservation: SUMMARY,
  };

  function signed(body: string, now = Date.now(), secret = SECRET) {
    const t = Math.floor(now / 1000);
    const v1 = createHmac('sha256', secret).update(`booking-events:${t}.${body}`).digest('hex');
    return new Request('https://api.test/internal/booking-events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-nexg-booking-events-signature': `t=${t},v1=${v1}`,
      },
      body,
    });
  }

  const ingested = () =>
    rpc.mock.calls.filter(([name]) => name === 'rpc_api_reservation_events_ingest');

  it('records signed events and answers which were accepted', async () => {
    const setup = {
      ...EVENT,
      event_key: 'setup-1',
      event_type: 'booking.resource.created',
      reservation: null,
    };
    const res = await ingest(signed(JSON.stringify({ events: [EVENT, setup] })));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: [EVENT.event_key, 'setup-1'], rejected: [] });
    expect(ingested()[0]?.[1]).toEqual({ p_events: [EVENT, setup] });
  });

  it('rejects a malformed event on its own and still records the rest', async () => {
    const broken = { ...EVENT, event_key: 'broken-1', reservation: { ...SUMMARY, status: 'lost' } };
    const res = await ingest(signed(JSON.stringify({ events: [EVENT, broken] })));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toEqual([EVENT.event_key]);
    expect(body.rejected).toEqual([
      { event_key: 'broken-1', reason: 'The event did not have the expected shape.' },
    ]);
    expect(ingested()[0]?.[1]).toEqual({ p_events: [EVENT] });
  });

  it('refuses a batch that is not signed with the bridge secret, or signed too long ago', async () => {
    const body = JSON.stringify({ events: [EVENT] });
    expect(
      (await ingest(signed(body, Date.now(), 'another-secret-of-enough-length-000'))).status,
    ).toBe(401);
    expect((await ingest(signed(body, Date.now() - 10 * 60_000))).status).toBe(401);
    const unsigned = new Request('https://api.test/internal/booking-events', {
      method: 'POST',
      body,
    });
    expect((await ingest(unsigned)).status).toBe(401);
    const tampered = signed(body);
    const forged = new Request(tampered.url, {
      method: 'POST',
      headers: tampered.headers,
      body: body.replace('booking.paid', 'booking.cancel'),
    });
    expect((await ingest(forged)).status).toBe(401);
    expect(ingested()).toHaveLength(0);
  });

  it('answers 503 so the engine sends again when it cannot record', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'rpc_api_reservation_events_ingest') {
        return { data: null, error: { message: 'timeout', code: '57014' } };
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    const res = await ingest(signed(JSON.stringify({ events: [EVENT] })));

    expect(res.status).toBe(503);
  });

  it('answers 503 when no bridge secret is set, and 400 for a batch it cannot read', async () => {
    vi.stubEnv('BOOKING_BRIDGE_SECRET', '');
    expect((await ingest(signed(JSON.stringify({ events: [EVENT] })))).status).toBe(503);

    vi.stubEnv('BOOKING_BRIDGE_SECRET', SECRET);
    expect((await ingest(signed('not json'))).status).toBe(400);
    expect((await ingest(signed(JSON.stringify({ events: [] })))).status).toBe(400);
    expect(ingested()).toHaveLength(0);
  });
});
