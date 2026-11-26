import {
  AlertOctagon,
  Clock3,
  CreditCard,
  KeyRound,
  LayoutGrid,
  Undo2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ConsoleShell } from '@/components/console-shell';
import type { EarlyPayoutRow } from '@/components/finance/early-payouts';
import { PaystackKeys } from '@/components/finance/paystack-keys';
import { PaystackOverview } from '@/components/finance/paystack-money';
import { Problem } from '@/components/finance/paystack-parts';
import { PaystackPayees } from '@/components/finance/paystack-payees';
import { PaystackProblems } from '@/components/finance/paystack-problems';
import { PaystackRefunds } from '@/components/finance/paystack-refunds';
import { PaystackWaiting } from '@/components/finance/paystack-waiting';
import type { RiderPayoutRow } from '@/components/finance/rider-payouts';
import { RangeControl } from '@/components/portal/client-kit';
import { PageHeader, ViewTabs } from '@/components/portal/kit';
import {
  partyPages,
  readAnswer,
  REFUND_SHOWS,
  toApprovals,
  toKeyStatus,
  toNexg,
  toPayees,
  toProblems,
  toRefunds,
  type Read,
  type RpcResult,
} from '@/lib/finance-paystack';
import { paystackMoney } from '@/lib/finance-paystack-server';
import { paystackProof, payoutMode } from '@/lib/paystack';
import { loadPaystackKeys } from '@/lib/paystack-keys';
import { hrefWith, periodFrom, periodQuery } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Paystack' };
export const dynamic = 'force-dynamic';

/* The website's address, as docs/DEPLOY.md section 7 gives it. */
const WEBHOOK_URL = 'https://www.nexgapp.com/api/payments/paystack/webhook';

type Tab = 'overview' | 'payees' | 'waiting' | 'refunds' | 'problems' | 'keys';

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'payees', label: 'Who Gets Paid', icon: Users },
  { key: 'waiting', label: 'Waiting', icon: Clock3 },
  { key: 'refunds', label: 'Refunds', icon: Undo2 },
  { key: 'problems', label: 'Problems', icon: AlertOctagon },
  { key: 'keys', label: 'Keys', icon: KeyRound },
];

/* The screen's functions are not in the generated types yet (CI makes them). */
type Db = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
};

async function read<T>(
  db: Db,
  fn: string,
  parse: (data: unknown) => T | null,
  args: Record<string, unknown> = {},
): Promise<Read<T>> {
  try {
    return readAnswer(await db.rpc(fn, args), parse);
  } catch {
    return {
      ok: false,
      forbidden: false,
      message: 'Could not be loaded: the database could not be reached.',
    };
  }
}

/**
 * Finance → Paystack: NexG's own money, who is paid through Paystack, what
 * waits for a decision, refunds, problems, and (super admin for every city)
 * the keys. Anyone who reaches Finance reads it; buttons are for full Finance
 * or a super admin, and the database checks every one of them again.
 */
export default async function PaystackPage({
  searchParams,
}: {
  searchParams?: {
    tab?: string;
    from?: string;
    to?: string;
    show?: string;
    reviewed?: string;
  };
}) {
  const staff = await requireStaff();
  const finance = requireModule(staff, 'finance');
  const canAct = staff.isSuperAdmin || finance.level === 'full';
  const opens = partyPages(staff);
  const supabase = createClient();
  const db = supabase as unknown as Db;

  /* Keys are a super admin's whose role names no city. The console cannot tell
     which super admin that is, so the database is asked: refused, no tab. */
  const keys = staff.isSuperAdmin ? await read(db, 'rpc_paystack_key_status', toKeyStatus) : null;
  const keysShown = keys !== null && (keys.ok || !keys.forbidden);
  const tabs = TABS.filter((t) => t.key !== 'keys' || keysShown);
  const tab: Tab = tabs.find((t) => t.key === searchParams?.tab)?.key ?? 'overview';

  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const range = pq ? { from: period.from, to: period.to } : {};
  const href = (key: Tab, extra: Record<string, string | null> = {}) =>
    hrefWith('/finance/paystack', {
      tab: key === 'overview' ? null : key,
      ...extra,
      ...range,
    });

  let view: React.ReactNode = null;

  if (tab === 'overview') {
    const [paystack, books] = await Promise.all([
      paystackMoney(period),
      read(db, 'rpc_finance_nexg', toNexg, { p_from: period.from, p_to: period.to }),
    ]);
    view = (
      <PaystackOverview
        paystack={paystack}
        books={books}
        period={period}
        settlementsHref={hrefWith('/finance/settlements', range)}
      />
    );
  }

  if (tab === 'payees') {
    const payees = await read(db, 'rpc_finance_paystack_payees', toPayees);
    view = payees.ok ? (
      <PaystackPayees
        payees={payees.data}
        canAct={canAct}
        opens={opens}
        waitingHref={href('waiting')}
      />
    ) : (
      <Problem>{payees.message}</Problem>
    );
  }

  if (tab === 'waiting') {
    const [approvals, riders] = await Promise.all([
      read(db, 'rpc_finance_paystack_approvals', toApprovals),
      waitingRiders(supabase),
      loadPaystackKeys(),
    ]);
    view = (
      <PaystackWaiting
        approvals={approvals}
        canAct={canAct}
        opens={opens}
        mode={payoutMode()}
        early={riders.early}
        held={riders.held}
        ridersError={riders.error}
      />
    );
  }

  if (tab === 'refunds') {
    const show = REFUND_SHOWS.find((s) => s === searchParams?.show) ?? 'due';
    const [refunds] = await Promise.all([
      read(db, 'rpc_finance_paystack_refunds', toRefunds, { p_show: show }),
      loadPaystackKeys(),
    ]);
    view = refunds.ok ? (
      <PaystackRefunds
        refunds={refunds.data}
        show={show}
        canAct={canAct}
        held={{
          test: paystackProof('test') !== null,
          live: paystackProof('live') !== null,
        }}
        showHref={(s) => href('refunds', { show: s === 'due' ? null : s })}
      />
    ) : (
      <Problem>{refunds.message}</Problem>
    );
  }

  if (tab === 'problems') {
    const problems = await read(db, 'rpc_finance_paystack_problems', toProblems, {
      p_limit: 100,
    });
    const showReviewed = searchParams?.reviewed === '1';
    view = problems.ok ? (
      <PaystackProblems
        problems={problems.data}
        canAct={canAct}
        opens={opens}
        showReviewed={showReviewed}
        toggleHref={href('problems', { reviewed: showReviewed ? null : '1' })}
      />
    ) : (
      <Problem>{problems.message}</Problem>
    );
  }

  if (tab === 'keys' && keys) {
    view = (
      <PaystackKeys
        status={keys}
        webhookUrl={WEBHOOK_URL}
        liveSwitch={process.env.NEXG_PAYSTACK_LIVE?.trim() === '1'}
        usesSaved={Boolean(process.env.PAYSTACK_KEYS_TOKEN?.trim())}
      />
    );
  }

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={CreditCard}
        title="Paystack"
        subtitle="NexG's money, who is paid, what is waiting, refunds and problems."
        actions={
          tab === 'overview' ? <RangeControl from={period.from} to={period.to} /> : undefined
        }
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <ViewTabs
          active={tab}
          tabs={tabs.map((t) => ({
            key: t.key,
            label: t.label,
            icon: t.icon,
            href: href(t.key),
          }))}
        />
        {view}
      </main>
    </ConsoleShell>
  );
}

/**
 * The riders waiting for Finance, as Settlements reads them: early payout
 * requests (with their latest Paystack transfer) and held automatic payouts.
 */
async function waitingRiders(
  supabase: ReturnType<typeof createClient>,
): Promise<{ early: EarlyPayoutRow[]; held: RiderPayoutRow[]; error: string | null }> {
  const [early, held] = await Promise.all([
    supabase
      .from('rider_payout_request_queue_v')
      .select(
        'id, rider_name, rider_phone, amount_kes, reason, payout_msisdn, status, requested_at, payout_msisdn_changed_at',
      )
      .in('status', ['pending', 'approved'])
      .order('requested_at')
      .limit(50),
    supabase
      .from('rider_payout_v' as never)
      .select(
        'id, rider_name, mode, is_test, gross_cents, cash_netted_cents, fee_cents, fee_paid_by, net_cents, state, hold_reason, failure_reason, destination, created_at, paid_at, transfer_state',
      )
      .eq('state', 'held')
      .order('created_at')
      .limit(100),
  ]);
  const requests = (early.data ?? []) as EarlyPayoutRow[];
  /* Missing before the transfers update is applied, in which case there is
     simply none. */
  const { data: transfers } =
    requests.length > 0
      ? await supabase
          .from('paystack_transfer_v' as never)
          .select('source_id, state, failure_reason, created_at')
          .eq('kind', 'rider_early')
          .in(
            'source_id',
            requests.map((r) => r.id),
          )
          .order('created_at', { ascending: false })
      : { data: [] };
  const latest = new Map<string, { state: string; failure_reason: string | null }>();
  for (const t of (transfers ?? []) as unknown as {
    source_id: string;
    state: string;
    failure_reason: string | null;
  }[]) {
    if (!latest.has(t.source_id)) latest.set(t.source_id, t);
  }
  return {
    early: requests.map((r) => ({
      ...r,
      transfer_state: latest.get(r.id)?.state ?? null,
      transfer_failure: latest.get(r.id)?.failure_reason ?? null,
    })),
    held: (held.data ?? []) as unknown as RiderPayoutRow[],
    error: early.error?.message ?? held.error?.message ?? null,
  };
}
