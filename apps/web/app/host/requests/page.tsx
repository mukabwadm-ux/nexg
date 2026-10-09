import { DASH } from '@/components/host/bits';
import {
  Bar,
  Dot,
  Fact,
  HowItWorks,
  Kpi,
  KpiRow,
  Pill,
  Segmented,
  Table,
  Td,
  Tr,
  TwoColumn,
} from '@/components/host/module';
import { RaiseRequest, RequestActions } from '@/components/host/request-client';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Requests & Issues' };
export const dynamic = 'force-dynamic';

interface RequestRow {
  id: string;
  reference: string;
  unit_name: string | null;
  guest_first_name: string | null;
  kind: string;
  type: string;
  priority: string;
  title: string;
  detail: string | null;
  raised_by: string;
  owner_kind: string;
  due_at: string | null;
  status: string;
  outcome: string | null;
  satisfaction: number | null;
  created_at: string;
  overdue: boolean;
  minutes_left: number | null;
  resolved_in_minutes: number | null;
}

interface Rule {
  priority: string;
  minutes: number;
  label: string;
}

const OWNER: Record<string, string> = {
  nexg_concierge: 'NexG concierge',
  host: 'You',
  nexg_support: 'NexG support',
  nexg_rider_ops: 'NexG rider ops',
  auto: 'Auto-answered',
};

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'danger' | 'info' | 'plain' }> = {
  open: { label: 'Open', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  waiting_on_host: { label: 'Waiting on you', tone: 'warn' },
  waiting_on_guest: { label: 'Waiting on guest', tone: 'plain' },
  quoted: { label: 'Quoted · awaiting guest', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'good' },
  closed: { label: 'Closed', tone: 'plain' },
};

const TAB = {
  open: (r: RequestRow) => !['resolved', 'closed'].includes(r.status),
  waiting: (r: RequestRow) => r.status === 'waiting_on_host',
  nexg: (r: RequestRow) => r.owner_kind.startsWith('nexg') && !['resolved', 'closed'].includes(r.status),
  resolved: (r: RequestRow) => ['resolved', 'closed'].includes(r.status),
} as const;

/**
 * What guests asked for and what went wrong.
 *
 * The clock is the whole page. Everything else here —
 * conversations, notes, who owns it — exists elsewhere in some
 * form; what did not exist was a single list that answers "what
 * is late, and who is it waiting on". A guest locked out of a
 * flat at eleven at night is not a thing to find in a thread.
 */
export default async function HostRequestsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const [reqRes, ruleRes, unitRes] = await Promise.all([
    supabase
      .from('host_request_v')
      .select('*')
      .eq('host_id', me.id)
      .order('due_at', { nullsFirst: false }),
    supabase.from('host_priority_rule').select('*').eq('host_id', me.id),
    supabase.from('host_unit_list_v').select('id, name').eq('host_id', me.id).order('name'),
  ]);

  const all = (reqRes.data as RequestRow[] | null) ?? [];
  const rules = (ruleRes.data as Rule[] | null) ?? [];
  const units = (unitRes.data as { id: string; name: string }[] | null) ?? [];

  const tab = (searchParams?.tab ?? 'open') as keyof typeof TAB;
  const rows = all.filter(TAB[tab] ?? TAB.open);

  const open = all.filter(TAB.open);
  const waiting = all.filter(TAB.waiting);
  const high = open.filter((r) => r.priority === 'high');
  const resolved = all.filter((r) => r.resolved_in_minutes !== null);
  const medianMinutes = median(resolved.map((r) => Number(r.resolved_in_minutes)));

  /* What guests actually ask for, biggest first. The bar chart
     in the design, and the only thing on this page that
     suggests a fix rather than reporting a state. */
  const byType = new Map<string, number>();
  for (const r of all) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
  const typeBars = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const topType = typeBars[0];
  const maxType = topType?.[1] ?? 0;

  const raisedByHost = all.filter((r) => r.raised_by === 'host').length;
  const rated = all.filter((r) => r.satisfaction !== null);

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/requests"
      title="Requests & Issues"
      lead="What guests are asking for and what has gone wrong, with priority, owner and deadline. The concierge handles most; what needs a host decision comes to you."
      headlineValue={String(open.length)}
      headlineNote={`${waiting.length} waiting on you`}
    >
      <KpiRow>
        <Kpi label="Open" value={String(open.length)} note={`${waiting.length} waiting on you`} />
        <Kpi
          label="High priority"
          value={String(high.length)}
          note={high[0]?.type.replace('_', ' ') ?? 'none open'}
          tone={high.length > 0 ? 'danger' : 'plain'}
        />
        <Kpi
          label="Median resolution"
          value={medianMinutes === null ? DASH : `${medianMinutes} min`}
          note={resolved.length < 5 ? `only ${resolved.length} resolved` : 'all time'}
        />
        <Kpi
          label="Top request"
          value={topType ? label(topType[0]) : DASH}
          note={
            topType && all.length > 0
              ? `${Math.round((topType[1] / all.length) * 100)}% of requests`
              : undefined
          }
        />
        <Kpi label="Raised by you" value={String(raisedByHost)} note="issues you reported" />
        <Kpi
          label="Satisfaction"
          value={
            rated.length >= 3
              ? (rated.reduce((a, r) => a + Number(r.satisfaction), 0) / rated.length).toFixed(1)
              : DASH
          }
          note={rated.length < 3 ? `${rated.length} rated — too few` : `${rated.length} rated`}
        />
      </KpiRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          base="/host/requests"
          param="tab"
          current={tab}
          options={[
            { key: 'open', label: 'Open', count: open.length },
            { key: 'waiting', label: 'Waiting on you', count: waiting.length },
            { key: 'nexg', label: 'With NexG', count: all.filter(TAB.nexg).length },
            { key: 'resolved', label: 'Resolved', count: all.filter(TAB.resolved).length },
          ]}
        />
        <RaiseRequest hostId={me.id} units={units} />
      </div>

      <TwoColumn
        rail={
          <>
            {waiting[0] ? (
              <section className="border-gold/40 bg-gold-soft rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[0.875rem] font-extrabold leading-snug">
                    <Dot tone={waiting[0].priority === 'high' ? 'danger' : 'warn'} />
                    {waiting[0].title}
                  </h2>
                </div>
                <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
                  {waiting[0].reference} · opened {ago(waiting[0].created_at)} · raised by{' '}
                  {waiting[0].raised_by}
                </p>
                {waiting[0].detail ? (
                  <p className="border-border bg-surface text-muted mt-3 rounded-lg border p-3 text-[0.75rem] font-semibold leading-[1.65]">
                    {waiting[0].detail}
                  </p>
                ) : null}
                <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.6]">
                  Replying, approving and the secure actions — updating a gate code, changing a
                  hand-off rule — are the next piece of this build. The concierge desk can do all
                  of them now; Get Help reaches them with this request attached.
                </p>
              </section>
            ) : null}

            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                  Rules for priority
                </h2>
              </div>
              {rules.length === 0 ? (
                <p className="text-muted-light px-4 py-6 text-center text-[0.75rem] font-semibold">
                  No rules set, so nothing has a deadline.
                </p>
              ) : (
                ['high', 'medium', 'low'].map((p) => {
                  const r = rules.find((x) => x.priority === p);
                  if (!r) return null;
                  return (
                    <Fact
                      key={p}
                      label={
                        <span className="capitalize">
                          <Dot tone={p === 'high' ? 'danger' : p === 'medium' ? 'warn' : 'good'} />
                          {p}
                        </span>
                      }
                      value={
                        <span>
                          {r.label}
                          <span className="text-muted-light block text-[0.6875rem] font-semibold">
                            {r.minutes < 60
                              ? `${r.minutes} min`
                              : r.minutes < 1440
                                ? `${r.minutes / 60} h`
                                : 'same day'}
                          </span>
                        </span>
                      }
                    />
                  );
                })
              )}
            </section>

            <HowItWorks title="What the guest sees">
              Everything on this page is logged. A guest sees the outcome of a request — a code
              that works, a late check-out confirmed — and never your codes, your notes or who on
              your team handled it.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Priority', 'Guest · unit', 'Type', 'Request', 'Owner', 'Due', 'Status', '>Action']}
          empty={
            tab === 'open'
              ? 'Nothing open. Not a loading state — every request has been dealt with.'
              : 'Nothing in this view.'
          }
        >
          {rows.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, tone: 'plain' as const };
            return (
              <Tr key={r.id} tone={r.overdue ? 'danger' : r.priority === 'high' ? 'warn' : 'plain'}>
                <Td strong>
                  <span className="capitalize">
                    <Dot
                      tone={
                        r.priority === 'high'
                          ? 'danger'
                          : r.priority === 'medium'
                            ? 'warn'
                            : 'good'
                      }
                    />
                    {r.priority}
                  </span>
                </Td>
                <Td note={r.unit_name ?? undefined}>{r.guest_first_name ?? 'Guest'}</Td>
                <Td>{label(r.type)}</Td>
                <Td strong note={r.outcome ?? undefined}>
                  {r.title}
                </Td>
                <Td>{OWNER[r.owner_kind] ?? r.owner_kind}</Td>
                <Td>
                  {r.resolved_in_minutes !== null ? (
                    <span className="text-success">{r.resolved_in_minutes} min</span>
                  ) : r.minutes_left === null ? (
                    DASH
                  ) : r.minutes_left < 0 ? (
                    <span className="text-danger font-extrabold">
                      {Math.abs(r.minutes_left)} min late
                    </span>
                  ) : (
                    <span className={r.minutes_left < 15 ? 'text-danger font-extrabold' : ''}>
                      {r.minutes_left < 60
                        ? `${r.minutes_left} min`
                        : `${Math.round(r.minutes_left / 60)} h`}
                    </span>
                  )}
                </Td>
                <Td>
                  <Pill tone={st.tone}>{st.label}</Pill>
                </Td>
                <Td right>
                  <RequestActions
                    requestId={r.id}
                    reference={r.reference}
                    title={r.title}
                    resolved={r.resolved_in_minutes !== null}
                  />
                </Td>
              </Tr>
            );
          })}
        </Table>

        {typeBars.length > 0 ? (
          <section className="border-border bg-surface rounded-xl border p-4">
            <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
              What guests ask for
            </h2>
            <p className="text-muted-light mt-0.5 text-[0.75rem] font-semibold">
              Across every request on this account.
            </p>
            <div className="mt-3 space-y-2">
              {typeBars.map(([t, n]) => (
                <Bar key={t} label={label(t)} value={n} max={maxType} />
              ))}
            </div>
            {topType && topType[1] >= 3 ? (
              <p className="text-muted-light mt-3 text-[0.75rem] font-semibold leading-[1.65]">
                {label(topType[0])} leads. If that keeps up, a standing arrangement for it would
                remove the request rather than speed it up.
              </p>
            ) : null}
          </section>
        ) : null}
      </TwoColumn>
    </HostSection>
  );
}

function label(s: string): string {
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0);
}

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}
