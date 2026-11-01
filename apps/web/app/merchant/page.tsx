import Link from 'next/link';

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
export default async function MerchantDashboard() {
  const { m, live, supabase, me } = await merchantContext();

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
    : [{ data: null }, { data: null }, { data: null }];

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
        <DashboardLive
          m={m}
          personName={person}
          branches={branches}
          attention={attention}
          orders={(orderRes.data as OrderRow[] | null) ?? []}
          money={moneyRes.data as WeekMoney | null}
          bars={(barRes.data as WeekBar[] | null) ?? []}
        />
      ) : progress ? (
        <DashboardSetup
          m={m}
          personName={person}
          progress={progress}
          branches={branches}
          attention={attention}
        />
      ) : null}
    </>
  );
}
