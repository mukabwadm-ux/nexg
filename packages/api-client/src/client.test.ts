import { afterEach, describe, expect, it, vi } from 'vitest';

import { NexgClient } from './client.js';
import { NexgApiError, NexgConnectionError } from './errors.js';

/*
 * The client against a fake fetch: what it sends, what it returns, and when
 * it tries again. Waits are real but short (Retry-After of one second at
 * most), so a few tests take a second.
 */

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function fakeFetch(...answers: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers as Record<string, string>) },
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
    });
    const next = answers.shift();
    if (!next) throw new Error('no more answers');
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const ok = (data: unknown) => json(200, { ok: true, data, meta: { api_version: 'v1' } });
const apiError = (status: number, code: string, message: string, extra: object = {}) =>
  json(status, { ok: false, error: { code, message, ...extra }, meta: { api_version: 'v1' } });

const ZONE = { id: 'z1', city_id: 'c1', name: 'Kilimani', tier: 'core', eta_min: 20, eta_max: 30 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a request', () => {
  it('sends the key and returns the answer’s data', async () => {
    const { fetch, calls } = fakeFetch(ok({ items: [ZONE], next_cursor: null }));
    const nexg = new NexgClient({ apiKey: 'nexg_test_key', fetch });

    expect(await nexg.zones.list()).toEqual({ items: [ZONE], next_cursor: null });
    expect(calls[0]).toMatchObject({
      url: 'https://api.nexgapp.com/v1/zones',
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Api-Key': 'nexg_test_key' },
    });
  });

  it('works without a key, for public reads', async () => {
    const { fetch, calls } = fakeFetch(ok({ items: [], next_cursor: null }));
    await new NexgClient({ fetch }).services.list();
    expect(calls[0]?.headers).not.toHaveProperty('X-Api-Key');
  });

  it('builds the query string and leaves out what is not set', async () => {
    const { fetch, calls } = fakeFetch(ok({ items: [], next_cursor: null }));
    const nexg = new NexgClient({ fetch, baseUrl: 'https://api.example.test/' });

    await nexg.merchants.list({ city: 'nairobi', q: undefined, limit: 10 });

    expect(calls[0]?.url).toBe(
      'https://api.example.test/v1/catalog/merchants?city=nairobi&limit=10',
    );
  });

  it('sends a body as JSON', async () => {
    const { fetch, calls } = fakeFetch(ok({ items: [], applied: true }));
    const nexg = new NexgClient({ apiKey: 'k', fetch });

    await nexg.catalogue.updateMany([
      { id: 'a', price_kes: 1250 },
      { id: 'b', available: false },
    ]);

    expect(calls[0]).toMatchObject({
      url: 'https://api.nexgapp.com/v1/catalog/items',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({
      items: [
        { id: 'a', price_kes: 1250 },
        { id: 'b', available: false },
      ],
    });
  });

  it('escapes ids in paths', async () => {
    const { fetch, calls } = fakeFetch(ok({ order: {} }));
    await new NexgClient({ apiKey: 'k', fetch }).orders.get('a/b');
    expect(calls[0]?.url).toBe('https://api.nexgapp.com/v1/orders/a%2Fb');
  });
});

describe('an error answer', () => {
  it('becomes a NexgApiError with the code, the fields and the request id', async () => {
    const { fetch } = fakeFetch(
      apiError(400, 'invalid_request', 'Send items.', {
        fields: { 'items.0.price_kes': 'Whole shillings.' },
      }),
    );
    const nexg = new NexgClient({ apiKey: 'k', fetch });

    const error = await nexg.catalogue
      .updateMany([{ id: 'a', price_kes: 0 }])
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NexgApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'invalid_request',
      message: 'Send items.',
      fields: { 'items.0.price_kes': 'Whole shillings.' },
    });
  });

  it('keeps the request id, to quote when reporting a problem', async () => {
    const { fetch } = fakeFetch(
      json(
        404,
        { ok: false, error: { code: 'not_found', message: 'Order not found' } },
        { 'X-Request-Id': 'req-1' },
      ),
    );
    const error = await new NexgClient({ apiKey: 'k', fetch }).orders
      .get('x')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 404, code: 'not_found', requestId: 'req-1' });
  });

  it('is still a NexgApiError when the body is not JSON', async () => {
    const { fetch } = fakeFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = await new NexgClient({ fetch, maxRetries: 0 }).zones
      .list()
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, code: 'internal_error' });
  });

  it('is not retried when the request itself is wrong', async () => {
    const { fetch, calls } = fakeFetch(apiError(400, 'invalid_request', 'No.'));
    await expect(new NexgClient({ fetch }).zones.list()).rejects.toBeInstanceOf(NexgApiError);
    expect(calls).toHaveLength(1);
  });
});

describe('retries', () => {
  it('waits out a 429 for Retry-After, then tries again', async () => {
    const { fetch, calls } = fakeFetch(
      json(
        429,
        { ok: false, error: { code: 'rate_limited', message: 'Slow down.' } },
        { 'Retry-After': '1' },
      ),
      ok({ items: [], next_cursor: null }),
    );
    const nexg = new NexgClient({ fetch });

    const started = Date.now();
    await nexg.zones.list();

    expect(calls).toHaveLength(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it('gives a 429 to the caller when Retry-After is longer than a minute', async () => {
    const { fetch, calls } = fakeFetch(
      json(
        429,
        { ok: false, error: { code: 'rate_limited', message: 'Slow down.' } },
        { 'Retry-After': '120' },
      ),
    );
    const error = await new NexgClient({ fetch }).zones.list().catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429, code: 'rate_limited', retryAfter: 120 });
    expect(calls).toHaveLength(1);
  });

  it('tries a safe call again after a server error, and stops at maxRetries', async () => {
    const { fetch, calls } = fakeFetch(
      apiError(503, 'internal_error', 'Busy.'),
      apiError(503, 'internal_error', 'Busy.'),
    );
    const error = await new NexgClient({ fetch, maxRetries: 1 }).zones
      .list()
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 503 });
    expect(calls).toHaveLength(2);
  });

  it('does not repeat a sandbox move after a server error', async () => {
    const { fetch, calls } = fakeFetch(apiError(503, 'internal_error', 'Busy.'));
    const nexg = new NexgClient({ apiKey: 'nexg_test_k', fetch });
    await expect(nexg.sandbox.moveOrder('o1', { status: 'confirmed' })).rejects.toMatchObject({
      status: 503,
    });
    expect(calls).toHaveLength(1);
  });

  it('books with one Idempotency-Key across retries, so a retry cannot book twice', async () => {
    const receipt = { booking: { order_id: 'o1' } };
    const { fetch, calls } = fakeFetch(apiError(503, 'internal_error', 'Busy.'), ok(receipt));
    const nexg = new NexgClient({ apiKey: 'nexg_test_k', fetch });

    expect(await nexg.orders.create({ service: 'courier' })).toEqual(receipt);

    expect(calls).toHaveLength(2);
    const keys = calls.map((c) => c.headers['Idempotency-Key']);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it('uses the caller’s Idempotency-Key when given one', async () => {
    const { fetch, calls } = fakeFetch(ok({ booking: {} }));
    await new NexgClient({ apiKey: 'k', fetch }).orders.create(
      { service: 'courier' },
      { idempotencyKey: 'my-booking-000042' },
    );
    expect(calls[0]?.headers['Idempotency-Key']).toBe('my-booking-000042');
  });

  it('tries again after a dropped connection, then reports it', async () => {
    const { fetch, calls } = fakeFetch(
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
    );
    const error = await new NexgClient({ fetch, maxRetries: 1 }).zones
      .list()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NexgConnectionError);
    expect((error as NexgConnectionError).cause).toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(2);
  });

  it('gives up on an attempt that takes longer than timeoutMs', async () => {
    const hanging = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof globalThis.fetch;
    const nexg = new NexgClient({ fetch: hanging, timeoutMs: 50, maxRetries: 0 });
    await expect(nexg.zones.list()).rejects.toBeInstanceOf(NexgConnectionError);
  });
});

describe('pages', () => {
  it('listAll walks next_cursor until the last page', async () => {
    const { fetch, calls } = fakeFetch(
      ok({ items: [{ id: 1 }, { id: 2 }], next_cursor: 'abc' }),
      ok({ items: [{ id: 3 }], next_cursor: null }),
    );
    const nexg = new NexgClient({ fetch });

    const seen: unknown[] = [];
    for await (const merchant of nexg.merchants.listAll({ city: 'nairobi', limit: 2 })) {
      seen.push(merchant);
    }

    expect(seen).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(calls.map((c) => new URL(c.url).search)).toEqual([
      '?city=nairobi&limit=2',
      '?city=nairobi&limit=2&cursor=abc',
    ]);
  });
});

describe('keys', () => {
  it('refuses a key in a browser, where anyone could read it', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    expect(() => new NexgClient({ apiKey: 'live-key' })).toThrow(/belong on your server/);
    expect(() => new NexgClient({ fetch: fakeFetch().fetch })).not.toThrow();
  });
});
