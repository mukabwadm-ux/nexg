import { RiderHomeView, type RiderPerformance } from '@/components/rider/home';
import { riderContext } from '@/components/rider/frame';
import type {
  RiderAttentionRow,
  RiderJob,
  RiderProgress,
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
/** Monday 00:00 of this week in Nairobi, and of last week. */
function weekStarts(): { thisWeek: Date; lastWeek: Date } {
  const today = new Date(startOfDayInNairobi());
  const dow = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    timeZone: 'Africa/Nairobi',
  });
  const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(dow);
  const thisWeek = new Date(today.getTime() - Math.max(back, 0) * 86_400_000);
  return { thisWeek, lastWeek: new Date(thisWeek.getTime() - 7 * 86_400_000) };
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
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-extrabold tracking-tight">We cannot load your dashboard</h1>
        <p className="text-muted mt-2 text-[0.9375rem] font-semibold">
          Your rider account exists but we could not read its summary. That is ours to fix — rider
          ops can already see it.
        </p>
      </div>
    );
  }

  /* One batch, where there used to be two in a row. The active half reads
     three more things; an applicant pays for none of them. */
  const none = Promise.resolve({ data: null });
  const weeks = weekStarts();
  const [progressRes, attentionRes, jobRes, weekRes, healthRes, payoutRes, earningRes] =
    await Promise.all([
      supabase.from('rider_setup_progress_v').select('*').eq('rider_id', me.id).maybeSingle(),
      supabase.from('rider_attention_v').select('*').eq('rider_id', me.id).order('sort'),
      /*
       * Today, in Nairobi — not "the last ten".
       *
       * The table is headed Today's jobs and the hero tile
       * counts today's deliveries. Querying a rolling ten
       * made the two disagree the moment a rider had a quiet
       * morning after a busy night, which is exactly when
       * somebody checks.
       */
      active
        ? supabase
            .from('rider_jobs_v')
            .select('*')
            .eq('rider_id', me.id)
            .gte('placed_at', startOfDayInNairobi())
            .order('placed_at', { ascending: false })
        : none,
      active
        ? supabase.from('rider_week_earnings_v').select('*').eq('rider_id', me.id).maybeSingle()
        : none,
      supabase.from('rider_health_v').select('*').eq('rider_id', me.id).maybeSingle(),
      active ? supabase.rpc('rpc_rider_payout_overview', {}) : none,
      active
        ? supabase
            .from('rider_earning')
            .select('total_kes, earned_at')
            .eq('rider_id', me.id)
            .eq('is_test', false)
            .gte('earned_at', weeks.lastWeek.toISOString())
        : none,
    ]);

  /* Pay per day, Monday to Sunday, this week; and last week's total to compare. */
  const days = [0, 0, 0, 0, 0, 0, 0];
  let lastWeekTotal = 0;
  for (const row of (earningRes.data as { total_kes: number; earned_at: string }[] | null) ?? []) {
    const at = new Date(row.earned_at).getTime();
    if (at >= weeks.thisWeek.getTime()) {
      const day = Math.min(6, Math.floor((at - weeks.thisWeek.getTime()) / 86_400_000));
      days[day] = (days[day] ?? 0) + (Number(row.total_kes) || 0);
    } else lastWeekTotal += Number(row.total_kes) || 0;
  }
  const health = healthRes.data as {
    acceptance_pct: number | null;
    on_time_pct: number | null;
    rating_avg: number | null;
    trips_30d: number | null;
    trend: number[] | null;
  } | null;
  const performance: RiderPerformance = {
    acceptancePct: health?.acceptance_pct ?? null,
    onTimePct: health?.on_time_pct ?? null,
    rating: health?.rating_avg ?? null,
    trips30d: health?.trips_30d ?? null,
    trend: health?.trend ?? [],
    days,
    lastWeekTotal,
    availableKes: (payoutRes.data as { availableKes?: number } | null)?.availableKes ?? null,
  };

  /* The merchant workspace Home's layout, with the rider's content (components/rider/home.tsx). */
  return (
    <RiderHomeView
      h={h}
      active={active}
      progress={progressRes.data as RiderProgress | null}
      attention={(attentionRes.data as RiderAttentionRow[] | null) ?? []}
      jobs={(jobRes.data as RiderJob[] | null) ?? []}
      week={weekRes.data as WeekEarnings | null}
      performance={performance}
    />
  );
}
