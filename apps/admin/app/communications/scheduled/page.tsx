import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Repeat,
  Send,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ScheduleActions, ScheduleForm } from '@/components/comms/client';
import {
  AudienceChip,
  CHANNEL_COLOR,
  ChannelIcon,
  ChannelIcons,
  Chip,
  CommsHeader,
  CommsTabs,
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  LegendRow,
  Panel,
  WaitingForDatabase,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashKpi, DashKpiGrid, Pagination } from '@/components/portal/dash';
import { DashSearch } from '@/components/portal/dash-filters';
import { cn } from '@nexg/ui';
import {
  asNumber,
  asObject,
  CHANNEL_LABEL,
  clockOnly,
  commsHref,
  label,
  monthGrid,
  n,
  nairobiDay,
  pageNumber,
  rowsOf,
  SCHEDULE_STATUS_LABEL,
  scheduleWords,
  when,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';
import { todayInNairobi } from '@/lib/portal';

export const metadata: Metadata = { title: 'Communications · Scheduled Messages' };
export const dynamic = 'force-dynamic';

const PER = 5;

interface Sched {
  id: string;
  name: string;
  template_name: string | null;
  subject: string | null;
  audiences: string[];
  channels: string[];
  kind: string;
  frequency: string | null;
  weekday: number | null;
  monthday: number | null;
  time_of_day: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  runs: number;
  missed: number;
  status: string;
}

interface Run {
  id: string;
  name: string;
  at: string;
  channels: string[];
  audiences: string[];
}

/**
 * Scheduled Messages: one-time and recurring sends, the month on a calendar,
 * the next seven days, and the form to schedule one. Every run is marketing:
 * it goes to whoever has said yes when it runs.
 */
export default async function ScheduledPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    month?: string;
    q?: string;
    page?: string;
  };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const sp = searchParams ?? {};
  const today = todayInNairobi();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? `${sp.month}-01` : `${today.slice(0, 7)}-01`;
  const page = pageNumber(sp.page);
  const q = await ctx.read('rpc_comms_schedules', {
    p_month: month,
    p_page: page,
    p_per: PER,
    p_search: sp.q ?? null,
  });
  const o = asObject(q.data);
  const k = asObject(o.kpis);
  const rows = rowsOf<Sched>(o.rows);
  const runs = rowsOf<Run>(o.runs);
  const templates = rowsOf<{ id: string; name: string; channels: string[] }>(o.templates);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const canSend = o.level === 'full';
  const href = (extra: Record<string, string | null> = {}) =>
    commsHref('/communications/scheduled', period, {
      city: ctx.city,
      q: sp.q ?? null,
      month: month.slice(0, 7),
      ...extra,
    });

  const byDay = new Map<string, Run[]>();
  for (const r of runs) {
    const d = nairobiDay(r.at);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const channelCounts: Record<string, number> = {};
  for (const r of runs.filter(
    (x) =>
      x.at.slice(0, 7) === month.slice(0, 7) || nairobiDay(x.at).slice(0, 7) === month.slice(0, 7),
  )) {
    for (const c of r.channels) channelCounts[c] = (channelCounts[c] ?? 0) + 1;
  }
  const shift = (m: string, by: number) => {
    const [y, mm] = m.split('-').map(Number) as [number, number];
    const d = new Date(Date.UTC(y, mm - 1 + by, 1));
    return d.toISOString().slice(0, 7);
  };
  const week = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
  );
  const monthName = new Date(`${month}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="Scheduled Messages"
        subtitle="Plan and schedule messages to be sent later or on a recurring basis for guests, hosts, riders and merchants."
        period={period}
        noPeriod
        cities={ctx.cities}
        city={ctx.city}
      />
      <DashCanvas>
        <CommsTabs active="scheduled" period={period} />
        {q.waiting ? (
          <WaitingForDatabase />
        ) : q.error ? (
          <ErrorNote message={q.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={Send}
                label="Scheduled Messages"
                value={n(asNumber(k.total))}
                explain="Schedules not cancelled: waiting, paused or finished."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Sent as Scheduled"
                value={n(asNumber(k.sent))}
                explain="Runs that went out, all time."
              />
              <DashKpi
                icon={Hourglass}
                label="Pending"
                value={n(asNumber(k.pending))}
                explain="Schedules with a run still to come."
              />
              <DashKpi
                icon={Repeat}
                label="Recurring Campaigns"
                value={n(asNumber(k.recurring))}
                explain="Daily, weekly or monthly schedules, running or paused."
              />
              <DashKpi
                icon={Users}
                label="Audiences"
                value={n(asNumber(k.audiences))}
                explain="Different audiences the pending schedules go to."
              />
              <DashKpi
                icon={AlertTriangle}
                iconTone="red"
                label="Missed / Failed"
                value={n(asNumber(k.missed))}
                upIsBad
                explain="Runs skipped because they were more than 6 hours late (the clock was not running)."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,22rem)]">
              <Panel title={monthName} icon={CalendarDays}>
                <div className="mb-2 flex justify-between">
                  <Link
                    href={href({ month: shift(month, -1) })}
                    scroll={false}
                    aria-label="Previous month"
                    className="hover:bg-bg rounded-lg p-1.5"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                  <Link
                    href={href({ month: shift(month, 1) })}
                    scroll={false}
                    aria-label="Next month"
                    className="hover:bg-bg rounded-lg p-1.5"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[0.75rem]">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <span key={d} className="text-muted font-bold">
                      {d}
                    </span>
                  ))}
                  {monthGrid(month).map((c) => {
                    const items = byDay.get(c.day) ?? [];
                    return (
                      <span
                        key={c.day}
                        title={items.map((i) => i.name).join(', ') || undefined}
                        className={cn(
                          'relative flex h-9 flex-col items-center justify-center rounded-full font-semibold tabular-nums',
                          !c.inMonth && 'text-muted-light',
                          c.day === today && 'bg-[#F5A623] text-white',
                        )}
                      >
                        {Number(c.day.slice(8))}
                        {items.length > 0 && (
                          <span className="absolute bottom-0.5 flex gap-0.5">
                            {[...new Set(items.flatMap((i) => i.channels))]
                              .slice(0, 3)
                              .map((ch) => (
                                <span
                                  key={ch}
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ background: CHANNEL_COLOR[ch] }}
                                />
                              ))}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
                <ul className="mt-4 space-y-1.5">
                  {(['email', 'sms', 'whatsapp', 'in_app'] as const).map((c) => (
                    <LegendRow
                      key={c}
                      color={CHANNEL_COLOR[c]!}
                      name={label(CHANNEL_LABEL, c)}
                      value={`(${n(channelCounts[c] ?? 0)})`}
                    />
                  ))}
                </ul>
              </Panel>

              <Panel
                title={`Scheduled Messages (${n(asNumber(o.total))})`}
                note="All upcoming and recurring messages with their schedule, audience and channel."
              >
                <FilterRow>
                  <DashSearch
                    label="Search scheduled messages"
                    placeholder="Search scheduled messages…"
                    value={sp.q ?? ''}
                  />
                </FilterRow>
                <DataTable
                  caption="Scheduled messages"
                  isEmpty={rows.length === 0}
                  empty="Nothing scheduled. Use the form to schedule a message."
                  head={[
                    'Message Name',
                    'Audience',
                    'Channel(s)',
                    'Schedule',
                    'Next run',
                    'Status',
                    '',
                  ]}
                >
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="flex items-center gap-2">
                          <CalendarClock
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-[#E5A800]"
                          />
                          <span className="min-w-0">
                            <span className="block font-bold">{s.name}</span>
                            <span className="text-muted block truncate text-[0.8125rem]">
                              {s.template_name ?? s.subject ?? 'Written message'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {s.audiences.map((a) => (
                            <AudienceChip key={a} audience={a} plural />
                          ))}
                        </span>
                      </td>
                      <td>
                        <ChannelIcons channels={s.channels} />
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="block font-semibold">{scheduleWords(s)}</span>
                        <span className="text-muted block text-[0.8125rem]">
                          {s.kind === 'recurring' ? `(${s.frequency})` : '(one-time)'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">{when(s.next_run_at)}</td>
                      <td>
                        <Chip status={s.status} text={label(SCHEDULE_STATUS_LABEL, s.status)} />
                      </td>
                      <td>
                        <ScheduleActions id={s.id} status={s.status} canEdit={canEdit} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PER}
                  total={asNumber(o.total)}
                  noun="scheduled messages"
                  href={(p) => href({ page: String(p) })}
                />
              </Panel>

              <Panel
                title="Schedule a Message"
                note="Create a one-time or recurring message."
                icon={CalendarClock}
              >
                <ScheduleForm templates={templates} cityId={ctx.city} canSend={canSend} />
                {ctx.city && (
                  <Footnote>
                    Only people in {ctx.cities.find((c) => c.id === ctx.city)?.name} (hosts, riders
                    and merchants with that city).
                  </Footnote>
                )}
              </Panel>
            </div>

            <Panel title="Upcoming Schedule" note="Next 7 days." icon={CalendarClock}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                {week.map((d) => {
                  const items = (byDay.get(d) ?? []).sort((a, b) => a.at.localeCompare(b.at));
                  return (
                    <div
                      key={d}
                      className={cn(
                        'border-border min-h-[8rem] rounded-xl border p-2',
                        d === today && 'border-[#F5A623] bg-[#FFFBF0]',
                      )}
                    >
                      <p className="text-center text-[0.8125rem] font-extrabold">
                        {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {items.map((r) => (
                          <li
                            key={`${r.id}-${r.at}`}
                            className="rounded-lg bg-[#FFF4D6] p-1.5 text-[0.75rem]"
                          >
                            <span className="flex items-center gap-1 font-bold">
                              <ChannelIcon
                                channel={r.channels[0] ?? 'email'}
                                className="h-3.5 w-3.5"
                              />
                              <span className="truncate">{r.name}</span>
                            </span>
                            <span className="text-muted">{clockOnly(r.at)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
