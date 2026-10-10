import { Panel, Row, Tile, kesh } from '@/components/rider/bits';
import { RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Refer a rider' };
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

const STATUS: Record<string, { label: string; tone: string }> = {
  invited: { label: 'Invited', tone: 'bg-bg text-muted' },
  applied: { label: 'Applied', tone: 'bg-info-bg text-info' },
  in_review: { label: 'In review', tone: 'bg-warning-bg text-warning' },
  active: { label: 'Riding', tone: 'bg-success/10 text-success' },
  void: { label: 'Not proceeding', tone: 'bg-bg text-muted-light' },
};

const REWARD: Record<string, string> = {
  pending: 'Not yet',
  earned: 'Earned · next Friday',
  paid: 'Paid',
  void: '—',
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

/**
 * Bring somebody you would ride with.
 *
 * The reward lands when the person you brought has actually
 * worked, not when they sign up — which is the difference
 * between a referral scheme and a list of names. The page says
 * so before anybody shares a code, rather than after they have
 * brought five people who never rode.
 */
export default async function RiderRefer() {
  const { h, supabase } = await riderContext();
  if (!h) return null;

  const { data } = await supabase
    .from('rider_referral_v')
    .select('*')
    .eq('referrer_rider_id', h.rider_id)
    .limit(50);

  const all = (data as ReferralRow[] | null) ?? [];
  const riding = all.filter((r) => r.status === 'active');
  const waiting = all.filter((r) => r.status !== 'active' && r.status !== 'void');
  const earned = all
    .filter((r) => r.reward_status === 'earned' || r.reward_status === 'paid')
    .reduce((sum, r) => sum + (r.reward_amount_kes ?? 0), 0);
  const paid = all
    .filter((r) => r.reward_status === 'paid')
    .reduce((sum, r) => sum + (r.reward_amount_kes ?? 0), 0);

  /* Their own code if they have shared one, otherwise the one
     the scheme would issue. Both are the same string today;
     reading it from a row rather than building it here means
     the page cannot disagree with the record. */
  const code = all[0]?.code ?? null;

  return (
    <RiderBoard>
      <RiderPageHead
        title="Refer a rider"
        lead="Bring somebody you would be happy to ride beside. The reward lands after their first week of trips, not when they sign up."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          value={String(riding.length)}
          label="Riding now"
          note={riding.length > 0 ? 'people you brought' : 'none yet'}
          noteTone={riding.length > 0 ? 'good' : 'plain'}
        />
        <Tile
          value={String(waiting.length)}
          label="On the way"
          note={waiting.length > 0 ? 'applied or in review' : 'nobody pending'}
        />
        <Tile value={kesh(earned)} label="Earned" note="across all referrals" />
        <Tile
          value={kesh(earned - paid)}
          label="Still to come"
          note={earned - paid > 0 ? 'on an upcoming Friday' : 'all paid'}
          noteTone={earned - paid > 0 ? 'gold' : 'good'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Your code">
            <div className="px-4 py-5 text-center">
              {code ? (
                <>
                  <p className="font-mono text-[2rem] font-extrabold tracking-[0.2em]">{code}</p>
                  <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.6]">
                    They enter this when they apply. It is the only thing that links them to you
                    — if they forget it, rider ops cannot add it afterwards.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-light text-[0.875rem] font-extrabold">
                    No code issued yet
                  </p>
                  <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.6]">
                    Ask rider ops for your referral code and it appears here. It is issued once
                    and does not change.
                  </p>
                </>
              )}
            </div>
          </Panel>

          <Panel title="People you brought">
            {all.length === 0 ? (
              <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                Nobody yet. The riders who do best at this bring one or two people they already
                ride with, not a list of numbers.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-border bg-bg border-b">
                    <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                      <th className="px-4 py-2">Who</th>
                      <th className="px-4 py-2">Invited</th>
                      <th className="px-4 py-2">First trip</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2 text-right">Reward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.map((r) => {
                      const st = STATUS[r.status] ?? { label: r.status, tone: 'bg-bg text-muted' };
                      return (
                        <tr
                          key={r.id}
                          className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                        >
                          <td className="px-4 py-3 font-extrabold">{r.referred_name ?? '—'}</td>
                          <td className="text-muted-light px-4 py-3">{when(r.created_at)}</td>
                          <td className="text-muted px-4 py-3">
                            {r.first_trip_at ? when(r.first_trip_at) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${st.tone}`}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="block font-extrabold tabular-nums">
                              {r.reward_amount_kes ? kesh(r.reward_amount_kes) : '—'}
                            </span>
                            <span className="text-muted-light text-[0.6875rem] font-semibold">
                              {REWARD[r.reward_status] ?? r.reward_status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
              Only a first name is shown. Somebody who applied and did not go through is still a
              person who applied for a job, and that is not yours to see in full.
            </p>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="How it pays">
            <Row label="They apply" value="nothing yet" tone="muted" />
            <Row label="They are approved" value="nothing yet" tone="muted" />
            <Row label="Their first week of trips" value="reward earned" />
            <Row label="Paid on" value="the next Friday" />
          </Panel>

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              Why it waits for the trips
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              Paying on sign-up pays for names, and a scheme that pays for names fills the city
              with riders who never ride. Paying after the first week pays for somebody who
              actually turned up — which is the person you were being asked for.
            </p>
          </section>
        </aside>
      </div>
    </RiderBoard>
  );
}
