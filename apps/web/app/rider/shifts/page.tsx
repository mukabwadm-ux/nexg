import { Panel, Row, Tile } from '@/components/rider/bits';
import { RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Shifts' };
export const dynamic = 'force-dynamic';

interface ShiftRow {
  id: string;
  date: string;
  time_window: string;
  status: string;
  committed_at: string;
  showed_at: string | null;
  zone_name: string | null;
  counted_as_missed: boolean;
}

const WINDOW: Record<string, string> = {
  morning: 'Morning · 07:00–11:00',
  lunch: 'Lunch · 11:00–15:00',
  dinner: 'Dinner · 17:00–22:00',
  late: 'Late · 22:00–01:00',
};

const STATUS: Record<string, { label: string; tone: string }> = {
  committed: { label: 'Committed', tone: 'bg-info-bg text-info' },
  showed: { label: 'Showed', tone: 'bg-success/10 text-success' },
  no_show: { label: 'Missed', tone: 'bg-danger-bg text-danger' },
  released: { label: 'Released', tone: 'bg-bg text-muted' },
};

function day(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

/**
 * The hours you said you would work.
 *
 * A commitment is worth something only if missing it costs
 * something, so the page shows the kept-rate as prominently as
 * the rota. It also shows how to give a shift back, because the
 * alternative to an easy release is a quiet no-show.
 */
export default async function RiderShifts() {
  const { h, supabase } = await riderContext();
  if (!h) return null;

  const { data } = await supabase
    .from('rider_shift_v')
    .select('*')
    .eq('rider_id', h.rider_id)
    .limit(60);

  const all = (data as ShiftRow[] | null) ?? [];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

  const upcoming = all.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = all.filter((s) => s.date < today);
  const kept = past.filter((s) => s.status === 'showed').length;
  const missed = past.filter((s) => s.counted_as_missed).length;
  const decided = kept + missed;

  /* Under five shifts a percentage is noise, so it is not
     shown. Ground rule 3: a figure derived from almost nothing
     is still an invented figure. */
  const keptPct = decided >= 5 ? Math.round((kept / decided) * 100) : null;

  return (
    <RiderBoard>
      <RiderPageHead
        title="Shifts"
        lead="The windows you committed to, by zone. Showing up for what you commit to is what keeps you first in the queue when offers are shared out."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          value={String(upcoming.length)}
          label="Committed ahead"
          note={upcoming[0] ? `next ${day(upcoming[0].date)}` : 'nothing booked'}
          noteTone={upcoming.length > 0 ? 'good' : 'gold'}
        />
        <Tile
          value={keptPct === null ? '—' : `${keptPct}%`}
          label="Kept"
          note={keptPct === null ? `${decided} of 5 shifts needed` : `${kept} of ${decided}`}
        />
        <Tile
          value={String(missed)}
          label="Missed"
          note={missed > 0 ? 'last 60 days' : 'none'}
          noteTone={missed > 0 ? 'danger' : 'good'}
        />
        <Tile value={String(past.length)} label="Worked" note="shifts on record" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Coming up">
            {upcoming.length === 0 ? (
              <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                Nothing committed. You can still take offers without a shift — a shift just puts
                you first when there are more riders than orders.
              </p>
            ) : (
              <div className="divide-border divide-y">
                {upcoming.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.875rem] font-extrabold">
                        {day(s.date)}
                        {s.date === today ? (
                          <span className="bg-gold text-ink ml-2 rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold">
                            today
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">
                        {WINDOW[s.time_window] ?? s.time_window} · {s.zone_name ?? 'zone not set'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                        (STATUS[s.status] ?? STATUS.committed)!.tone
                      }`}
                    >
                      {(STATUS[s.status] ?? STATUS.committed)!.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
              Need to give one back? Tell rider ops before the window starts and it is released
              rather than missed. Released shifts do not count against you; a quiet no-show does.
            </p>
          </Panel>

          <Panel title="Your record">
            {past.length === 0 ? (
              <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                Nothing worked yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-border bg-bg border-b">
                    <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                      <th className="px-4 py-2">Day</th>
                      <th className="px-4 py-2">Window</th>
                      <th className="px-4 py-2">Zone</th>
                      <th className="px-4 py-2">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.map((s) => {
                      const st = STATUS[s.status] ?? { label: s.status, tone: 'bg-bg text-muted' };
                      return (
                        <tr
                          key={s.id}
                          className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                        >
                          <td className="px-4 py-3 font-extrabold">{day(s.date)}</td>
                          <td className="text-muted px-4 py-3">
                            {WINDOW[s.time_window] ?? s.time_window}
                          </td>
                          <td className="text-muted px-4 py-3">{s.zone_name ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${st.tone}`}
                            >
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="What a shift gets you">
            <Row label="Offers in your window" value="first" />
            <Row label="Zone you chose" value="held for you" />
            <Row label="Pay rate" value="unchanged" tone="muted" />
            <Row label="Minimum trips" value="none" tone="muted" />
          </Panel>

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              A shift is not a contract
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              You are not employed by the hour and nothing here changes that. A shift is a promise
              that you will be online in a zone at a time, so dispatch can plan — and the only
              thing it changes is who gets offered an order first when there are more riders than
              orders.
            </p>
          </section>
        </aside>
      </div>
    </RiderBoard>
  );
}
