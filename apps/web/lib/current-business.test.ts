import { describe, expect, it } from 'vitest';

import {
  businessLabel,
  listBusinesses,
  mayChooseBusiness,
  resolveCurrentBusiness,
} from './current-business';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown> | null;

/** Just enough of the Supabase client for these reads. */
function client(tables: { role?: string | null; merchant?: Row; list?: unknown[] }) {
  const reads: string[] = [];
  const fake = {
    reads,
    from(table: string) {
      reads.push(table);
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'merchant_user')
            return { data: tables.role ? { role: tables.role } : null, error: null };
          return { data: tables.merchant ?? null, error: null };
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: tables.list ?? [], error: null }).then(resolve),
      };
      return builder;
    },
    rpc: async () => ({ data: { pct: 64 }, error: null }),
  };
  return fake as unknown as Parameters<typeof resolveCurrentBusiness>[0] & { reads: string[] };
}

const home = { kind: 'merchant', id: A, name: 'First', status: 'live', home: '/merchant' };
const second = {
  id: B,
  trading_name: 'Second',
  legal_name: null,
  status: 'under_review',
  submitted_at: '2026-11-20T00:00:00Z',
};

describe('the current business', () => {
  it('opens the chosen business when this user owns or manages it', async () => {
    for (const role of ['owner', 'manager']) {
      const result = await resolveCurrentBusiness(client({ role, merchant: second }), 'u', home, B);
      expect(result).toMatchObject({
        kind: 'merchant',
        id: B,
        name: 'Second',
        status: 'under_review',
        pct: 64,
        submitted: true,
        home: '/merchant',
      });
    }
  });

  it("keeps the database's pick for a business that is not theirs to open", async () => {
    for (const role of [null, 'cashier', 'staff']) {
      const result = await resolveCurrentBusiness(client({ role, merchant: second }), 'u', home, B);
      expect(result).toBe(home);
    }
  });

  it('reads nothing when there is no choice, or the choice is already current', async () => {
    const none = client({ role: 'owner', merchant: second });
    expect(await resolveCurrentBusiness(none, 'u', home, null)).toBe(home);
    expect(await resolveCurrentBusiness(none, 'u', home, A)).toBe(home);
    expect(none.reads).toEqual([]);
  });

  it('never turns staff, riders or hosts into a merchant', async () => {
    for (const kind of ['staff', 'rider', 'host', 'guest']) {
      const other = { kind, home: '/' };
      const result = await resolveCurrentBusiness(
        client({ role: 'owner', merchant: second }),
        'u',
        other,
        B,
      );
      expect(result).toBe(other);
    }
  });

  it('only lets an owner or manager choose a business', async () => {
    expect(await mayChooseBusiness(client({ role: 'owner' }), 'u', B)).toBe(true);
    expect(await mayChooseBusiness(client({ role: 'cashier' }), 'u', B)).toBe(false);
    expect(await mayChooseBusiness(client({ role: null }), 'u', B)).toBe(false);
    expect(await mayChooseBusiness(client({ role: 'owner' }), 'u', 'not-an-id')).toBe(false);
  });

  it('lists the businesses this sign-in can open, by name, with their status', async () => {
    const list = await listBusinesses(
      client({
        list: [
          { role: 'owner', merchant: second },
          {
            role: 'owner',
            merchant: { id: A, trading_name: 'First', status: 'live', submitted_at: 'x' },
          },
          { role: 'cashier', merchant: { id: 'c', trading_name: 'Theirs', status: 'live' } },
          {
            role: 'owner',
            merchant: { id: 'd', trading_name: null, legal_name: 'Draft Ltd', status: 'applied' },
          },
        ],
      }),
      'u',
    );
    expect(list).toEqual([
      { id: 'd', name: 'Draft Ltd', status: 'applied', label: 'Draft' },
      { id: A, name: 'First', status: 'live', label: 'Live' },
      { id: B, name: 'Second', status: 'under_review', label: 'In review' },
    ]);
  });

  it('labels each status plainly', () => {
    expect(businessLabel('live', true)).toBe('Live');
    expect(businessLabel('under_review', true)).toBe('In review');
    expect(businessLabel('documents_pending', true)).toBe('In review');
    expect(businessLabel('applied', false)).toBe('Draft');
    expect(businessLabel('paused', true)).toBe('Paused');
    expect(businessLabel('delisted', true)).toBe('Closed');
  });
});
