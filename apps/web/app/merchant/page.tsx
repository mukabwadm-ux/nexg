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
          Your business exists but we could not read its summary. That is ours to fix — merchant
          ops can already see it.
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
