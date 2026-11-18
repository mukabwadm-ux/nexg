import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * GET /v1/catalog/items and PATCH /v1/catalog/items/{id}: a merchant's own
 * catalogue through the API. Supabase is replaced by a fake that answers
 * the key lookup, the rate limiter and the two catalogue functions, and
 * records what was called.
 */

const { rpc, createClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { GET as listItems } from '../app/v1/catalog/items/route';
import { PATCH as updateItem } from '../app/v1/catalog/items/[id]/route';

type Result = { data: unknown; error: unknown };

const ITEM_ID = '6e9f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b';
const MERCHANT_ID = '22222222-2222-4222-8222-222222222222';
const ITEM = {
  id: ITEM_ID,
  merchant_id: MERCHANT_ID,
  section_id: '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
  name: 'Grilled tilapia',
  description: 'Whole fish, lemon and chilli, sukuma wiki',
  price_kes: 1250,
  available: false,
  age_restricted: false,
  highlighted: true,
  sort: 1,
};
const KEY = {
  key_id: '11111111-1111-4111-8111-111111111111',
  merchant_id: MERCHANT_ID,
  scopes: ['public_read', 'catalogue_write'],
  rate_limit: 60,
  environment: 'live',
};

/** The key the lookup returns, and the catalogue functions' answer. */
function answer(fn: (name: string, args: Record<string, unknown>) => Result, key: object = KEY) {
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'fn_api_key_lookup') return { data: [key], error: null };
    if (name === 'fn_api_request_spend') {
      return { data: [{ allowed: true, retry_after: 0, remaining: 59 }], error: null };
    }
    if (name.startsWith('rpc_catalogue_')) return fn(name, args);
    throw new Error(`unexpected rpc ${name}`);
  });
}
const calls = (name: string) => rpc.mock.calls.filter(([n]) => n === name);
const spentAs = () =>
  (rpc.mock.calls.find(([n]) => n === 'fn_api_request_spend')?.[1] as { p_operation?: string })
    ?.p_operation;

const patch = (body: unknown, id = ITEM_ID) =>
  updateItem(
    new Request(`https://api.test/v1/catalog/items/${id}`, {
      method: 'PATCH',
      headers: { 'x-api-key': 'a-catalogue-key', 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: { id } },
  );
const list = () =>
  listItems(
    new Request('https://api.test/v1/catalog/items', { headers: { 'x-api-key': 'a-key' } }),
  );

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key');
  vi.stubEnv('API_TRUSTED_PROXY_IP_HEADER', '');
  createClient.mockReturnValue({ rpc });
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

describe('PATCH /v1/catalog/items/{id}', () => {
  it('changes the item and answers with it', async () => {
    answer(() => ({ data: { ok: true, applied: true, item: ITEM }, error: null }));

    const res = await patch({ price_kes: 1250, available: false });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { item: ITEM, applied: true },
      meta: { api_version: 'v1' },
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('nexg-environment')).toBe('live');
    expect(calls('rpc_catalogue_item_update_api')[0]?.[1]).toEqual({
      p_api_key: 'a-catalogue-key',
      p_item_id: ITEM_ID,
      p_changes: { price_kes: 1250, available: false },
    });
    expect(spentAs()).toBe('catalogue_write');
  });

  it('says when a test key saved nothing', async () => {
    answer(() => ({ data: { ok: true, applied: false, item: ITEM }, error: null }), {
      ...KEY,
      environment: 'test',
    });

    const res = await patch({ available: false });

    expect(res.status).toBe(200);
    expect((await res.json()).data.applied).toBe(false);
    expect(res.headers.get('nexg-environment')).toBe('test');
  });

  it('refuses a key without catalogue_write, and a key bound to no merchant', async () => {
    answer(() => ({ data: null, error: null }), {
      ...KEY,
      scopes: ['public_read', 'merchant_read'],
    });
    expect((await patch({ price_kes: 1300 })).status).toBe(403);

    answer(() => ({ data: null, error: null }), { ...KEY, merchant_id: null });
    const unbound = await patch({ price_kes: 1300 });
    expect(unbound.status).toBe(403);
    expect((await unbound.json()).error.message).toMatch(/not bound to a merchant/);

    expect(calls('rpc_catalogue_item_update_api')).toHaveLength(0);
  });

  it('refuses a malformed request before asking the database', async () => {
    answer(() => ({ data: null, error: null }));

    const badId = await patch({ price_kes: 1300 }, 'tilapia');
    expect(badId.status).toBe(400);
    expect((await badId.json()).error.fields).toHaveProperty('id');

    const notJson = await patch('price=1300');
    expect(notJson.status).toBe(400);

    const empty = await patch({});
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.fields).toEqual({
      body: 'Send price_kes, available, or both.',
    });

    const fraction = await patch({ price_kes: 12.5 });
    expect((await fraction.json()).error.fields).toEqual({
      price_kes: 'Whole shillings, from 1 to 1,000,000.',
    });

    const text = await patch({ price_kes: '1300' });
    expect((await text.json()).error.fields).toEqual({
      price_kes: 'Whole shillings, from 1 to 1,000,000.',
    });

    const other = await patch({ price_kes: 1300, name: 'Tilapia' });
    expect((await other.json()).error.fields).toEqual({
      name: 'Not a field this endpoint takes: only price_kes and available change here.',
    });

    expect(calls('rpc_catalogue_item_update_api')).toHaveLength(0);
  });

  it('answers another merchant’s item, or a missing one, with 404', async () => {
    answer(() => ({ data: null, error: { code: 'P0002', message: 'No such item.' } }));

    const res = await patch({ price_kes: 1300 });

    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatchObject({
      code: 'not_found',
      message: 'Item not found',
    });
  });

  it('passes the database’s own refusals on', async () => {
    answer(() => ({
      data: null,
      error: { code: '22023', message: 'price_kes is whole shillings, from 1 to 1,000,000.' },
    }));
    expect((await patch({ price_kes: 1300 })).status).toBe(400);

    answer(() => ({ data: null, error: { code: '42501', message: 'That API key is not valid.' } }));
    expect((await patch({ price_kes: 1300 })).status).toBe(401);

    answer(() => ({ data: null, error: { code: 'XX000', message: 'boom' } }));
    const failed = await patch({ price_kes: 1300 });
    expect(failed.status).toBe(500);
    expect((await failed.json()).error.message).toBe('The item could not be updated.');
  });
});

describe('GET /v1/catalog/items', () => {
  it('lists the merchant’s items, sold-out ones included', async () => {
    answer(() => ({ data: { ok: true, items: [ITEM] }, error: null }));

    const res = await list();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { items: [ITEM] },
      meta: { api_version: 'v1' },
    });
    expect(calls('rpc_catalogue_items_api')[0]?.[1]).toEqual({ p_api_key: 'a-key' });
    expect(spentAs()).toBe('catalogue_write');
  });

  it('lets a merchant_read key list too, at the order-read price', async () => {
    answer(() => ({ data: { ok: true, items: [] }, error: null }), {
      ...KEY,
      scopes: ['public_read', 'merchant_read'],
    });

    expect((await list()).status).toBe(200);
    expect(spentAs()).toBe('merchant_read');
  });

  it('refuses a public_read key without spending its tokens', async () => {
    answer(() => ({ data: null, error: null }), { ...KEY, scopes: ['public_read'] });

    expect((await list()).status).toBe(403);
    expect(calls('fn_api_request_spend')).toHaveLength(0);
    expect(calls('rpc_catalogue_items_api')).toHaveLength(0);
  });
});
