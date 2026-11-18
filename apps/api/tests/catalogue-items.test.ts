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

import { GET as listItems, PATCH as updateItems } from '../app/v1/catalog/items/route';
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
const patchMany = (body: unknown) =>
  updateItems(
    new Request('https://api.test/v1/catalog/items', {
      method: 'PATCH',
      headers: { 'x-api-key': 'a-catalogue-key', 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
const OTHER_ID = '7f0a3b4c-5d6e-4f70-8b9c-0d1e2f3a4b5c';
const OTHER_ITEM = { ...ITEM, id: OTHER_ID, name: 'Nyama choma platter', price_kes: 1800 };
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

describe('PATCH /v1/catalog/items', () => {
  it('changes many items in one call and answers with them, in order', async () => {
    answer(() => ({ data: { ok: true, applied: true, items: [ITEM, OTHER_ITEM] }, error: null }));

    const res = await patchMany({
      items: [
        { id: ITEM_ID, price_kes: 1250 },
        { id: OTHER_ID, available: false },
      ],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { items: [ITEM, OTHER_ITEM], applied: true },
      meta: { api_version: 'v1' },
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(calls('rpc_catalogue_items_update_api')[0]?.[1]).toEqual({
      p_api_key: 'a-catalogue-key',
      p_items: [
        { id: ITEM_ID, price_kes: 1250 },
        { id: OTHER_ID, available: false },
      ],
    });
    expect(spentAs()).toBe('catalogue_write');
    expect(calls('fn_api_request_spend')).toHaveLength(1);
  });

  it('says when a test key saved nothing', async () => {
    answer(() => ({ data: { ok: true, applied: false, items: [ITEM] }, error: null }), {
      ...KEY,
      environment: 'test',
    });

    const res = await patchMany({ items: [{ id: ITEM_ID, available: false }] });

    expect(res.status).toBe(200);
    expect((await res.json()).data.applied).toBe(false);
    expect(res.headers.get('nexg-environment')).toBe('test');
  });

  it('names every id the merchant does not have, and says nothing was changed', async () => {
    answer(() => ({
      data: {
        ok: false,
        missing: [
          { index: 1, id: OTHER_ID },
          { index: 2, id: '99999999-9999-4999-8999-999999999999' },
        ],
      },
      error: null,
    }));

    const res = await patchMany({
      items: [
        { id: ITEM_ID, price_kes: 1250 },
        { id: OTHER_ID, available: false },
        { id: '99999999-9999-4999-8999-999999999999', price_kes: 10 },
      ],
    });

    expect(res.status).toBe(404);
    const { error } = await res.json();
    expect(error.code).toBe('not_found');
    expect(error.message).toMatch(/2 of these ids, so nothing was changed/);
    expect(error.fields).toEqual({
      'items.1.id': 'Your merchant has no item with this id.',
      'items.2.id': 'Your merchant has no item with this id.',
    });
  });

  it('refuses a malformed list before asking the database', async () => {
    answer(() => ({ data: null, error: null }));
    const fields = async (body: unknown) => {
      const res = await patchMany(body);
      expect(res.status).toBe(400);
      return (await res.json()).error.fields;
    };

    expect(await fields('items')).toHaveProperty('body');
    expect(await fields({})).toEqual({ items: 'A list of changes.' });
    expect(await fields({ items: [] })).toEqual({ items: 'Send from 1 to 100 items.' });
    expect(
      await fields({
        items: Array.from({ length: 101 }, (_, n) => ({
          id: '00000000-0000-4000-8000-' + String(n).padStart(12, '0'),
          price_kes: 100,
        })),
      }),
    ).toEqual({ items: 'Send from 1 to 100 items.' });
    expect(
      await fields({
        items: [
          { id: ITEM_ID, price_kes: 1250 },
          { id: ITEM_ID.toUpperCase(), available: false },
        ],
      }),
    ).toEqual({ 'items.1.id': 'Already in this list at items.0. Each item can appear once.' });
    expect(await fields({ items: [{ id: ITEM_ID, price_kes: 10, name: 'Tilapia' }] })).toEqual({
      'items.0.name': 'Not a field an item takes: only id, price_kes and available.',
    });
    expect(await fields({ items: [{ id: ITEM_ID }] })).toEqual({
      'items.0': 'Send price_kes, available, or both.',
    });
    expect(await fields({ items: [{ id: ITEM_ID, price_kes: 12.5 }] })).toEqual({
      'items.0.price_kes': 'Whole shillings, from 1 to 1,000,000.',
    });
    expect(await fields({ items: [{ id: 'tilapia', price_kes: 10 }] })).toEqual({
      'items.0.id': 'An item id is a UUID: the id from GET /v1/catalog/items.',
    });
    expect(await fields({ items: [{ id: ITEM_ID, price_kes: 10 }], dry_run: true })).toEqual({
      dry_run: 'Not a field this endpoint takes: only items.',
    });

    expect(calls('rpc_catalogue_items_update_api')).toHaveLength(0);
  });

  it('refuses a key without catalogue_write, and a key bound to no merchant', async () => {
    answer(() => ({ data: null, error: null }), {
      ...KEY,
      scopes: ['public_read', 'merchant_read'],
    });
    expect((await patchMany({ items: [{ id: ITEM_ID, price_kes: 10 }] })).status).toBe(403);
    expect(calls('fn_api_request_spend')).toHaveLength(0);

    answer(() => ({ data: null, error: null }), { ...KEY, merchant_id: null });
    const unbound = await patchMany({ items: [{ id: ITEM_ID, price_kes: 10 }] });
    expect(unbound.status).toBe(403);
    expect((await unbound.json()).error.message).toMatch(/not bound to a merchant/);

    expect(calls('rpc_catalogue_items_update_api')).toHaveLength(0);
  });

  it('passes the database’s own refusals on, and hides its failures', async () => {
    const body = { items: [{ id: ITEM_ID, price_kes: 10 }] };
    answer(() => ({
      data: null,
      error: { code: '22023', message: 'Each item can appear only once in a call.' },
    }));
    expect((await patchMany(body)).status).toBe(400);

    answer(() => ({ data: null, error: { code: '42501', message: 'That API key is not valid.' } }));
    expect((await patchMany(body)).status).toBe(401);

    answer(() => ({ data: null, error: { code: 'XX000', message: 'relation is broken' } }));
    const failed = await patchMany(body);
    expect(failed.status).toBe(500);
    const text = await failed.text();
    expect(text).toContain('The items could not be updated.');
    expect(text).not.toContain('broken');
  });
});
