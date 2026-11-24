import { CheckCircle2, Crown, ShieldCheck, Star, Trophy } from 'lucide-react';

import { kesh } from '@/components/rider/bits';
import { riderContext } from '@/components/rider/frame';
import { Nothing, PageHead, PanelTitle, RiderPage, panel } from '@/components/rider/ui';

export const metadata = { title: 'Rewards' };
export const dynamic = 'force-dynamic';

interface ReferralRow {
  id: string;
  code: string;
  referred_name: string | null;
  status: string;
  reward_amount_kes: number | null;
  reward_status: string;
  first_trip_at: string | null;
  created_at: string;
}

interface Rewards {
  points: number;
  weekPoints: number;
  byReason: Record<string, number>;
  recent: { reason: string; points: number; earnedAt: string }[];
  badges: { key: string; earned: boolean; note?: string; progress?: number; target?: number }[];
}

const STATUS: Record<string, { label: string; tone: string }> = {
  invited: { label: 'Invited', tone: 'bg-slate-100 text-slate-600' },
  applied: { label: 'Applied', tone: 'bg-blue-50 text-blue-700' },
  in_review: { label: 'In review', tone: 'bg-amber-50 text-amber-700' },
  active: { label: 'Riding', tone: 'bg-green-50 text-green-700' },
  void: { label: 'Not proceeding', tone: 'bg-slate-100 text-slate-500' },
};

/* The owner's rules of 2026-11-23, as rpc_rider_rewards awards them. */
const RULES = [
  { reason: 'delivery', label: 'Completed delivery', points: '10' },
  { reason: 'on_time', label: 'Delivered on time', points: '+5' },
  { reason: 'five_stars', label: '5-star rating', points: '+5' },
  { reason: 'shift_kept', label: 'Booked shift you turned up for', points: '20' },
  { reason: 'streak_7', label: '7 days in a row with a delivery', points: '50' },
  { reason: 'training', label: 'Training module passed', points: '25' },
  { reason: 'referral', label: 'A rider you referred goes active', points: '200' },
];
const REASON: Record<string, string> = Object.fromEntries(RULES.map((r) => [r.reason, r.label]));

const BADGES: Record<string, { name: string; icon: React.ReactNode; tone: string; rule: string }> =
  {
    top_rider: {
      name: 'Top Rider',
      icon: <Trophy />,
      tone: 'from-amber-300 to-amber-500 text-amber-950',
      rule: 'Top 10 in your city last week',
    },
    jobs_100: {
      name: '100 Jobs',
      icon: <CheckCircle2 />,
      tone: 'from-sky-400 to-blue-600 text-white',
      rule: '100 completed deliveries',
    },
    safety_star: {
      name: 'Safety Star',
      icon: <ShieldCheck />,
      tone: 'from-orange-300 to-orange-500 text-orange-950',
      rule: '30 days, no incident, 95% on time',
    },
    super_rider: {
      name: 'Super Rider',
      icon: <Crown />,
      tone: 'from-violet-400 to-purple-700 text-white',
      rule: 'Rating 4.8+ over 50 deliveries',
    },
  };

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });

/**
 * Rewards & Achievements: points from real work under the owner's rules,
 * four badges worked out from real numbers, and the referral scheme.
 *
 * Points have no cash value yet, and the page says so rather than
 * showing a "next reward" nobody has decided.
 */
export default async function RiderRewards() {
  const { h, supabase } = await riderContext();
  if (!h) return null;

  const [{ data: rewardData, error: rewardError }, { data }] = await Promise.all([
    supabase.rpc('rpc_rider_rewards', {}),
    supabase.from('rider_referral_v').select('*').eq('referrer_rider_id', h.rider_id).limit(50),
  ]);
  /* Before 20270224000100 is in the database the function is missing. */
  const rewards = rewardError ? null : (rewardData as unknown as Rewards | null);
  const referrals = (data as ReferralRow[] | null) ?? [];
  const code = referrals[0]?.code ?? null;
  const step = 1000;
  const next = rewards ? (Math.floor(rewards.points / step) + 1) * step : step;
  const pct = rewards ? Math.round(((rewards.points % step) / step) * 100) : 0;
  const top = rewards?.badges.find((b) => b.key === 'top_rider' && b.earned);

  return (
    <RiderPage>
      <PageHead title="Rewards & Achievements" lead="Ride more. Earn more." />

      {!rewards ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
          Points and badges are not switched on yet. Your referrals are below.
        </p>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <section className="relative isolate overflow-hidden rounded-[22px] bg-gradient-to-br from-[#121a33] to-[#0b0f1c] p-5 text-white sm:p-6">
              <div className="flex items-center gap-4">
                <span className="bg-gold flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[color:var(--rider-ink)]">
                  <Star className="h-7 w-7 fill-current" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-white/80">Your points</p>
                  <p className="text-[34px] font-extrabold tabular-nums leading-tight">
                    {rewards.points.toLocaleString('en-KE')}
                  </p>
                  <p className="text-[13px] font-bold text-green-300">
                    +{rewards.weekPoints.toLocaleString('en-KE')} this week
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <p className="text-[13px] font-semibold text-white/80">Next milestone</p>
                <p className="text-[24px] font-extrabold tabular-nums">
                  {next.toLocaleString('en-KE')} points
                </p>
                <div
                  className="mt-2 h-3 overflow-hidden rounded-full bg-white/15"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label="Progress to the next milestone"
                >
                  <div
                    className="from-gold-deep to-gold h-full rounded-full bg-gradient-to-r"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-[12px] font-semibold text-white/65">
                  What points can be swapped for is still being decided. Every point you earn now
                  counts.
                </p>
              </div>
            </section>

            <section className={panel}>
              <PanelTitle title="Your Achievements" note="Worked out from your real deliveries" />
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {rewards.badges.map((b) => {
                  const meta = BADGES[b.key];
                  if (!meta) return null;
                  return (
                    <li
                      key={b.key}
                      className={`flex flex-col items-center rounded-2xl border p-3 text-center ${
                        b.earned ? 'border-gold bg-gold-soft' : 'border-[#eef0f6]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.tone} shadow-[0_10px_20px_-12px_rgba(0,0,0,0.6)] [&>svg]:h-8 [&>svg]:w-8 ${
                          b.earned ? '' : 'opacity-35 grayscale'
                        }`}
                      >
                        {meta.icon}
                      </span>
                      <p className="mt-2 text-[14px] font-extrabold">{meta.name}</p>
                      <p className="text-[11.5px] font-semibold text-slate-500">{meta.rule}</p>
                      <p
                        className={`mt-1 text-[12px] font-extrabold ${b.earned ? 'text-green-700' : 'text-slate-600'}`}
                      >
                        {b.earned
                          ? 'Earned'
                          : b.target
                            ? `${b.progress ?? 0} of ${b.target}`
                            : (b.note ?? 'Not yet')}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {top ? (
            <section className="flex flex-wrap items-center gap-4 rounded-[20px] bg-gradient-to-r from-[#3b1d6e] to-[#5b2a9e] p-5 text-white">
              <Trophy className="text-gold h-10 w-10" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-extrabold">You&apos;re a Top Performer!</p>
                <p className="text-[13px] text-white/80">{top.note}. Keep it up.</p>
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <section className={panel}>
              <PanelTitle title="How you earn points" />
              <ul className="divide-y divide-[#eef0f6]">
                {RULES.map((r) => {
                  const so = rewards.byReason[r.reason];
                  return (
                    <li key={r.reason} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-[14px] font-semibold text-slate-700">{r.label}</span>
                      <span className="flex shrink-0 items-center gap-3">
                        {so ? (
                          <span className="text-[12px] font-semibold tabular-nums text-slate-500">
                            {so.toLocaleString('en-KE')} so far
                          </span>
                        ) : null}
                        <span className="bg-gold/20 rounded-full px-2.5 py-0.5 text-[13px] font-extrabold tabular-nums">
                          {r.points}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[12px] font-semibold text-slate-500">
                A missed shift earns nothing and breaks a streak. Points are never taken away.
              </p>
            </section>

            <section className={panel}>
              <PanelTitle title="Latest points" />
              {rewards.recent.length === 0 ? (
                <Nothing
                  title="No points yet."
                  body="Your first delivery earns your first 10 points."
                />
              ) : (
                <ul className="divide-y divide-[#eef0f6]">
                  {rewards.recent.map((p, i) => (
                    <li
                      key={`${p.reason}-${p.earnedAt}-${i}`}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold">
                          {REASON[p.reason] ?? p.reason}
                        </span>
                        <span className="text-[12px] font-semibold text-slate-500">
                          {when(p.earnedAt)}
                        </span>
                      </span>
                      <span className="text-[15px] font-extrabold tabular-nums text-green-700">
                        +{p.points}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <section className={panel}>
        <PanelTitle
          title="Refer a rider"
          note="200 points when they go active, plus any cash reward rider ops sets"
        />
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="rounded-2xl bg-[#f6f7fb] p-4 text-center">
            {code ? (
              <>
                <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">
                  Your code
                </p>
                <p className="mt-1 font-mono text-[28px] font-extrabold tracking-[0.2em]">{code}</p>
                <p className="mt-1 text-[12px] font-semibold text-slate-600">
                  They enter it when they apply. It cannot be added afterwards.
                </p>
              </>
            ) : (
              <p className="text-[13px] font-semibold text-slate-600">
                No code yet. Ask rider ops for your referral code; it is issued once.
              </p>
            )}
          </div>
          {referrals.length === 0 ? (
            <p className="self-center text-[13px] font-semibold text-slate-500">
              Nobody yet. Bring one or two people you already ride with.
            </p>
          ) : (
            <ul className="divide-y divide-[#eef0f6]">
              {referrals.map((r) => {
                const st = STATUS[r.status] ?? {
                  label: r.status,
                  tone: 'bg-slate-100 text-slate-600',
                };
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-extrabold">
                        {r.referred_name ?? '—'}
                      </span>
                      <span className="text-[12px] font-semibold text-slate-500">
                        Invited {when(r.created_at)}
                        {r.first_trip_at ? ` · first trip ${when(r.first_trip_at)}` : ''}
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11.5px] font-extrabold ${st.tone}`}
                    >
                      {st.label}
                    </span>
                    <span className="w-20 text-right text-[13px] font-extrabold tabular-nums">
                      {r.reward_amount_kes ? kesh(r.reward_amount_kes) : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </RiderPage>
  );
}
