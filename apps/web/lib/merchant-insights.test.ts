import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildInsights } from '../components/merchant/insights/model';
import { liveInsightsRange, loadMerchantInsights } from './merchant-insights';

const mocked = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./supabase/server', () => ({ createClient: mocked.createClient }));

type Result = { data: unknown; error: { message: string } | null; count?: number | null };
type Call = { table: string; method: string; args: unknown[] };
type State = {
  user: { id: string } | null;
  home: Result;
  access: Result;
  tables: Record<string, Result>;
  calls: Call[];
};
const RANGE = { from: '2026-10-04', to: '2026-10-31' };
const filters = { ...RANGE, locationId: 'all', activity: 'all' as const, keyword: '' };

function fakeSource(): State {
  const state: State = {
    user: { id: 'user-1' },
    home: { data: { kind: 'merchant', id: 'merchant-1', name: 'Karibu Kitchen' }, error: null },
    access: { data: { state: 'legacy', setup: true, operations: true }, error: null },
    calls: [],
    tables: {
      merchant_user: { data: { role: 'owner', branches: null, caps: {} }, error: null },
      merchant: {
        data: { id: 'merchant-1', trading_name: 'Karibu Kitchen', subcategory: 'restaurant' },
        error: null,
      },
      merchant_branch: {
        data: [
          { id: 'branch-1', name: 'Karen' },
          { id: 'branch-2', name: 'Kilimani' },
        ],
        error: null,
      },
      catalogue_item: {
        data: [{ id: 'global-other', name: 'Other catalogue item' }],
        count: 1,
        error: null,
      },
      order: {
        data: [
          {
            id: 'order-1',
            reference: 'ORD-1',
            branch_id: 'branch-1',
            stage: 'refunded',
            currency: 'KES',
            placed_at: '2026-10-03T21:10:00Z',
            confirmed_at: '2026-10-03T21:12:00Z',
            ready_at: '2026-10-03T21:25:00Z',
            promised_ready_at: '2026-10-03T21:30:00Z',
            delivered_at: '2026-10-30T21:30:00Z',
            cancelled_at: null,
            cancel_reason_code: null,
            scheduled_for: null,
            subtotal_cents: 100000,
            total_cents: 999999,
          },
        ],
        count: 1,
        error: null,
      },
      order_item: {
        data: [
          {
            id: 'line-1',
            order_id: 'order-1',
            catalogue_item_id: 'item-1',
            name: 'Rice bowl',
            quantity: 2,
            line_total_cents: 100000,
          },
        ],
        count: 1,
        error: null,
      },
    },
  };
  mocked.createClient.mockImplementation(() => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    rpc: async (name: string) => (name === 'fn_partner_home' ? state.home : state.access),
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'is', 'or', 'order', 'limit', 'maybeSingle'])
        query[method] = (...args: unknown[]) => {
          state.calls.push({ table, method, args });
          return query;
        };
      query.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(
          state.tables[table] || { data: null, error: { message: 'Unexpected table' } },
        ).then(resolve, reject);
      return query;
    },
  }));
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T05:00:00Z'));
  mocked.createClient.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('live Insights period boundaries', () => {
  it('uses the last 28 completed Nairobi dates rather than the server timezone', () => {
    expect(liveInsightsRange()).toEqual(RANGE);
    expect(liveInsightsRange({}, new Date('2026-10-31T22:30:00Z'))).toEqual(RANGE);
  });

  it.each([
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-10-31', to: '2026-10-04' },
    { to: 'not-a-date' },
    { from: '2026-11-02', to: '2026-11-03' },
    { from: '2025-10-30', to: '2026-10-31' },
  ])('rejects an invalid or unbounded date request before querying auth: %o', async (range) => {
    fakeSource();
    await expect(loadMerchantInsights(range)).rejects.toMatchObject({ status: 400 });
    expect(mocked.createClient).not.toHaveBeenCalled();
  });
});

describe('server-resolved merchant access', () => {
  it('denies pending and unavailable workspace access before reading any reporting source', async () => {
    const source = fakeSource();
    source.access = {
      data: {
        state: 'pending',
        setup: true,
        operations: false,
        expires_at: '2026-11-02T05:00:00Z',
      },
      error: null,
    };
    await expect(loadMerchantInsights(RANGE)).rejects.toMatchObject({ status: 403 });
    expect(source.calls).toEqual([]);
    source.access = { data: null, error: { message: 'Unavailable' } };
    await expect(loadMerchantInsights(RANGE)).rejects.toMatchObject({ status: 503 });
    expect(source.calls).toEqual([]);
  });

  it('fails closed for an unauthenticated request without reading a business table', async () => {
    const source = fakeSource();
    source.user = null;
    await expect(loadMerchantInsights(RANGE)).rejects.toMatchObject({ status: 401 });
    expect(source.calls).toEqual([]);
  });

  it('does not turn an identity read failure into an empty report or a permission result', async () => {
    const source = fakeSource();
    source.home = { data: null, error: { message: 'Source unavailable' } };
    await expect(loadMerchantInsights(RANGE)).rejects.toMatchObject({ status: 503 });
    expect(source.calls).toEqual([]);
  });

  it('does not grant an undeclared reporting permission to a manager', async () => {
    const source = fakeSource();
    source.tables.merchant_user!.data = {
      role: 'manager',
      branches: null,
      caps: { see_money: true },
    };
    await expect(loadMerchantInsights(RANGE)).rejects.toMatchObject({ status: 403 });
    expect(source.calls.some((call) => call.table === 'order')).toBe(false);
  });

  it('uses authenticated merchant/user IDs and preserves branch restrictions throughout source loading', async () => {
    const source = fakeSource();
    source.tables.merchant_user!.data = { role: 'owner', branches: ['branch-1'], caps: {} };
    const { snapshot, policy } = await loadMerchantInsights(RANGE);
    expect(policy.allowedLocationIds).toEqual(['branch-1']);
    expect(snapshot.locations).toEqual([{ id: 'branch-1', label: 'Karen' }]);
    expect(source.calls).toContainEqual({
      table: 'merchant_user',
      method: 'eq',
      args: ['user_id', 'user-1'],
    });
    expect(source.calls).toContainEqual({
      table: 'order',
      method: 'eq',
      args: ['merchant_id', 'merchant-1'],
    });
    expect(source.calls).toContainEqual({
      table: 'order',
      method: 'in',
      args: ['branch_id', ['branch-1']],
    });
    expect(snapshot.offerings.map((row) => row.id)).toEqual(['item-1']);
    expect(snapshot.offerings.some((row) => row.label === 'Other catalogue item')).toBe(false);
  });

  it('does not interpret an explicit empty branch scope as all locations', async () => {
    const source = fakeSource();
    source.tables.merchant_user!.data = { role: 'owner', branches: [], caps: {} };
    const { snapshot, policy } = await loadMerchantInsights(RANGE);
    expect(policy.canRead).toBe(false);
    expect(snapshot.status).toBe('unavailable');
    expect(source.calls.some((call) => call.table === 'order')).toBe(false);
  });
});

describe('live reporting evidence', () => {
  it('retains recorded completion after refund and never uses the customer charge envelope as merchant item sales', async () => {
    const source = fakeSource();
    const { snapshot, policy } = await loadMerchantInsights(RANGE);
    expect(snapshot.records[0]).toMatchObject({
      outcome: 'completed',
      requestedOn: '2026-10-04',
      completedOn: '2026-10-31',
      itemAmountMinor: 100000,
    });
    expect(snapshot.records[0]).not.toHaveProperty('customerId');
    expect(snapshot.records[0]).not.toHaveProperty('startedAt');
    expect(policy.canReadCustomers).toBe(false);
    const selected = source.calls.find((call) => call.table === 'order' && call.method === 'select')
      ?.args[0];
    expect(
      String(selected)
        .split(',')
        .map((field) => field.trim()),
    ).not.toContain('total_cents');
    expect(selected).not.toContain('guest_id');
    const view = buildInsights(snapshot, filters, policy);
    expect(view.metrics.order_completed?.value).toBe(1);
    expect(view.metrics.order_item_sales?.value).toBe(100000);
    expect(view.metrics.preparation_median?.value).toBeNull();
    expect(view.metrics.merchant_credits?.status).toBe('unavailable');
    expect(snapshot.postings).toEqual([]);
    const interval = source.calls.find((call) => call.table === 'order' && call.method === 'or')
      ?.args[0];
    expect(interval).toContain('2026-09-05T21:00:00.000Z');
    expect(interval).toContain('2026-10-31T21:00:00.000Z');
  });

  it('distinguishes a successful empty configured ORDER report from a failed read', async () => {
    const source = fakeSource();
    source.tables.order = { data: [], count: 0, error: null };
    const empty = await loadMerchantInsights(RANGE);
    expect(empty.snapshot.status).toBe('ready');
    expect(buildInsights(empty.snapshot, filters, empty.policy).metrics.work_requested?.value).toBe(
      0,
    );
    source.tables.order = { data: null, error: { message: 'Connection failed' } };
    const failed = await loadMerchantInsights(RANGE);
    expect(failed.snapshot.status).toBe('unavailable');
    expect(
      buildInsights(failed.snapshot, filters, failed.policy).metrics.work_requested?.value,
    ).toBeNull();
  });

  it('marks bounded evidence partial instead of presenting a page as a full-business total', async () => {
    const source = fakeSource();
    source.tables.order!.count = 1002;
    const { snapshot, policy } = await loadMerchantInsights(RANGE);
    expect(snapshot.status).toBe('partial');
    const view = buildInsights(snapshot, filters, policy);
    expect(view.metrics.order_completed?.status).toBe('partial');
    expect(snapshot.notice).toContain('incomplete');
  });

  it('does not describe a failed catalogue read as an unconfigured or empty business', async () => {
    const source = fakeSource();
    source.tables.catalogue_item = { data: null, error: { message: 'Catalogue unavailable' } };
    source.tables.order = { data: [], count: 0, error: null };
    const { snapshot } = await loadMerchantInsights(RANGE);
    expect(snapshot.status).toBe('unavailable');
    expect(snapshot.enabledModels).toEqual([]);
    expect(snapshot.notice).toContain('Catalogue configuration could not be read');
    expect(snapshot.notice).not.toContain('No actual legacy order catalogue');
  });

  it('keeps independent work evidence available when item reads fail', async () => {
    const source = fakeSource();
    source.tables.order_item = { data: null, error: { message: 'Items unavailable' } };
    const { snapshot, policy } = await loadMerchantInsights(RANGE);
    const view = buildInsights(snapshot, filters, policy);
    expect(view.metrics.order_completed?.value).toBe(1);
    expect(view.metrics.order_units?.status).toBe('unavailable');
    expect(view.metrics.order_units?.value).toBeNull();
  });

  it('does not turn other-currency item amounts into KES', async () => {
    const source = fakeSource();
    (source.tables.order!.data as { currency: string }[])[0]!.currency = 'USD';
    const { snapshot, policy } = await loadMerchantInsights(RANGE);
    expect(snapshot.records[0]!.itemAmountMinor).toBeNull();
    expect(snapshot.lineItems[0]!.itemAmountMinor).toBeNull();
    expect(buildInsights(snapshot, filters, policy).metrics.order_item_sales?.value).toBeNull();
  });

  it('marks today as partial while preserving closed-day coverage', async () => {
    fakeSource();
    const { snapshot } = await loadMerchantInsights({ from: '2026-10-05', to: '2026-11-01' });
    expect(snapshot.coverage).toContainEqual(
      expect.objectContaining({
        kind: 'work',
        from: '2026-11-01',
        to: '2026-11-01',
        status: 'partial',
      }),
    );
    expect(snapshot.coverage).toContainEqual(
      expect.objectContaining({ kind: 'work', to: '2026-10-31', status: 'ready' }),
    );
  });
});
