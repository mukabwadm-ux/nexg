import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { navFor } from '@/lib/console-nav';

/* The Finance › Paystack page as each person sees it, with a made-up database. */

const who = vi.hoisted(() => ({ isSuperAdmin: false, level: 'full', roles: [] as string[] }));
const db = vi.hoisted(() => ({
  answers: {} as Record<string, { data: unknown; error: unknown }>,
  rows: {} as Record<string, unknown[]>,
  calls: [] as [string, unknown][],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));
vi.mock('@nexg/ui', () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(' ') }));
vi.mock('@/components/console-shell', () => ({
  ConsoleShell: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/components/portal/client-kit', () => ({ RangeControl: () => null }));
vi.mock('@/lib/staff', () => ({
  requireStaff: async () => ({
    staffId: 'me',
    isSuperAdmin: who.isSuperAdmin,
    roles: who.roles,
  }),
  requireModule: () => ({ level: who.level }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      db.calls.push([fn, args]);
      return db.answers[fn] ?? { data: null, error: { code: 'PGRST202', message: 'missing' } };
    },
    from: (table: string) => {
      const query: Record<string, unknown> = {
        then: (done: (r: unknown) => unknown) => done({ data: db.rows[table] ?? [], error: null }),
      };
      for (const step of ['select', 'in', 'eq', 'order', 'limit']) query[step] = () => query;
      return query;
    },
  }),
}));

import PaystackPage from './page';

const ID = '5b0d8a52-1f3c-4b8e-9c1a-2d3e4f5a6b7c';
const page = async (searchParams: Record<string, string> = {}) =>
  renderToStaticMarkup(await PaystackPage({ searchParams }));
const answer = (fn: string, data: unknown) => {
  db.answers[fn] = { data, error: null };
};
const keyStatus = {
  test: { set: true, last4: '6789', updated_at: '2026-11-20T09:00:00Z' },
  live: { set: false, last4: null, updated_at: null },
  server_token_set: false,
};

beforeEach(() => {
  who.isSuperAdmin = false;
  who.level = 'full';
  who.roles = ['finance'];
  db.answers = {};
  db.rows = {};
  db.calls = [];
  vi.stubEnv('PAYSTACK_KEYS_TOKEN', '');
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', 'sk_test_ci_only_0123456789');
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
  vi.stubEnv('NEXG_PAYSTACK_LIVE', '');
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline');
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the menu', () => {
  it('lists Paystack after Payout rules for people who reach Finance', () => {
    const finance = navFor(new Set(['finance'])).find((g) => g.key === 'finance')!;
    const labels = finance.items.map((i) => i.label);
    expect(labels[labels.indexOf('Payout rules') + 1]).toBe('Paystack');
    expect(navFor(new Set(['orders'])).some((g) => g.key === 'finance')).toBe(false);
  });
});

describe('the overview', () => {
  it('says unavailable, never zero, and still opens without the database functions', async () => {
    const html = await page();
    expect(html).toContain('Balance unavailable. We could not reach Paystack.');
    expect(html).toContain('Unavailable');
    expect(html).toContain('Test mode');
    expect(html).toContain('This part is not on the database yet.');
    expect(html).toContain('/finance/settlements');
    expect(html).not.toContain('KES 0');
    expect(html).not.toContain('refund is not sent');
  });

  it('shows Paystack’s figures and the books apart', async () => {
    vi.stubGlobal('fetch', async (input: unknown) =>
      Response.json(
        String(input).endsWith('/balance')
          ? { status: true, data: [{ currency: 'KES', balance: 987650 }] }
          : {
              status: true,
              data: [
                { id: 1, status: 'success', currency: 'KES', effective_amount: 40000 },
                { id: 2, status: 'pending', currency: 'KES', effective_amount: 2500 },
              ],
              meta: { pageCount: 1 },
            },
      ),
    );
    answer('rpc_finance_nexg', {
      revenue: [
        {
          account: 'revenue.commission',
          name: 'Commission',
          earned_cents: 150000,
          refunded_cents: 20000,
          recovered_cents: 5000,
          net_cents: 135000,
        },
      ],
      vat_cents: 24000,
      transfer_fees_cents: 4000,
      collection_fees_cents: 1550,
      fee_unknown_count: 1,
      off_books: {
        booking: { count: 2, collected_cents: 300000, refunded_cents: 100000 },
        cinema: { count: 0, collected_cents: 0, refunded_cents: 0 },
      },
      receivable_ledger_cents: 777700,
    });

    const html = await page({ from: '2026-11-01', to: '2026-11-20' });

    for (const shown of ['KES 9,876.50', 'KES 400', 'KES 25', 'KES 1,350', 'KES 15.50']) {
      expect(html).toContain(shown);
    }
    /* A settlement with no fee reported leaves the fee total unavailable. */
    expect(html).toContain('Unavailable');
    expect(html).toContain('This is not money Paystack holds');
    expect(db.calls).toContainEqual([
      'rpc_finance_nexg',
      { p_from: '2026-11-01', p_to: '2026-11-20' },
    ]);
    expect(html).toContain('/finance/settlements?from=2026-11-01&amp;to=2026-11-20');
  });
});

describe('the Keys tab', () => {
  it('is not offered, or asked about, to someone who is not a super admin', async () => {
    const html = await page({ tab: 'keys' });
    expect(html).not.toContain('tab=keys');
    expect(html).not.toContain('type="password"');
    expect(db.calls.map(([fn]) => fn)).not.toContain('rpc_paystack_key_status');
  });

  it('is hidden from a super admin of one city, whom the database refuses', async () => {
    who.isSuperAdmin = true;
    db.answers.rpc_paystack_key_status = {
      data: null,
      error: { code: '42501', message: 'Only a super admin for every city.' },
    };
    const html = await page({ tab: 'keys' });
    expect(html).not.toContain('tab=keys');
    expect(html).not.toContain('type="password"');
  });

  it('shows what is saved, with empty password fields', async () => {
    who.isSuperAdmin = true;
    answer('rpc_paystack_key_status', keyStatus);
    const html = await page({ tab: 'keys' });
    expect(html.match(/type="password"/g)).toHaveLength(2);
    expect(html.match(/autoComplete="off"/gi)!.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('Ends ····6789');
    expect(html).toContain('No live key is saved.');
    expect(html).toContain('Not set.');
    expect(html).toContain('https://www.nexgapp.com/api/payments/paystack/webhook');
    expect(html).toContain('Switched off');
    expect(html).not.toContain('sk_test_ci_only');
    expect(html).not.toContain('<form');
  });
});

describe('what is waiting', () => {
  beforeEach(() => {
    answer('rpc_finance_paystack_approvals', {
      merchant_subaccounts: [
        {
          id: 's1',
          merchant_id: ID,
          name: 'Fixture Kitchen',
          test: true,
          code: 'ACCT_unit1',
          schedule: 'auto',
          details: {},
          can_decide: true,
        },
      ],
      host_subaccounts: [],
      merchant_commissions: [],
      host_commissions: [
        { id: 'c1', host_id: ID, name: 'Fixture Host', pct: 10, can_decide: true },
      ],
    });
    db.rows.rider_payout_v = [
      {
        id: 'p1',
        rider_name: 'Fixture Rider',
        mode: 'daily',
        is_test: true,
        gross_cents: 50000,
        cash_netted_cents: 0,
        fee_cents: 0,
        fee_paid_by: 'nexg',
        net_cents: 50000,
        state: 'held',
        created_at: '2026-11-20T09:00:00Z',
      },
    ];
  });

  it('lets full Finance decide here, with no link to a page they cannot open', async () => {
    const html = await page({ tab: 'waiting' });
    expect(html).toContain('Switch on');
    expect(html).toContain('Fixture Kitchen');
    expect(html).not.toContain(`/merchants/${ID}`);
    expect(html).not.toContain('/hotels?tab=hosts');
    expect(html).not.toContain('Decide on their page');
    expect(html).toContain('which your role cannot open. Ask a super admin.');
    expect(html).toContain('Riders: Waiting for Finance');
    expect(html).toContain('Pay through Paystack');
  });

  it('sends commission to the party’s page for someone who can open it', async () => {
    who.isSuperAdmin = true;
    const html = await page({ tab: 'waiting' });
    expect(html).toContain(`/merchants/${ID}#paystack-payouts`);
    expect(html).toContain(`/hotels?tab=hosts&amp;selected=${ID}`);
    expect(html).toContain('Decide on their page');
    expect(html).not.toContain('your role cannot open');
  });

  it('offers only “Turn down” for a sub-account of the other mode', async () => {
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', 'sk_live_ci_only_0123456789');
    vi.stubEnv('NEXG_PAYSTACK_LIVE', '1');
    const html = await page({ tab: 'waiting' });
    expect(html).not.toContain('Switch on');
    expect(html).toContain('Turn down');
    expect(html).toContain('To switch it on, the console must be in test mode.');

    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
    const without = await page({ tab: 'waiting' });
    expect(without).not.toContain('Switch on');
    expect(without).toContain('The console has no Paystack key, so it cannot be switched on.');
  });

  it('gives view-only Finance no buttons', async () => {
    who.level = 'view';
    const html = await page({ tab: 'waiting' });
    expect(html).toContain('Fixture Kitchen');
    expect(html).toContain('Fixture Rider');
    expect(html).not.toContain('<button');
  });
});

describe('refunds', () => {
  const due = (over: Record<string, unknown>) => ({
    kind: 'order',
    target_id: ID,
    label: 'Order NX-1',
    amount_cents: 123450,
    is_test: true,
    can_send: true,
    by_hand: false,
    last_try: null,
    ...over,
  });
  const button = 'Refund KES 1,234.50 through Paystack';
  const rows = async (...list: Record<string, unknown>[]) => {
    answer('rpc_finance_paystack_refunds', { show: 'due', refunds: [], due: list });
    return page({ tab: 'refunds' });
  };

  it('offers the button with the exact amount when the database says it may be sent', async () => {
    expect(await rows(due({}))).toContain(button);
    expect(await rows(due({ kind: 'booking' }))).toContain(button);
    expect(db.calls.at(-1)).toEqual(['rpc_finance_paystack_refunds', { p_show: 'due' }]);
  });

  it('offers none to view-only Finance, even where the database would allow it', async () => {
    who.level = 'view';
    expect(await rows(due({}))).not.toContain('<button');
  });

  it('says why there is no button', async () => {
    const stay = await rows(due({ kind: 'stay', can_send: false }));
    expect(stay).toContain('Hospitality staff send stay refunds.');
    expect(stay).not.toContain(button);
    const cinema = await rows(due({ kind: 'cinema', by_hand: true, can_send: false }));
    expect(cinema).toContain('Handled by hand in the Paystack dashboard.');
    expect(cinema).not.toContain(button);
    const worker = await rows(due({ kind: 'cinema', by_hand: false, can_send: false }));
    expect(worker).toContain('NexG sends this refund automatically.');
    expect(worker).not.toContain('Handled by hand');
    expect(worker).not.toContain(button);
    const live = await rows(due({ is_test: false }));
    expect(live).toContain('The console has no live Paystack key.');
    expect(live).not.toContain(button);
  });

  it('says nothing is by hand while a cinema refund is with Paystack', async () => {
    const tried = { id: 'r1', kind: 'cinema', by_hand: false };
    answer('rpc_finance_paystack_refunds', {
      show: 'due',
      due: [],
      refunds: [{ ...tried, state: 'pending' }],
    });
    const pending = await page({ tab: 'refunds' });
    expect(pending).toContain('With Paystack: pending');
    expect(pending).not.toContain('Handled by hand');
    expect(pending).not.toContain('automatically');

    answer('rpc_finance_paystack_refunds', {
      show: 'due',
      due: [],
      refunds: [{ ...tried, state: 'opened' }],
    });
    const opened = await page({ tab: 'refunds' });
    expect(opened).toContain('NexG sends this refund automatically.');
    expect(opened).toContain('Started By');
    expect(opened).not.toContain('Sent Through Paystack');
  });

  it('passes the chosen list to the database', async () => {
    answer('rpc_finance_paystack_refunds', {
      show: 'all',
      due: [],
      refunds: [{ id: 'r1', kind: 'booking', state: 'needs-attention', by_hand: true }],
    });
    const html = await page({ tab: 'refunds', show: 'all' });
    expect(html).toContain('Needs attention in Paystack');
    expect(html).toContain('Handled by hand in the Paystack dashboard.');
    expect(db.calls.at(-1)).toEqual(['rpc_finance_paystack_refunds', { p_show: 'all' }]);
  });
});

describe('problems', () => {
  const event = (over: Record<string, unknown>) => ({
    event_id: 1,
    action: 'payment.split_not_made',
    action_label: 'A split was not made',
    severity: 'high',
    review_state: 'needs_review',
    mine: false,
    ...over,
  });
  beforeEach(() => {
    answer('rpc_finance_paystack_problems', {
      events: [
        event({}),
        event({ event_id: 2, action_label: 'My own action', mine: true }),
        event({ event_id: 3, action_label: 'An old one', review_state: 'reviewed' }),
      ],
      open_events: 2,
      refunds_to_decide: [],
      invoiced_recoveries: [],
      otp_transfers: [],
      can_decide: true,
    });
  });

  it('hides reviewed events, and offers no review of one’s own', async () => {
    const html = await page({ tab: 'problems' });
    expect(html).not.toContain('An old one');
    expect(html.match(/Mark reviewed/g)).toHaveLength(1);
    expect(html).toContain('Somebody else has to review your own action.');
    expect(await page({ tab: 'problems', reviewed: '1' })).toContain('An old one');
  });

  it('gives view-only Finance no review button', async () => {
    who.level = 'view';
    expect(await page({ tab: 'problems' })).not.toContain('Mark reviewed');
  });

  it('links a merchant only for someone who can open their page', async () => {
    answer('rpc_finance_paystack_problems', {
      events: [event({ target_type: 'merchant', target_id: ID, target_label: 'Fixture Kitchen' })],
      open_events: 1,
      refunds_to_decide: [{ refund_id: 'f1', merchant_id: ID, name: 'Fixture Kitchen' }],
      invoiced_recoveries: [{ id: 'v1', merchant_id: ID, name: 'Fixture Kitchen' }],
      otp_transfers: [{ id: 't1', rider_id: ID, rider_name: 'Fixture Rider' }],
      can_decide: true,
    });
    const finance = await page({ tab: 'problems' });
    expect(finance).toContain('Fixture Kitchen');
    expect(finance).not.toContain(`/merchants/${ID}`);
    expect(finance).not.toContain(`/riders/${ID}`);
    expect(finance).not.toContain('Decide each on the merchant');
    expect(finance.match(/which your role cannot open/g)).toHaveLength(2);

    who.roles = ['finance', 'merchant_ops', 'rider_ops'];
    const both = await page({ tab: 'problems' });
    expect(both.match(new RegExp(`/merchants/${ID}`, 'g'))).toHaveLength(3);
    expect(both).toContain(`/riders/${ID}`);
    expect(both).toContain('Decide each on the merchant’s page.');
  });
});

describe('who gets paid', () => {
  it('links each row to the party’s page for someone who can open it', async () => {
    const sub = {
      id: 's1',
      party_id: ID,
      name: 'Fixture Host',
      test: false,
      code: 'ACCT_unit2',
      schedule: 'weekly',
      status: 'active',
      can_decide: false,
    };
    answer('rpc_finance_paystack_payees', {
      merchants: [],
      hosts: [sub],
      rider_transfers: [{ id: 't1', rider_id: ID, rider_name: 'Fixture Rider', state: 'otp' }],
      rider_cities: [],
      rider_automatic_live: false,
      live_worker_seen_at: null,
    });
    const closed = await page({ tab: 'payees' });
    expect(closed).toContain('Fixture Host');
    expect(closed).not.toContain('/hotels?tab=hosts');
    expect(closed).not.toContain(`/riders/${ID}`);
    who.roles = ['finance', 'partnerships', 'rider_ops'];
    const html = await page({ tab: 'payees' });
    expect(html).toContain(`/hotels?tab=hosts&amp;selected=${ID}`);
    expect(html).toContain(`/riders/${ID}`);
    expect(html).toContain('No merchant has a Paystack sub-account.');
    expect(html).toContain('Waiting for OTP');
  });
});
