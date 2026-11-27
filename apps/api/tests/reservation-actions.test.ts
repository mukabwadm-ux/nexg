import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The booking engine routes that change things: accept, decline and driver on
 * reservations, the booking setup (offerings, departures, closures), and the
 * sandbox (test reservations). Supabase is a fake for the key lookup, the
 * rate limiter and the sandbox functions; the engine is a fake fetch. The
 * engine's own rules are tested in apps/booking-engine/tests/api-platform.test.ts
 * and the sandbox's in supabase/tests/263_api_test_reservations.sql.
 */

const { rpc, createClient } = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { POST as accept } from '../app/v1/reservations/[id]/accept/route';
import { POST as decline } from '../app/v1/reservations/[id]/decline/route';
import { PUT as driver } from '../app/v1/reservations/[id]/driver/route';
import { POST as cancel } from '../app/v1/reservations/[id]/cancel/route';
import { POST as checkIn } from '../app/v1/reservations/check-in/route';
import { POST as createReservation } from '../app/v1/reservations/route';
import { GET as offerings, POST as createOffering } from '../app/v1/offerings/route';
import { PATCH as updateOffering } from '../app/v1/offerings/[id]/route';
import { DELETE as reopen } from '../app/v1/resources/[id]/closures/[closure_id]/route';
import { POST as createTest } from '../app/v1/test/reservations/route';
import { POST as moveTest } from '../app/v1/test/reservations/[id]/status/route';

const SECRET = 'bridge-secret-for-tests-0123456789abcdef';
const ENGINE = 'https://booking.test';
const MERCHANT_ID = '22222222-2222-4222-8222-222222222222';
const KEY_ID = '11111111-1111-4111-8111-111111111111';
const KEY = {
  key_id: KEY_ID,
  merchant_id: MERCHANT_ID,
  scopes: ['public_read', 'merchant_read', 'merchant_write', 'catalogue_write'],
  rate_limit: 60,
  environment: 'live',
};
const ID = '01a21c69-35e2-710e-98e3-6a142af6ded1';
const CHANGE = 'change-0123456789abcdef';

const RESERVATION = {
  id: ID,
  kind: 'reservation',
  status: 'confirmed',
  stage: 'confirmed',
  offering: { id: 'off-1', name: 'JKIA to Westlands', model: 'TRANSFER' },
  starts_at: '2026-11-28T03:30:00.000Z',
  ends_at: '2026-11-28T04:30:00.000Z',
  quantity: 3,
  payment_state: 'paid',
  version: 3,
  updated_at: '2026-11-27T09:14:05.221Z',
  occurrence_id: null,
  resource_ids: ['van-1'],
  ticket_type: null,
  capacity_unit: 'place',
  guest_name: 'Amina',
  trip: null,
  service_location: null,
  notes: null,
  currency: 'KES',
  total_cents: 450000,
  paid_cents: 450000,
  checked_in_at: null,
  booked_on: 'nexg',
  created_at: '2026-11-27T09:02:44.903Z',
  driver: {
    first_name: 'Juma',
    vehicle: 'White Toyota Noah',
    plate: 'KDA 123A',
    assigned_at: null,
    location: null,
  },
  refund_state: null,
};
const OFFERING = {
  id: 'off-1',
  name: 'JKIA to Westlands',
  model: 'TRANSFER',
  active: true,
  booking_enabled: true,
  currency: 'KES',
  price_cents: 450000,
  pricing_basis: 'per_booking',
  duration_minutes: 60,
  capacity: null,
  capacity_unit: 'place',
  resource_ids: ['van-1'],
  version: 4,
  departures: [],
};
const RESOURCE = {
  id: 'van-1',
  name: 'Van one',
  kind: 'vehicle',
  quantity: 1,
  active: true,
  schedule: { days: [1, 2, 3], start: '04:00', end: '23:00' },
  closures: [],
  version: 7,
};

const fetchMock = vi.fn();

function keys(key: object = KEY, sandboxAnswer?: (name: string, args: unknown) => unknown) {
  rpc.mockImplementation(async (name: string, args: unknown) => {
    if (name === 'fn_api_key_lookup') return { data: [key], error: null };
    if (name === 'fn_api_request_spend') {
      return { data: [{ allowed: true, retry_after: 0, remaining: 55 }], error: null };
    }
    if (sandboxAnswer && name.startsWith('rpc_reservation_')) return sandboxAnswer(name, args);
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

function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://api.test${path}`, {
    method,
    headers: {
      'x-api-key': 'a-changing-key',
      'idempotency-key': CHANGE,
      'content-type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const engineCall = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n]!;
  return {
    url: url as string,
    method: init.method as string,
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
};

/** The signed context the API sent the engine, decoded. */
const context = (call: { headers: Record<string, string> }) =>
  JSON.parse(
    Buffer.from(call.headers['x-nexg-booking-context']!, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;

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

describe('reservation actions with a live key', () => {
  it('accepts through the engine as the key’s merchant, with the Idempotency-Key', async () => {
    engineAnswers(200, RESERVATION);

    const res = await accept(
      send('POST', `/v1/reservations/${ID}/accept`, { expected_version: 2 }),
      {
        params: { id: ID },
      },
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ reservation: RESERVATION });
    const call = engineCall();
    expect(call.url).toBe(`${ENGINE}/v1/platform/reservations/${ID}/accept`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ expected_version: 2 });
    expect(call.headers['idempotency-key']).toBe(CHANGE);
    const context = call.headers['x-nexg-booking-context']!;
    expect(call.headers['x-nexg-booking-signature']).toBe(
      createHmac('sha256', SECRET).update(context).digest('hex'),
    );
    expect(JSON.parse(Buffer.from(context, 'base64url').toString())).toMatchObject({
      businessId: MERCHANT_ID,
      role: 'platform',
      userId: `api_key_${KEY_ID}`,
    });
  });

  it('needs an Idempotency-Key and the version read', async () => {
    const noKey = await accept(
      send(
        'POST',
        `/v1/reservations/${ID}/accept`,
        { expected_version: 2 },
        { 'idempotency-key': '' },
      ),
      { params: { id: ID } },
    );
    expect(noKey.status).toBe(400);
    const noVersion = await accept(send('POST', `/v1/reservations/${ID}/accept`, {}), {
      params: { id: ID },
    });
    expect(noVersion.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the engine’s refusal on as 409 with its message', async () => {
    engineAnswers(409, {
      detail: 'Only a booking that is still waiting and unpaid can be declined.',
    });

    const res = await decline(
      send('POST', `/v1/reservations/${ID}/decline`, { expected_version: 3, reason: 'Busy' }),
      { params: { id: ID } },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toContain('still waiting and unpaid');
  });

  it('refuses a driver with a phone number before asking the engine', async () => {
    const res = await driver(
      send('PUT', `/v1/reservations/${ID}/driver`, {
        expected_version: 3,
        driver: { first_name: 'Juma', vehicle: 'Noah', phone: '0700000000' },
      }),
      { params: { id: ID } },
    );

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets a driver, and reads an engine without drivers as no driver', async () => {
    const { driver: _, ...older } = RESERVATION;
    engineAnswers(200, older);

    const res = await driver(
      send('PUT', `/v1/reservations/${ID}/driver`, {
        expected_version: 3,
        driver: { first_name: 'Juma', vehicle: 'White Toyota Noah', plate: 'KDA 123A' },
      }),
      { params: { id: ID } },
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data.reservation.driver).toBeNull();
    expect(engineCall().method).toBe('PUT');
    expect(engineCall().url).toBe(`${ENGINE}/v1/platform/reservations/${ID}/driver`);
  });
});

describe('running bookings from the business’s system', () => {
  it('records a booking taken by phone, and answers 201', async () => {
    engineAnswers(201, { ...RESERVATION, booked_on: 'merchant', driver: null });

    const res = await createReservation(
      send('POST', '/v1/reservations', {
        offering_id: 'off-1',
        starts_at: '2026-11-28T06:30:00+03:00',
        guest: { name: 'Amina', phone: '+254700000000' },
        trip: {
          pickup_area: 'JKIA',
          pickup_address: 'Terminal 1A',
          flight_number: 'KQ101',
        },
      }),
    );

    expect(res.status).toBe(201);
    expect((await res.json()).data.reservation.booked_on).toBe('merchant');
    expect(engineCall().url).toBe(`${ENGINE}/v1/platform/reservations`);
    expect(engineCall().body.guest).toEqual({ name: 'Amina', phone: '+254700000000' });
  });

  it('needs the guest’s email or phone before asking the engine', async () => {
    const res = await createReservation(
      send('POST', '/v1/reservations', { offering_id: 'off-1', guest: { name: 'Amina' } }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks a customer in and never answers with the code', async () => {
    engineAnswers(200, {
      ...RESERVATION,
      status: 'in_progress',
      checked_in_at: '2026-11-28T03:41:10.502Z',
    });

    const res = await checkIn(
      send('POST', '/v1/reservations/check-in', { code: 'K7M2QX', name: 'Amina' }),
    );

    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('K7M2QX');
    expect(engineCall().url).toBe(`${ENGINE}/v1/platform/reservations/check-in`);
  });

  it('cancels with a reason, and test keys are refused steps the sandbox cannot do', async () => {
    engineAnswers(200, { ...RESERVATION, status: 'cancelled', refund_state: 'review_required' });
    const cancelled = await cancel(
      send('POST', `/v1/reservations/${ID}/cancel`, { expected_version: 3, reason: 'Broke down' }),
      { params: { id: ID } },
    );
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).data.reservation.refund_state).toBe('review_required');

    keys({ ...KEY, environment: 'test' });
    const test = await cancel(
      send('POST', `/v1/reservations/${ID}/cancel`, { expected_version: 3, reason: 'Broke down' }),
      { params: { id: ID } },
    );
    expect(test.status).toBe(403);
  });
});

describe('reservation actions with a test key', () => {
  it('acts on the test reservation in the sandbox, never the engine', async () => {
    const TEST = { ...RESERVATION, id: '5b9e1c2d-3f4a-4b6c-8d7e-9f0a1b2c3d4e', driver: null };
    keys({ ...KEY, environment: 'test' }, () => ({
      data: { ok: true, reservation: TEST },
      error: null,
    }));

    const res = await driver(
      send('PUT', `/v1/reservations/${TEST.id}/driver`, { expected_version: 1, driver: null }),
      { params: { id: TEST.id } },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const call = rpc.mock.calls.find(([name]) => name === 'rpc_reservation_act_api_test');
    expect(call?.[1]).toEqual({
      p_api_key: 'a-changing-key',
      p_id: TEST.id,
      p_action: 'driver',
      p_input: { expected_version: 1, driver: null },
    });
  });

  it('turns the sandbox’s refusals into the API’s errors', async () => {
    keys({ ...KEY, environment: 'test' }, () => ({
      data: null,
      error: { message: 'The reservation changed.', code: 'P0005' },
    }));
    const id = '5b9e1c2d-3f4a-4b6c-8d7e-9f0a1b2c3d4e';
    const res = await accept(
      send('POST', `/v1/reservations/${id}/accept`, { expected_version: 9 }),
      {
        params: { id },
      },
    );
    expect(res.status).toBe(409);
  });
});

describe('the booking setup', () => {
  it('lists offerings from the engine', async () => {
    engineAnswers(200, { items: [OFFERING] });

    const res = await offerings(
      new Request('https://api.test/v1/offerings', { headers: { 'x-api-key': 'k' } }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ items: [OFFERING] });
    expect(engineCall().url).toBe(`${ENGINE}/v1/platform/offerings`);
  });

  it('changes a price with a live key that has catalogue_write', async () => {
    engineAnswers(200, { ...OFFERING, price_cents: 500000, version: 5 });

    const res = await updateOffering(
      send('PATCH', '/v1/offerings/off-1', { expected_version: 4, price_cents: 500000 }),
      { params: { id: 'off-1' } },
    );

    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.offering.price_cents).toBe(500000);
    expect(data.applied).toBe(true);
    expect(engineCall().method).toBe('PATCH');
    expect(engineCall().body).toEqual({ expected_version: 4, price_cents: 500000 });
    expect(context(engineCall()).sandbox).toBeUndefined();
  });

  it('sends a test key’s change as a dry run, and says nothing was saved', async () => {
    keys({ ...KEY, environment: 'test' });
    engineAnswers(200, { ...OFFERING, active: false, version: 5 });
    const tried = await updateOffering(
      send('PATCH', '/v1/offerings/off-1', { expected_version: 4, active: false }),
      { params: { id: 'off-1' } },
    );
    expect(tried.status).toBe(200);
    const data = (await tried.json()).data;
    expect(data).toEqual({ offering: { ...OFFERING, active: false, version: 5 }, applied: false });
    // The engine is told, in the signed context, that this is a test key.
    expect(context(engineCall())).toMatchObject({
      businessId: MERCHANT_ID,
      userId: `api_key_${KEY_ID}`,
      role: 'platform',
      sandbox: true,
    });

    fetchMock.mockClear();
    engineAnswers(201, { ...OFFERING, id: 'off-2', version: 1 });
    const made = await createOffering(
      send('POST', '/v1/offerings', {
        name: 'City run',
        model: 'APPOINTMENT',
        price_cents: 350000,
        resource_ids: ['van-1'],
      }),
    );
    expect(made.status).toBe(201);
    expect((await made.json()).data.applied).toBe(false);
    expect(context(engineCall()).sandbox).toBe(true);
  });

  it('refuses a key without catalogue_write, and an empty change', async () => {
    keys({ ...KEY, scopes: ['merchant_read', 'merchant_write'] });
    const scoped = await updateOffering(
      send('PATCH', '/v1/offerings/off-1', { expected_version: 4, active: false }),
      { params: { id: 'off-1' } },
    );
    expect(scoped.status).toBe(403);

    keys();
    const empty = await updateOffering(
      send('PATCH', '/v1/offerings/off-1', { expected_version: 4 }),
      {
        params: { id: 'off-1' },
      },
    );
    expect(empty.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens a closed time with the version in the query', async () => {
    engineAnswers(200, RESOURCE);

    const missing = await reopen(send('DELETE', '/v1/resources/van-1/closures/c-1'), {
      params: { id: 'van-1', closure_id: 'c-1' },
    });
    expect(missing.status).toBe(400);

    const res = await reopen(
      send('DELETE', '/v1/resources/van-1/closures/c-1?expected_version=6'),
      {
        params: { id: 'van-1', closure_id: 'c-1' },
      },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ resource: RESOURCE, applied: true });
    expect(engineCall().method).toBe('DELETE');
    expect(engineCall().url).toBe(
      `${ENGINE}/v1/platform/resources/van-1/closures/c-1?expected_version=6`,
    );
  });

  it('answers 404 when the engine has no such offering', async () => {
    engineAnswers(404, { detail: 'This record was not found.' });
    const res = await updateOffering(
      send('PATCH', '/v1/offerings/nope', { expected_version: 1, active: true }),
      { params: { id: 'nope' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('test reservations', () => {
  const TEST = {
    ...RESERVATION,
    id: '5b9e1c2d-3f4a-4b6c-8d7e-9f0a1b2c3d4e',
    status: 'requested',
    stage: 'pending',
    offering: { id: null, name: 'Test transfer', model: 'TRANSFER' },
    trip: {
      pickup_area: 'JKIA',
      pickup_address: null,
      dropoff_area: null,
      dropoff_address: null,
      flight_number: null,
    },
    driver: null,
  };

  it('makes one with a test key, with the trip in the live shape', async () => {
    keys({ ...KEY, environment: 'test' }, () => ({
      data: { ok: true, reservation: TEST },
      error: null,
    }));

    const res = await createTest(
      send('POST', '/v1/test/reservations', { trip: { pickup_area: 'JKIA' } }),
    );

    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({ reservation: TEST });
    const call = rpc.mock.calls.find(([name]) => name === 'rpc_reservation_create_api_test');
    expect(call?.[1]).toEqual({
      p_api_key: 'a-changing-key',
      p_reservation: {
        trip: {
          pickup_area: 'JKIA',
          pickup_address: null,
          dropoff_area: null,
          dropoff_address: null,
          flight_number: null,
        },
      },
    });
  });

  it('refuses a live key', async () => {
    const res = await createTest(send('POST', '/v1/test/reservations', {}));
    expect(res.status).toBe(403);
  });

  it('moves one forward and refuses moving it back', async () => {
    keys({ ...KEY, environment: 'test' }, () => ({
      data: {
        ok: true,
        reservation: { ...TEST, status: 'confirmed' },
        previous_status: 'requested',
      },
      error: null,
    }));
    const moved = await moveTest(
      send('POST', `/v1/test/reservations/${TEST.id}/status`, { status: 'confirmed' }),
      { params: { id: TEST.id } },
    );
    expect(moved.status).toBe(200);
    expect((await moved.json()).data.previous_status).toBe('requested');

    keys({ ...KEY, environment: 'test' }, () => ({
      data: null,
      error: { message: 'A test reservation moves forward only.', code: 'P0005' },
    }));
    const back = await moveTest(
      send('POST', `/v1/test/reservations/${TEST.id}/status`, { status: 'confirmed' }),
      { params: { id: TEST.id } },
    );
    expect(back.status).toBe(409);
  });
});
