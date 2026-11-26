import {
  Activity,
  CheckCircle2,
  Gauge,
  Hourglass,
  Inbox,
  PauseCircle,
  PieChart,
  RefreshCw,
  RotateCcw,
  Settings2,
  TriangleAlert,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut } from '@/components/charts';
import { StackedBars } from '@/components/comms/charts';
import { QueueActions, RetryForm } from '@/components/comms/client';
import {
  AudienceChip,
  ChannelIcon,
  Chip,
  CommsHeader,
  CommsTabs,
  DataTable,
  Empty,
  ErrorNote,
  FilterRow,
  Footnote,
  KeyValues,
  LegendRow,
  Panel,
  StateBadge,
  WaitingForDatabase,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashKpi, DashKpiGrid, Pagination } from '@/components/portal/dash';
import { DashSearch, DashSelect } from '@/components/portal/dash-filters';
import { cn } from '@nexg/ui';
import {
  asNumber,
  asObject,
  asStatus,
  AUDIENCE_LABEL,
  CHANNEL_LABEL,
  commsHref,
  countsOf,
  label,
  messageName,
  n,
  oneOfOr,
  pageNumber,
  QUEUE_STATUS_LABEL,
  rate,
  rowsOf,
  when,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · Message Queue' };
export const dynamic = 'force-dynamic';

const PER = 10;

interface QRow {
  id: string;
  ref: string;
  channel: string;
  recipient: string;
  audience: string;
  template: string;
  subject: string | null;
  status: string;
  attempts: number;
  created_at: string;
  next_attempt_at: string;
  sent_at: string | null;
  last_error: string | null;
  campaign_ref: string | null;
}

/**
 * Message Queue: every email, SMS and WhatsApp message of the last seven days
 * waiting, retrying, sent or failed, with retry and cancel; the health of
 * each channel, the sending rate, and the retry rules notify-dispatch follows.
 */
export default async function QueuePage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    channel?: string;
    status?: string;
    audience?: string;
    q?: string;
    page?: string;
  };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const sp = searchParams ?? {};
  const channel = oneOfOr(sp.channel, ['email', 'sms', 'whatsapp']);
  const status = oneOfOr(sp.status, ['waiting', 'retrying', 'sent', 'failed']);
  const audience = oneOfOr(sp.audience, [
    'guests',
    'hosts',
    'riders',
    'merchants',
    'property_managers',
    'staff',
    'other',
  ]);
  const page = pageNumber(sp.page);
  const q = await ctx.read('rpc_comms_queue', {
    p_channel: channel,
    p_status: status,
    p_audience: audience,
    p_search: sp.q ?? null,
    p_page: page,
    p_per: PER,
  });
  const o = asObject(q.data);
  const k = asObject(o.kpis);
  const rows = rowsOf<QRow>(o.rows);
  const byChannel = countsOf(o.by_channel);
  const hours = rowsOf<{
    at: string;
    sent: number;
    waiting: number;
    retrying: number;
    failed: number;
  }>(o.hours);
  const ch = asObject(o.channels);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const total = asNumber(k.total);
  const sent = asNumber(k.sent);
  const waiting = asNumber(k.waiting);
  const retrying = asNumber(k.retrying);
  const failed = asNumber(k.failed);
  const params = { channel, status, audience, q: sp.q ?? null };
  const href = (extra: Record<string, string | null> = {}) =>
    commsHref('/communications/queue', period, { ...params, ...extra });
  const healthy =
    ['email', 'sms', 'whatsapp'].every((c) => asStatus(ch[c]).status !== 'not_connected') &&
    failed === 0;

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="Message Queue"
        subtitle="Monitor, manage and control all outgoing messages across email, SMS, WhatsApp and push."
        period={period}
        noPeriod
      />
      <DashCanvas>
        <CommsTabs active="queue" period={period} />
        {q.waiting ? (
          <WaitingForDatabase />
        ) : q.error ? (
          <ErrorNote message={q.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={Inbox}
                label="Total in Queue (24 h)"
                value={n(total)}
                explain="Email, SMS and WhatsApp messages queued in the last 24 hours, whatever happened to them. In-app bells do not queue."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Sent"
                value={n(sent)}
                explain="Sent in the last 24 hours."
              >
                <span className="text-success text-[0.9375rem] font-extrabold">
                  {rate(sent, total)}
                </span>
              </DashKpi>
              <DashKpi
                icon={Gauge}
                label="Due Now"
                value={n(asNumber(k.due_now))}
                explain="Waiting and due: the dispatcher picks these up every minute."
              />
              <DashKpi
                icon={PauseCircle}
                label="Queued"
                value={n(waiting)}
                explain="Not tried yet."
                href={href({ status: 'waiting', page: null })}
              />
              <DashKpi
                icon={TriangleAlert}
                iconTone="red"
                label="Failed"
                value={n(failed)}
                upIsBad
                explain="Gave up after the retries, refused, or cancelled by staff."
                href={href({ status: 'failed', page: null })}
              />
              <DashKpi
                icon={RotateCcw}
                label="Retrying"
                value={n(retrying)}
                explain="Failed at least once; waiting for the next try."
                href={href({ status: 'retrying', page: null })}
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <Panel
                title="Messages"
                aside={
                  <Link
                    href={href({})}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-3 py-2 text-[0.8125rem] font-bold text-[#1A1A1A]"
                  >
                    <RefreshCw aria-hidden="true" className="h-4 w-4" /> Refresh
                  </Link>
                }
              >
                <nav
                  aria-label="Channel"
                  className="border-border mb-3 flex flex-wrap gap-1 border-b"
                >
                  {[null, 'email', 'sms', 'whatsapp'].map((c) => (
                    <Link
                      key={c ?? 'all'}
                      href={href({ channel: c, page: null })}
                      scroll={false}
                      aria-current={channel === c ? 'page' : undefined}
                      className={cn(
                        '-mb-px border-b-2 px-3 py-2 text-[0.875rem] font-bold',
                        channel === c
                          ? 'border-[#F5A623] text-[#8A5C00]'
                          : 'text-muted border-transparent',
                      )}
                    >
                      {c ? label(CHANNEL_LABEL, c) : 'All Messages'} (
                      {n(c ? (byChannel[c] ?? 0) : total)})
                    </Link>
                  ))}
                </nav>
                <FilterRow>
                  <DashSearch
                    label="Search the queue"
                    placeholder="Search by template, subject or the full email / phone…"
                    value={sp.q ?? ''}
                  />
                  <DashSelect
                    label="Status"
                    param="status"
                    value={status ?? 'all'}
                    options={Object.entries(QUEUE_STATUS_LABEL).map(([value, text]) => ({
                      value,
                      label: text,
                    }))}
                  />
                  <DashSelect
                    label="Audience"
                    param="audience"
                    value={audience ?? 'all'}
                    options={Object.entries(AUDIENCE_LABEL)
                      .filter(([a]) => a !== 'all')
                      .map(([value, text]) => ({ value, label: text }))}
                  />
                </FilterRow>
                <DataTable
                  caption="Message queue"
                  isEmpty={rows.length === 0}
                  empty="Nothing in the queue for these filters (last 7 days)."
                  head={[
                    'Message ID',
                    'Type',
                    'Audience',
                    'Subject / Template',
                    'Recipient',
                    'Status',
                    'Queued At',
                    'Next / Last',
                    'Attempts',
                    '',
                  ]}
                >
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap font-semibold">{r.ref}</td>
                      <td>
                        <ChannelIcon channel={r.channel} />
                      </td>
                      <td>
                        <AudienceChip audience={r.audience} plural />
                      </td>
                      <td className="max-w-[14rem]">
                        <span className="block truncate font-semibold">{messageName(r)}</span>
                        {r.last_error && r.status !== 'sent' && (
                          <span
                            className="text-danger block truncate text-[0.75rem]"
                            title={r.last_error}
                          >
                            {r.last_error}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{r.recipient}</td>
                      <td>
                        <Chip status={r.status} text={label(QUEUE_STATUS_LABEL, r.status)} />
                      </td>
                      <td className="whitespace-nowrap">{when(r.created_at)}</td>
                      <td className="whitespace-nowrap">
                        {r.status === 'sent'
                          ? when(r.sent_at)
                          : r.status === 'failed'
                            ? '—'
                            : when(r.next_attempt_at)}
                      </td>
                      <td className="tabular-nums">{r.attempts}</td>
                      <td>
                        <QueueActions id={r.id} status={r.status} canEdit={canEdit} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PER}
                  total={asNumber(o.total)}
                  noun="messages"
                  href={(p) => href({ page: String(p) })}
                />
              </Panel>

              <div className="space-y-4">
                <Panel
                  title="Queue Health"
                  icon={Activity}
                  aside={
                    <Chip
                      status={healthy ? 'active' : 'failed'}
                      text={healthy ? 'Healthy' : 'Needs attention'}
                    />
                  }
                >
                  <ul className="divide-border divide-y">
                    {(
                      [
                        ['email', 'Email Service (Resend)'],
                        ['sms', "SMS Service (Africa's Talking / Twilio)"],
                        ['whatsapp', 'WhatsApp Business API'],
                        ['web_push', 'Push (browsers)'],
                      ] as const
                    ).map(([key, name]) => (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-2 py-2 text-[0.875rem]"
                      >
                        <span className="font-semibold">{name}</span>
                        <StateBadge state={asStatus(ch[key]).status} />
                      </li>
                    ))}
                    <li className="flex items-center justify-between gap-2 py-2 text-[0.875rem]">
                      <span className="font-semibold">In-app (the bell)</span>
                      <StateBadge state="connected" />
                    </li>
                  </ul>
                </Panel>
                <Panel title="Current Processing" icon={Hourglass}>
                  <KeyValues
                    rows={[
                      ['Due now', n(asNumber(k.due_now))],
                      ['Queued (waiting)', n(waiting)],
                      ['Retrying', n(retrying)],
                      [
                        'Sending rate (last hour)',
                        `${asNumber(o.rate_per_min).toLocaleString('en-KE')} msgs/min`,
                      ],
                      ['Oldest due since', when(o.oldest_waiting as string | null)],
                    ]}
                  />
                </Panel>
                <Panel title="Retry & Failure Settings" icon={Settings2}>
                  <RetryForm value={asObject(o.settings)} canEdit={canEdit} compact />
                </Panel>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Panel
                title="Queue Activity"
                note="Last 24 hours, by the hour queued."
                icon={Activity}
              >
                {hours.some((h) => h.sent + h.waiting + h.retrying + h.failed > 0) ? (
                  <StackedBars
                    data={hours.map((h) => ({ ...h, at: h.at }))}
                    series={[
                      { key: 'sent', label: 'Sent', color: '#1F9D55' },
                      { key: 'waiting', label: 'Queued', color: '#2F6FDB' },
                      { key: 'retrying', label: 'Retrying', color: '#F5A623' },
                      { key: 'failed', label: 'Failed', color: '#E5484D' },
                    ]}
                  />
                ) : (
                  <Empty>Nothing queued in the last 24 hours.</Empty>
                )}
              </Panel>
              <Panel title="Message Outcomes" note="Last 24 hours." icon={PieChart}>
                {total > 0 ? (
                  <>
                    <ShareDonut
                      centre={rate(sent, total)}
                      caption="Delivery Rate"
                      data={[
                        { key: 'sent', label: 'Sent', value: sent, color: '#1F9D55' },
                        { key: 'waiting', label: 'Queued', value: waiting, color: '#2F6FDB' },
                        { key: 'retrying', label: 'Retrying', value: retrying, color: '#F5A623' },
                        { key: 'failed', label: 'Failed', value: failed, color: '#E5484D' },
                      ]}
                    />
                    <ul className="mt-3 space-y-1.5">
                      <LegendRow
                        color="#1F9D55"
                        name="Sent"
                        value={n(sent)}
                        share={rate(sent, total)}
                      />
                      <LegendRow
                        color="#2F6FDB"
                        name="Queued"
                        value={n(waiting)}
                        share={rate(waiting, total)}
                      />
                      <LegendRow
                        color="#F5A623"
                        name="Retrying"
                        value={n(retrying)}
                        share={rate(retrying, total)}
                      />
                      <LegendRow
                        color="#E5484D"
                        name="Failed"
                        value={n(failed)}
                        share={rate(failed, total)}
                      />
                    </ul>
                  </>
                ) : (
                  <Empty>Nothing queued in the last 24 hours.</Empty>
                )}
                <Footnote>
                  Messages holding a one-time code show no subject and can be retried only before
                  they expire.
                </Footnote>
              </Panel>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
