import { Panel, Row, Tile, kesh } from '@/components/rider/bits';
import { RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Incidents' };
export const dynamic = 'force-dynamic';

interface IncidentRow {
  id: string;
  order_reference: string | null;
  kind: string;
  severity: string;
  status: string;
  happened_at: string;
  description: string | null;
  injury: boolean;
  compensation_kes: number | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
}

const KIND: Record<string, string> = {
  accident: 'Accident',
  harassment: 'Harassment',
  theft: 'Theft',
  guest_complaint: 'Guest complaint',
  rider_complaint: 'Your complaint',
  police_stop: 'Police stop',
  breakdown: 'Breakdown',
  sos: 'SOS',
  other: 'Other',
};

const SEVERITY: Record<string, string> = {
  minor: 'bg-bg text-muted',
  major: 'bg-warning-bg text-warning',
  critical: 'bg-danger-bg text-danger',
};

const STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: 'Open', tone: 'bg-warning-bg text-warning' },
  investigating: { label: 'Being looked at', tone: 'bg-info-bg text-info' },
  resolved: { label: 'Resolved', tone: 'bg-success/10 text-success' },
  closed: { label: 'Closed', tone: 'bg-bg text-muted' },
};

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

/** Minutes between two timestamps, as a readable gap. */
function gap(from: string, to: string): string {
  const mins = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / 1440)} d`;
}

/**
 * Anything that went wrong, and what happened next.
 *
 * Every entry shows how long it took somebody to acknowledge
 * it. A rider who reports an accident and hears nothing stops
 * reporting accidents, and then the first anybody at NexG
 * hears of one is from a guest or a hospital.
 */
export default async function RiderIncidents() {
  const { h, supabase } = await riderContext();
  if (!h) return null;

  const { data } = await supabase
    .from('rider_incident_v')
    .select('*')
    .eq('rider_id', h.rider_id)
    .limit(50);

  const all = (data as IncidentRow[] | null) ?? [];
  const open = all.filter((i) => i.status === 'open' || i.status === 'investigating');
  const acknowledged = all.filter((i) => i.acknowledged_at !== null);
  const paid = all.reduce((sum, i) => sum + (i.compensation_kes ?? 0), 0);

  const acks = acknowledged
    .map((i) => (new Date(i.acknowledged_at as string).getTime() - new Date(i.happened_at).getTime()) / 60000)
    .sort((a, b) => a - b);
  const medianAck = acks.length >= 3 ? Math.round(acks[Math.floor(acks.length / 2)] as number) : null;

  return (
    <RiderBoard>
      <RiderPageHead
        title="Incidents"
        lead="Accidents, thefts, police stops, breakdowns and complaints — yours and ones made about you. Everything here is on your record and so is what NexG did about it."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          value={String(open.length)}
          label="Still open"
          note={open.length > 0 ? 'with rider ops' : 'nothing open'}
          noteTone={open.length > 0 ? 'gold' : 'good'}
        />
        <Tile value={String(all.length)} label="On your record" note="all time" />
        <Tile
          value={medianAck === null ? '—' : medianAck < 60 ? `${medianAck} min` : `${Math.round(medianAck / 60)} h`}
          label="Median acknowledgement"
          note={medianAck === null ? `${acks.length} of 3 needed` : 'on your reports'}
        />
        <Tile
          value={kesh(paid)}
          label="Paid to you"
          note={paid > 0 ? 'across incidents' : 'nothing owed'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Everything reported">
            {all.length === 0 ? (
              <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                Nothing has gone wrong. Long may it last — and if it does, report it from the
                order screen or the 24-hour line rather than waiting until you are home.
              </p>
            ) : (
              <div className="divide-border divide-y">
                {all.map((i) => {
                  const st = STATUS[i.status] ?? { label: i.status, tone: 'bg-bg text-muted' };
                  return (
                    <article key={i.id} className="px-4 py-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[0.875rem] font-extrabold">
                            {KIND[i.kind] ?? i.kind}
                            <span
                              className={`ml-2 rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold uppercase ${
                                SEVERITY[i.severity] ?? 'bg-bg text-muted'
                              }`}
                            >
                              {i.severity}
                            </span>
                            {i.injury ? (
                              <span className="bg-danger-bg text-danger ml-1.5 rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold uppercase">
                                injury
                              </span>
                            ) : null}
                          </p>
                          <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
                            {when(i.happened_at)}
                            {i.order_reference ? ` · ${i.order_reference}` : ''}
                            {i.acknowledged_at
                              ? ` · acknowledged in ${gap(i.happened_at, i.acknowledged_at)}`
                              : ' · not acknowledged yet'}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${st.tone}`}
                        >
                          {st.label}
                        </span>
                      </div>

                      {i.description ? (
                        <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.6]">
                          {i.description}
                        </p>
                      ) : null}

                      {i.resolution ? (
                        <div className="border-border bg-bg mt-2.5 rounded-lg border-l-2 px-3 py-2">
                          <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                            What NexG did
                            {i.compensation_kes ? ` · ${kesh(i.compensation_kes)} paid to you` : ''}
                          </p>
                          <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.55]">
                            {i.resolution}
                          </p>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="What counts against you">
            <Row label="An accident you reported" value="no" tone="muted" />
            <Row label="A breakdown" value="no" tone="muted" />
            <Row label="A police stop" value="no" tone="muted" />
            <Row label="A guest complaint upheld" value="yes" />
            <Row label="Not reporting one" value="yes" />
          </Panel>

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              In danger right now
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              Use SOS in the app or call the 24-hour NexG line. It reaches Live Operations, who
              can see where you are and who is near you. Out of hours a person answers a phone,
              not a form — and that difference only matters when it matters.
            </p>
          </section>

          <section className="border-border bg-surface rounded-xl border p-4">
            <h2 className="text-[0.875rem] font-extrabold tracking-tight">Reporting one</h2>
            <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-[1.65]">
              From the order screen while it is open, or from Support afterwards. Report it even
              when nothing came of it — a near miss at the same junction three times is the thing
              that gets the pickup point moved.
            </p>
          </section>
        </aside>
      </div>
    </RiderBoard>
  );
}
