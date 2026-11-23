import { CalendarDays } from 'lucide-react';
import Image from 'next/image';

import { riderContext } from '@/components/rider/frame';
import { ShiftPlanner } from '@/components/rider/shift-planner';
import { KpiCard, PageHead, PanelTitle, RiderPage, panel } from '@/components/rider/ui';

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

  const { data: zoneRows } = await supabase
    .from('zone')
    .select('id, name')
    .eq('active', true)
    .order('name');
  const zones = (zoneRows as { id: string; name: string }[] | null) ?? [];
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
    <RiderPage>
      <PageHead title="Schedule Shifts" lead="Plan your working hours" />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          icon={<CalendarDays />}
          tone="gold"
          value={String(upcoming.filter((s) => s.status === 'committed').length)}
          label={
            upcoming[0] ? `Booked ahead · next ${day(upcoming[0].date)}` : 'Booked ahead · none yet'
          }
        />
        <KpiCard
          icon={<span className="text-[17px] font-extrabold">%</span>}
          tone="green"
          value={keptPct === null ? '—' : `${keptPct}%`}
          label={
            keptPct === null
              ? `Kept · ${decided} of 5 shifts needed`
              : `Kept · ${kept} of ${decided}`
          }
        />
        <KpiCard
          icon={<span className="text-[17px] font-extrabold">!</span>}
          tone={missed > 0 ? 'red' : 'blue'}
          value={String(missed)}
          label="Missed in the last 60 days"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ShiftPlanner zones={zones} booked={all} active={h.status === 'active'} />

        <section className="relative isolate flex min-h-[18rem] flex-col justify-end overflow-hidden rounded-[20px] bg-[#0b1d4a] p-5 text-white">
          <Image
            src="/images/join/rider.jpg"
            alt=""
            fill
            sizes="(min-width: 1280px) 30vw, 100vw"
            className="-z-20 object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0b1d4a] via-[#0b1d4a]/80 to-transparent" />
          <h2 className="text-[20px] font-extrabold leading-tight">Book your preferred shifts</h2>
          <p className="mt-1 text-[13.5px] text-white/85">
            A booked shift puts you first for offers in your zone when there are more riders than
            orders. Your pay rate does not change and there is no minimum number of trips.
          </p>
          <p className="mt-3 text-[12px] font-semibold text-white/70">
            A shift is not a contract: you are not employed by the hour.
          </p>
        </section>
      </div>

      <section className={panel}>
        <PanelTitle title="Your record" note="Shifts that have passed" />
        {past.length === 0 ? (
          <p className="py-8 text-center text-[13px] font-semibold text-slate-500">
            Nothing worked yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-[#eef0f6]">
                <tr className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Window</th>
                  <th className="px-3 py-2">Zone</th>
                  <th className="px-3 py-2">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {past.map((s) => {
                  const st = STATUS[s.status] ?? { label: s.status, tone: 'bg-bg text-muted' };
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-[#eef0f6] text-[13px] font-semibold last:border-0"
                    >
                      <td className="px-3 py-3 font-extrabold">{day(s.date)}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {WINDOW[s.time_window] ?? s.time_window}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{s.zone_name ?? '—'}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${st.tone}`}
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
      </section>
    </RiderPage>
  );
}
