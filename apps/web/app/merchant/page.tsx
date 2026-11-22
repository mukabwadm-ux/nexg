import Link from 'next/link';

import { HomeLive } from '@/components/merchant/home-live';
import { OrdersSwitch } from '@/components/merchant/orders-switch';
import { LazyConnectedApplication as ConnectedApplication } from '@/components/onboarding/connected-application-lazy';
import { loadMerchantHomeSource } from '@/lib/merchant-home-source';
import { MERCHANT_PAYOUTS_HREF } from '@/lib/merchant-payouts';
import { HomeSetup } from '@/components/merchant/home-setup';
import { DashboardLive } from '@/components/merchant/dashboard-live';
import { DashboardSetup } from '@/components/merchant/dashboard-setup';
import { DocumentsLive } from '@/components/merchant/documents-live';
import { LiveGaps, SetupTodo, type SetupTodoItem } from '@/components/merchant/setup-todo';
import { firstName, merchantContext } from '@/components/merchant/frame';
import type {
  AttentionRow,
  BranchCard,
  OrderRow,
  SetupProgress,
  WeekBar,
  WeekMoney,
} from '@/components/merchant/types';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/**
 * The merchant's first screen, in whichever of its two states
 * applies.
 *
 * The branch is on `merchant.status`, which the portal never
 * writes. A merchant goes live because a person at NexG ran a
 * test order with them and switched them over; no amount of
 * filled-in forms substitutes for that, and a dashboard that
 * decided for itself would be the one place that disagreed.
 */
export default async function MerchantDashboard() {
  const { m, live, operational, supabase, me } = await merchantContext({ setup: true });
  // An approved new-form merchant always gets the dashboard, live or not.
  const dashboard = live || (me.access.state !== 'legacy' && operational);

  // New applications render from their revisioned owner record before any
  // operational counts, order/finance views or sample legacy progress reads.
  // Once staff approve the application, the home is the dashboard below
  // instead of the registration checklist.
  if (me.access.state !== 'legacy' && !operational) {
    if (!me.access.setup)
      return (
        <main className="p-6">
          <h1 className="text-xl font-bold">Your workspace</h1>
          <p>Registration setup is managed by the business owner.</p>
        </main>
      );
    if (process.env.MERCHANT_ONBOARDING_V1_ENABLED === 'false')
      return (
        <main className="p-6">
          <h1>Your saved application is safe</h1>
          <p>Registration setup is temporarily unavailable. Contact support or return later.</p>
        </main>
      );
    try {
      const saved = await loadMerchantHomeSource(supabase, me.id, {
        includePayout: !me.isAnonymous,
      });
      return (
        <>
          <DocumentsLive ownerId={me.id} />
          <ConnectedApplication
            key={`${me.userId}:${saved.record.merchant_id}:${saved.record.revision}:${saved.record.review.state}:${saved.payout.version}`}
            actorId={me.userId}
            anonymousSession={me.isAnonymous}
            emailOtpEnabled={process.env.MERCHANT_EMAIL_OTP_ENABLED !== 'false'}
            initialRecord={saved.record}
            initialPayout={saved.payout}
            savedHome={saved.home}
            home
          />
        </>
      );
    } catch {
      return (
        <main className="p-6">
          <h1>We could not load your saved setup</h1>
          <p>Your application has not been replaced. Refresh or contact support.</p>
        </main>
      );
    }
  }

  if (!m) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-extrabold tracking-tight">We cannot load your dashboard</h1>
        <p className="text-muted mt-2 text-[0.9375rem] font-semibold">
          Your business exists but we could not read its summary. That is ours to fix — merchant ops
          can already see it.
        </p>
      </main>
    );
  }

  const accountState: Record<string, { title: string; description: string }> = {
    paused: {
      title: 'Your business is paused',
      description: 'Contact support if you need help with your account or its current status.',
    },
    suspended: {
      title: 'Your business is suspended',
      description: 'Contact support for information about your account and any next steps.',
    },
    delisted: {
      title: 'Your business is delisted',
      description: 'Contact support for information about your account and any next steps.',
    },
    offboarded: {
      title: 'Your business is offboarded',
      description: 'Contact support if you have a question about your account.',
    },
  };
  const restricted = accountState[m.status];
  if (restricted) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-extrabold">{restricted.title}</h1>
        <p className="text-muted mt-2">{restricted.description}</p>
        <a
          href="/merchant/support"
          className="text-gold-text mt-4 inline-block font-bold underline"
        >
          Contact support
        </a>
      </main>
    );
  }

  const person = firstName(m.contact_name, m.name);

  // Approve first (20270124000100): an approved merchant that is not live yet
  // sees what is left before NexG takes it live. Null before that migration.
  const todo =
    dashboard && !live
      ? (await supabase.rpc('rpc_merchant_setup_todo', { p_merchant_id: me.id })).data
      : null;
  const todoItems = ((todo as { items?: SetupTodoItem[] } | null)?.items ?? []) as SetupTodoItem[];

  // A live shop with no pin, or no hours, is on no map and shows as always
  // open (22 Nov 2026): going live checks both now, but shops already live
  // are told here.
  const liveGaps: SetupTodoItem[] = [];
  if (live) {
    const [pinRes, hoursRes] = await Promise.all([
      supabase
        .from('merchant_branch')
        .select('latitude, longitude, zone_id')
        .eq('merchant_id', me.id)
        .eq('is_primary', true)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase
        .from('merchant_hours')
        .select('id', { count: 'exact', head: true })
        .eq('merchant_id', me.id),
    ]);
    const pin = pinRes.data as {
      latitude: number | null;
      longitude: number | null;
      zone_id: string | null;
    } | null;
    if (!pinRes.error && (!pin || pin.latitude === null || pin.longitude === null))
      liveGaps.push({
        key: 'branch_pin',
        who: 'merchant',
        label: 'Put your main location on the map',
      });
    else if (!pinRes.error && pin && pin.zone_id === null)
      liveGaps.push({
        key: 'branch_pin',
        who: 'merchant',
        label: 'Your pin is outside the areas NexG serves. Check it is on your door',
      });
    if (!hoursRes.error && hoursRes.count === 0)
      liveGaps.push({ key: 'hours', who: 'merchant', label: 'Set your opening hours' });
  }

  /*
   * Everything the dashboard reads, in one batch: these used to go out as
   * three batches one after another. Documents are optional while
   * onboarding, so the dashboard is where they get chased; nothing goes live
   * until they are verified. The live half reads three more things, and a
   * merchant still in setup pays for none of them.
   */
  const none = Promise.resolve({ data: null, error: null });
  const [progressRes, branchRes, attentionRes, reqRes, docRes, orderRes, moneyRes, barRes] =
    await Promise.all([
      supabase.from('merchant_setup_progress_v').select('*').eq('merchant_id', me.id).maybeSingle(),
      supabase.from('merchant_branch_live_v').select('*').eq('merchant_id', me.id).order('name'),
      supabase.from('merchant_attention_v').select('*').eq('merchant_id', me.id).order('sort'),
      supabase.rpc('fn_merchant_required_docs', { p_merchant_id: me.id }),
      supabase
        .from('document')
        .select('requirement_id')
        .eq('owner_type', 'merchant')
        .eq('owner_id', me.id),
      dashboard
        ? supabase
            .from('merchant_orders_v')
            .select('*')
            .eq('merchant_id', me.id)
            .not('what_now', 'in', '("done","closed")')
            .order('placed_at')
            .limit(12)
        : none,
      dashboard
        ? supabase.from('merchant_week_money_v').select('*').eq('merchant_id', me.id).maybeSingle()
        : none,
      dashboard
        ? supabase.from('merchant_week_bars_v').select('*').eq('merchant_id', me.id).order('day')
        : none,
    ]);

  const progress = progressRes.data as SetupProgress | null;
  const branches = (branchRes.data as BranchCard[] | null) ?? [];
  /* The payout row's link in merchant_attention_v is /merchant/money; it now
     opens the payout page itself, where the owner adds the account. */
  const attention = ((attentionRes.data as AttentionRow[] | null) ?? []).map((row) =>
    row.kind === 'payout' ? { ...row, href: MERCHANT_PAYOUTS_HREF } : row,
  );

  const have = new Set(
    ((docRes.data as { requirement_id: string }[] | null) ?? []).map((d) => d.requirement_id),
  );
  const missingDocs = ((reqRes.data as { id: string }[] | null) ?? []).filter(
    (r) => !have.has(r.id),
  ).length;

  return (
    <>
      {missingDocs > 0 && (
        <div className="mx-auto max-w-[90rem] px-4 pt-6 sm:px-8">
          <div className="border-gold/50 bg-surface flex flex-wrap items-center gap-3 rounded-2xl border p-4">
            <p className="min-w-0 flex-1 text-[0.9375rem] font-extrabold">
              {missingDocs} {missingDocs === 1 ? 'document' : 'documents'} still to add
              <span className="text-muted block text-[0.8125rem] font-semibold">
                You can keep setting up. Nothing goes live until our team has checked them.
              </span>
            </p>
            <Link
              href="/merchant/documents"
              className="bg-gold text-ink rounded-full px-5 py-2.5 text-sm font-extrabold"
            >
              Add documents
            </Link>
          </div>
        </div>
      )}{' '}
      {dashboard ? (
        <>
          <SetupTodo items={todoItems} />
          <LiveGaps items={liveGaps} />
          <HomeLive
            m={m}
            personName={person}
            branches={branches}
            attention={attention}
            orders={(orderRes.data as OrderRow[] | null) ?? []}
            money={moneyRes.data as WeekMoney | null}
            bars={(barRes.data as WeekBar[] | null) ?? []}
            unavailable={{
              branches: !!branchRes.error,
              attention: !!attentionRes.error,
              orders: !!orderRes.error,
              money: !!moneyRes.error,
              bars: !!barRes.error,
            }}
            ordersSwitch={
              live && me.access.operations && !me.isAnonymous && m.accepting_orders != null ? (
                <OrdersSwitch merchantId={me.id} accepting={m.accepting_orders} />
              ) : undefined
            }
          />
          {!orderRes.error &&
          !moneyRes.error &&
          !barRes.error &&
          !branchRes.error &&
          !attentionRes.error ? (
            <details className="mx-4 mb-8 sm:mx-6 lg:mx-8">
              <summary className="text-gold-text cursor-pointer font-bold">
                More dashboard details
              </summary>
              <div className="mt-4">
                <DashboardLive
                  m={m}
                  personName={person}
                  branches={branches}
                  attention={attention}
                  orders={(orderRes.data as OrderRow[] | null) ?? []}
                  money={moneyRes.data as WeekMoney | null}
                  bars={(barRes.data as WeekBar[] | null) ?? []}
                />
              </div>
            </details>
          ) : null}
        </>
      ) : progress ? (
        <>
          <DocumentsLive ownerId={me.id} />
          <HomeSetup
            businessName={m.name}
            progress={progress}
            branches={branches}
            branchesUnavailable={!!branchRes.error}
          />
          <details className="mx-4 mb-8 sm:mx-6 lg:mx-8">
            <summary className="text-gold-text cursor-pointer font-bold">
              More setup details
            </summary>
            <DashboardSetup
              m={m}
              personName={person}
              progress={progress}
              branches={branches}
              attention={attention}
            />
          </details>
        </>
      ) : (
        <main className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="text-xl font-extrabold">Setup progress is unavailable</h1>
          <p className="text-muted mt-2">
            Refresh this page to try again, or contact support if it continues.
          </p>
          <a
            href="/merchant/support"
            className="text-gold-text mt-4 inline-block font-bold underline"
          >
            Contact support
          </a>
        </main>
      )}
    </>
  );
}
