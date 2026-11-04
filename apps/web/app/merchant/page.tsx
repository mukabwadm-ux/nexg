import type { ReactNode } from 'react';
import Link from 'next/link';

import { HomeLive } from '@/components/merchant/home-live';
import { ConnectedApplication } from '@/components/onboarding/connected-application';
import { loadMerchantHomeSource } from '@/lib/merchant-home-source';
import { HomeSetup } from '@/components/merchant/home-setup';
import { DashboardLive } from '@/components/merchant/dashboard-live';
import { DashboardSetup } from '@/components/merchant/dashboard-setup';
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
export default async function MerchantDashboard(): Promise<ReactNode> {
  const { m, live, supabase, me } = await merchantContext({ setup: true });

  // New applications render from their revisioned owner record before any
  // operational counts, order/finance views or sample legacy progress reads.
  if (me.access.state !== 'legacy') {
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

  const [progressRes, branchRes, attentionRes] = await Promise.all([
    supabase.from('merchant_setup_progress_v').select('*').eq('merchant_id', me.id).maybeSingle(),
    supabase.from('merchant_branch_live_v').select('*').eq('merchant_id', me.id).order('name'),
    supabase.from('merchant_attention_v').select('*').eq('merchant_id', me.id).order('sort'),
  ]);

  const progress = progressRes.data as SetupProgress | null;
  const branches = (branchRes.data as BranchCard[] | null) ?? [];
  const attention = (attentionRes.data as AttentionRow[] | null) ?? [];

  /* Documents are optional while onboarding, so the dashboard is where
     they get chased. Nothing goes live until they are verified. */
  const [reqRes, docRes] = await Promise.all([
    supabase.rpc('fn_merchant_required_docs', { p_merchant_id: me.id }),
    supabase
      .from('document')
      .select('requirement_id')
      .eq('owner_type', 'merchant')
      .eq('owner_id', me.id),
  ]);
  const have = new Set(
    ((docRes.data as { requirement_id: string }[] | null) ?? []).map((d) => d.requirement_id),
  );
  const missingDocs = ((reqRes.data as { id: string }[] | null) ?? []).filter(
    (r) => !have.has(r.id),
  ).length;

  /* The live half reads three more things. A merchant still in
     setup pays for none of them. */
  const [orderRes, moneyRes, barRes] = live
    ? await Promise.all([
        supabase
          .from('merchant_orders_v')
          .select('*')
          .eq('merchant_id', me.id)
          .not('what_now', 'in', '("done","closed")')
          .order('placed_at')
          .limit(12),
        supabase.from('merchant_week_money_v').select('*').eq('merchant_id', me.id).maybeSingle(),
        supabase.from('merchant_week_bars_v').select('*').eq('merchant_id', me.id).order('day'),
      ])
    : [
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ];

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
      {live ? (
        <>
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
