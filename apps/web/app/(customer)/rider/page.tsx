import { DashboardActive } from '@/components/rider/dashboard-active';
import { DashboardPending } from '@/components/rider/dashboard-pending';
import { riderContext } from '@/components/rider/frame';
import type {
  RiderAttentionRow,
  RiderJob,
  RiderProgress,
  WeekBar,
  WeekEarnings,
} from '@/components/rider/types';

export const metadata = { title: 'Dashboard' };

/** Midnight today in Nairobi, as an instant. */
function startOfDayInNairobi(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  /* Nairobi is UTC+3 with no daylight saving, so this is exact
     rather than an approximation that drifts twice a year. */
  return `${today}T00:00:00+03:00`;
}
export const dynamic = 'force-dynamic';

/**
 * The rider's first screen, in whichever of its two states
 * applies.
 *
 * The branch is on `rider.status`, which these surfaces never
 * write. A rider becomes active because rider ops ran a test
 * delivery with them and switched them over — a checklist
 * cannot substitute for somebody having met them.
 */
export default async function RiderDashboard() {
  const { h, active, supabase, me } = await riderContext();

  if (!h) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-extrabold tracking-tight">We cannot load your dashboard</h1>
        <p className="text-muted mt-2 text-[0.9375rem] font-semibold">
          Your rider account exists but we could not read its summary. That is ours to fix — rider
          ops can already see it.
        </p>
      </main>
    );
  }

  const [progressRes, attentionRes] = await Promise.all([
    supabase.from('rider_setup_progress_v').select('*').eq('rider_id', me.id).maybeSingle(),
    supabase.from('rider_attention_v').select('*').eq('rider_id', me.id).order('sort'),
  ]);

  const progress = progressRes.data as RiderProgress | null;
  const attention = (attentionRes.data as RiderAttentionRow[] | null) ?? [];

  /* The active half reads three more things; an applicant pays
     for none of them. */
  const [jobRes, weekRes, barRes] = active
    ? await Promise.all([
        /*
         * Today, in Nairobi — not "the last ten".
         *
         * The table is headed Today's jobs and the hero tile
         * counts today's deliveries. Querying a rolling ten
         * made the two disagree the moment a rider had a quiet
         * morning after a busy night, which is exactly when
         * somebody checks.
         */
        supabase
          .from('rider_jobs_v')
          .select('*')
          .eq('rider_id', me.id)
          .gte('placed_at', startOfDayInNairobi())
          .order('placed_at', { ascending: false }),
        supabase.from('rider_week_earnings_v').select('*').eq('rider_id', me.id).maybeSingle(),
        supabase.from('rider_week_bars_v').select('*').eq('rider_id', me.id).order('day'),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  return (
    <>
      {active ? (
        <DashboardActive
          h={h}
          jobs={(jobRes.data as RiderJob[] | null) ?? []}
          attention={attention}
          week={weekRes.data as WeekEarnings | null}
          bars={(barRes.data as WeekBar[] | null) ?? []}
        />
      ) : progress ? (
        <DashboardPending h={h} progress={progress} attention={attention} />
      ) : null}
    </>
  );
}
