import { Panel, Row, Tile } from '@/components/rider/bits';
import { RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Health' };
export const dynamic = 'force-dynamic';

interface HealthRow {
  as_of: string;
  score: number | null;
  band: string | null;
  acceptance_pct: number | null;
  on_time_pct: number | null;
  cancel_after_accept_pct: number | null;
  rating_avg: number | null;
  handoff_compliance_pct: number | null;
  safety_pct: number | null;
  issues_30d: number;
  trips_30d: number;
  weights: Record<string, number> | null;
  trend: number[] | null;
}

interface StrikeRow {
  id: string;
  level: number;
  reason: string;
  issued_at: string;
  expires_at: string | null;
  cleared_at: string | null;
  active: boolean;
}

const BAND: Record<string, { label: string; tone: string; means: string }> = {
  green: {
    label: 'Good',
    tone: 'bg-success/10 text-success',
    means: 'Offers come to you first in your zone, and you are eligible for bonuses.',
  },
  amber: {
    label: 'Watch',
    tone: 'bg-warning-bg text-warning',
    means: 'You still get offers, but after riders in the Good band when both are free.',
  },
  red: {
    label: 'At risk',
    tone: 'bg-danger-bg text-danger',
    means: 'Rider ops will be in touch. Offers are limited while this is worked through.',
  },
};

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(Number(v))}%`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  });
}

/**
 * The band, and the arithmetic behind it.
 *
 * Every measure is shown with the weight it carries, because a
 * score a rider cannot reproduce is a score they cannot argue
 * with — and the whole point of showing it is so they can see
 * which one thing to change.
 */
export default async function RiderHealth() {
  const { h, supabase } = await riderContext();
  if (!h) return null;

  const [healthRes, strikeRes] = await Promise.all([
    supabase.from('rider_health_v').select('*').eq('rider_id', h.rider_id).maybeSingle(),
    supabase.from('rider_strike_v').select('*').eq('rider_id', h.rider_id).limit(20),
  ]);

  const s = healthRes.data as HealthRow | null;
  const strikes = (strikeRes.data as StrikeRow[] | null) ?? [];
  const active = strikes.filter((x) => x.active);

  const band = s?.band ? (BAND[s.band] ?? null) : null;
  const w = s?.weights ?? {};

  const measures: { key: string; label: string; value: string; why: string }[] = [
    {
      key: 'acceptance',
      label: 'Acceptance',
      value: pct(s?.acceptance_pct),
      why: 'Offers you took, of those you were shown.',
    },
    {
      key: 'on_time',
      label: 'On time',
      value: pct(s?.on_time_pct),
      why: 'Delivered inside the window the guest was promised.',
    },
    {
      key: 'cancels',
      label: 'Cancelled after accepting',
      value: pct(s?.cancel_after_accept_pct),
      why: 'Lower is better. This is the one guests feel most.',
    },
    {
      key: 'rating',
      label: 'Guest rating',
      value: s?.rating_avg === null || s?.rating_avg === undefined ? '—' : `${s.rating_avg} ★`,
      why: 'Across rated deliveries in the last 30 days.',
    },
    {
      key: 'handoff',
      label: 'Hand-off done properly',
      value: pct(s?.handoff_compliance_pct),
      why: 'PIN confirmed, photo where the address needs one.',
    },
    {
      key: 'safety',
      label: 'Safety',
      value: pct(s?.safety_pct),
      why: 'No incident on your side in the period.',
    },
  ];

  const trend = s?.trend ?? [];
  const trendMax = Math.max(1, ...trend);

  return (
    <RiderBoard>
      <RiderPageHead
        title="Health"
        lead="One score, built from six things you control, each shown with the weight it carries. Your band decides who gets offered an order first when two riders are free."
      />

      {s === null ? (
        <Panel title="Your band">
          <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
            Nothing scored yet. Your first snapshot is taken after your first full week of trips —
            a band built from three deliveries would say more about the week than about you.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              value={s.score === null ? '—' : String(s.score)}
              label="Your score"
              note={band ? band.label : 'not banded'}
              noteTone={s.band === 'green' ? 'good' : s.band === 'red' ? 'danger' : 'gold'}
            />
            <Tile value={String(s.trips_30d)} label="Trips" note="last 30 days" />
            <Tile
              value={String(s.issues_30d)}
              label="Issues"
              note={s.issues_30d > 0 ? 'count against safety' : 'none'}
              noteTone={s.issues_30d > 0 ? 'gold' : 'good'}
            />
            <Tile
              value={String(active.length)}
              label="Active strikes"
              note={active.length > 0 ? 'see below' : 'none'}
              noteTone={active.length > 0 ? 'danger' : 'good'}
            />
          </div>

          {band ? (
            <section className="border-border bg-surface rounded-xl border px-4 py-3">
              <p className="text-[0.8125rem] font-extrabold">
                <span className={`rounded-full px-2 py-0.5 ${band.tone}`}>{band.label}</span>
                <span className="text-muted-light ml-2 font-semibold">
                  as of {when(s.as_of)}
                </span>
              </p>
              <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.6]">
                {band.means}
              </p>
            </section>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              <Panel title="What makes the score">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="border-border bg-bg border-b">
                      <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                        <th className="px-4 py-2">Measure</th>
                        <th className="px-4 py-2 text-right">You</th>
                        <th className="px-4 py-2 text-right">Weight</th>
                        <th className="px-4 py-2">What it counts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {measures.map((m) => (
                        <tr
                          key={m.key}
                          className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                        >
                          <td className="px-4 py-3 font-extrabold">{m.label}</td>
                          <td className="px-4 py-3 text-right font-extrabold tabular-nums">
                            {m.value}
                          </td>
                          <td className="text-muted px-4 py-3 text-right tabular-nums">
                            {w[m.key] === undefined ? '—' : `${w[m.key]}%`}
                          </td>
                          <td className="text-muted-light px-4 py-3 text-[0.75rem]">{m.why}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
                  The weights are the ones actually used to compute your score, read from the
                  snapshot rather than typed onto this page. If they change, this changes with
                  them.
                </p>
              </Panel>

              {strikes.length > 0 ? (
                <Panel title="Strikes">
                  <div className="divide-border divide-y">
                    {strikes.map((x) => (
                      <div key={x.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[0.875rem] font-extrabold">
                            Level {x.level}
                            <span
                              className={`ml-2 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                                x.active
                                  ? 'bg-danger-bg text-danger'
                                  : 'bg-success/10 text-success'
                              }`}
                            >
                              {x.active ? 'Active' : x.cleared_at ? 'Cleared' : 'Expired'}
                            </span>
                          </p>
                          <span className="text-muted-light text-[0.6875rem] font-semibold">
                            {when(x.issued_at)}
                          </span>
                        </div>
                        <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.6]">
                          {x.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}
            </div>

            <aside className="space-y-4">
              <Panel title="Your score over time">
                {trend.length === 0 ? (
                  <p className="text-muted-light px-4 py-6 text-center text-[0.75rem] font-semibold">
                    Not enough history yet.
                  </p>
                ) : (
                  <div className="flex items-end gap-1.5 px-4 py-4" style={{ height: '7rem' }}>
                    {trend.map((v, i) => (
                      <span
                        key={i}
                        className="bg-gold flex-1 rounded-t"
                        style={{ height: `${Math.max(6, (v / trendMax) * 100)}%` }}
                        title={String(v)}
                      />
                    ))}
                  </div>
                )}
                <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold">
                  Most recent on the right.
                </p>
              </Panel>

              <Panel title="What moves it fastest">
                <Row label="Cancelling after accepting" value="hurts most" />
                <Row label="Confirming the PIN" value="helps most" />
                <Row label="Taking more trips" value="no effect" tone="muted" />
                <Row label="Working more hours" value="no effect" tone="muted" />
              </Panel>

              <section className="bg-ink rounded-xl p-4 text-white">
                <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
                  Volume is not quality
                </h2>
                <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
                  Nothing here rewards working longer. A rider doing twelve careful trips a day
                  bands above one doing thirty in a hurry, and that is deliberate — the score is
                  about the deliveries a guest would want again.
                </p>
              </section>
            </aside>
          </div>
        </>
      )}
    </RiderBoard>
  );
}
