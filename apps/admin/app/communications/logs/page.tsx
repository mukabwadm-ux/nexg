import {
  CheckCircle2,
  Clock,
  Code2,
  Download,
  Hourglass,
  ListChecks,
  Mail,
  PieChart,
  RefreshCw,
  RotateCcw,
  Send,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut, TrendArea } from '@/components/charts';
import { ResendButton, ViewText } from '@/components/comms/client';
import {
  AudienceChip,
  CHANNEL_COLOR,
  ChannelIcon,
  Chip,
  CommsHeader,
  CommsTabs,
  DataTable,
  Empty,
  ErrorNote,
  FilterRow,
  KeyValues,
  LegendRow,
  Panel,
  PanelHint,
  SidePanel,
  WaitingForDatabase,
  WithPanel,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashKpi, DashKpiGrid, Pagination } from '@/components/portal/dash';
import { DashSearch, DashSelect } from '@/components/portal/dash-filters';
import { cn } from '@nexg/ui';
import {
  asNumber,
  asObject,
  AUDIENCE_LABEL,
  CHANNEL_LABEL,
  commsHref,
  countsOf,
  duration,
  kpisOf,
  label,
  LOG_STATUS_LABEL,
  messageName,
  n,
  oneOfOr,
  pageNumber,
  rate,
  rowsOf,
  trendOf,
  UUID,
  when,
  type LogRow,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · Delivery Logs' };
export const dynamic = 'force-dynamic';

const PER = 10;

interface Selected extends LogRow {
  payload: Record<string, unknown>;
  provider_id: string | null;
  body: string | null;
  outbox: Record<string, unknown> | null;
}

/**
 * Delivery Logs: every message NexG recorded (email, SMS, WhatsApp and
 * in-app), filtered and searchable, one opened beside the table with what the
 * provider said, its words (never a one-time code) and Resend.
 */
export default async function LogsPage({
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
    selected?: string;
  };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const sp = searchParams ?? {};
  const channel = oneOfOr(sp.channel, ['email', 'sms', 'whatsapp', 'in_app']);
  const status = oneOfOr(sp.status, ['sent', 'queued', 'failed', 'skipped']);
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
  const selectedId = sp.selected && UUID.test(sp.selected) ? sp.selected : null;
  const q = await ctx.read('rpc_comms_logs', {
    p_from: period.from,
    p_to: period.to,
    p_channel: channel,
    p_status: status,
    p_audience: audience,
    p_search: sp.q ?? null,
    p_page: page,
    p_per: PER,
    p_selected: selectedId,
  });
  const o = asObject(q.data);
  const k = kpisOf(o.kpis);
  const rows = rowsOf<LogRow>(o.rows);
  const sel = (o.selected ?? null) as Selected | null;
  const byChannel = countsOf(o.by_channel);
  const chTotal = Object.values(byChannel).reduce((s, v) => s + v, 0);
  const trend = trendOf(o.trend);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const params = {
    channel,
    status,
    audience,
    q: sp.q ?? null,
    page: page > 1 ? String(page) : null,
  };
  const href = (extra: Record<string, string | null> = {}) =>
    commsHref('/communications/logs', period, { ...params, ...extra });
  const exportHref = commsHref('/communications/export', period, {
    kind: 'logs',
    channel,
    status,
    audience,
    q: sp.q ?? null,
  });

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="Delivery Logs"
        subtitle="Track the delivery status of every message (email, SMS, WhatsApp and in-app), with full details and logs."
        period={period}
      />
      <DashCanvas>
        <CommsTabs active="logs" period={period} />
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
                label="Total Messages"
                value={n(k.total)}
                explain="Messages queued or sent in the period (skipped ones left out)."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Delivered"
                value={n(k.sent)}
                explain="Accepted by the provider or shown in the bell."
              >
                <span className="text-success text-[0.9375rem] font-extrabold">
                  {rate(k.sent, k.total)}
                </span>
              </DashKpi>
              <DashKpi
                icon={Hourglass}
                label="In Progress"
                value={n(k.queued)}
                explain="Not sent yet."
                href={href({ status: 'queued', page: null })}
              />
              <DashKpi
                icon={TriangleAlert}
                iconTone="red"
                label="Failed"
                value={n(k.failed)}
                upIsBad
                explain="Refused, or out of retries."
                href={href({ status: 'failed', page: null })}
              />
              <DashKpi
                icon={RotateCcw}
                label="Retried"
                value={n(k.retried)}
                explain="Messages that needed more than one try."
              />
              <DashKpi
                icon={Clock}
                label="Avg. Delivery Time"
                value={duration(o.avg_seconds == null ? null : asNumber(o.avg_seconds))}
                explain="From queued to accepted by the provider, for messages sent in the period."
              />
            </DashKpiGrid>

            <WithPanel
              panel={
                sel ? (
                  <SidePanel title="Message Details" closeHref={href({ selected: null })}>
                    <KeyValues
                      rows={[
                        ['Log ID', sel.ref],
                        [
                          'Channel',
                          <span key="c" className="inline-flex items-center gap-1.5">
                            <ChannelIcon channel={sel.channel} />
                            {label(CHANNEL_LABEL, sel.channel)}
                          </span>,
                        ],
                        ['Audience', <AudienceChip key="a" audience={sel.audience} />],
                        ['Recipient', sel.recipient],
                        ['Subject', messageName(sel)],
                        [
                          'Related To',
                          sel.campaign_ref ?? (sel.payload?.kind as string | undefined) ?? '—',
                        ],
                        [
                          'Status',
                          <Chip
                            key="s"
                            status={sel.status}
                            text={label(LOG_STATUS_LABEL, sel.status)}
                          />,
                        ],
                        ['Sent At', when(sel.created_at)],
                        ['Delivered At', when(sel.sent_at)],
                        ['Delivery Time', duration(sel.seconds)],
                        ['Attempts', String(sel.attempts)],
                        [
                          'Provider Response',
                          sel.status === 'sent'
                            ? `Accepted${sel.provider ? ` by ${sel.provider}` : ''}${sel.provider_id ? ` (${sel.provider_id})` : ''}`
                            : (sel.error ?? (sel.outbox?.last_error as string | undefined) ?? '—'),
                        ],
                      ]}
                    />
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <ViewText
                        title="View Message"
                        icon={Mail}
                        text={
                          sel.body ??
                          'The words are not kept for this message (in-app bells and older messages).'
                        }
                      />
                      <ResendButton logId={sel.id} canEdit={canEdit} resendable={sel.resendable} />
                    </div>
                    <div className="mt-2">
                      <ViewText
                        title="View Raw Log"
                        icon={Code2}
                        text={JSON.stringify(
                          {
                            log: { ...sel, body: undefined, outbox: undefined },
                            outbox: sel.outbox,
                          },
                          null,
                          2,
                        )}
                      />
                    </div>
                  </SidePanel>
                ) : (
                  <PanelHint>
                    Choose a message to see its details, the provider’s answer and Resend.
                  </PanelHint>
                )
              }
            >
              <Panel
                title="Delivery Logs"
                note="Every message sent, its status, timing and delivery response."
                icon={ListChecks}
                aside={
                  <span className="flex gap-2">
                    <a
                      href={exportHref}
                      download
                      className="border-border-strong inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[0.8125rem] font-bold"
                    >
                      <Download aria-hidden="true" className="h-4 w-4" /> Export CSV
                    </a>
                    <Link
                      href={href({})}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-3 py-2 text-[0.8125rem] font-bold text-[#1A1A1A]"
                    >
                      <RefreshCw aria-hidden="true" className="h-4 w-4" /> Refresh
                    </Link>
                  </span>
                }
              >
                <FilterRow>
                  <DashSearch
                    label="Search logs"
                    placeholder="Search by log ID (DL-…), the full email / phone, template or campaign (CMP-…)"
                    value={sp.q ?? ''}
                  />
                  <DashSelect
                    label="Channel"
                    param="channel"
                    value={channel ?? 'all'}
                    options={['email', 'sms', 'whatsapp', 'in_app'].map((c) => ({
                      value: c,
                      label: label(CHANNEL_LABEL, c),
                    }))}
                  />
                  <DashSelect
                    label="Status"
                    param="status"
                    value={status ?? 'all'}
                    options={Object.entries(LOG_STATUS_LABEL).map(([value, text]) => ({
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
                  caption="Delivery logs"
                  isEmpty={rows.length === 0}
                  empty="No messages for these filters in this period."
                  head={[
                    'Log ID',
                    'Date & Time',
                    'Channel',
                    'Audience',
                    'Recipient',
                    'Message / Subject',
                    'Related To',
                    'Status',
                    'Delivery Time',
                    'Attempts',
                  ]}
                >
                  {rows.map((r) => (
                    <tr key={r.id} className={cn(sel?.id === r.id && 'bg-[#FFFBF0]')}>
                      <td className="whitespace-nowrap font-semibold">
                        <Link
                          href={href({ selected: r.id })}
                          scroll={false}
                          className="hover:underline"
                        >
                          {r.ref}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{when(r.created_at)}</td>
                      <td>
                        <ChannelIcon channel={r.channel} />
                      </td>
                      <td>
                        <AudienceChip audience={r.audience} />
                      </td>
                      <td className="whitespace-nowrap">{r.recipient}</td>
                      <td className="max-w-[14rem] truncate">{messageName(r)}</td>
                      <td className="whitespace-nowrap">{r.campaign_ref ?? '—'}</td>
                      <td>
                        <Chip status={r.status} text={label(LOG_STATUS_LABEL, r.status)} />
                      </td>
                      <td className="whitespace-nowrap">{duration(r.seconds)}</td>
                      <td className="tabular-nums">{r.attempts}</td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PER}
                  total={asNumber(o.total)}
                  noun="logs"
                  href={(p) => href({ page: String(p), selected: null })}
                />
              </Panel>
            </WithPanel>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel title="Delivery by Channel" icon={PieChart}>
                {chTotal > 0 ? (
                  <ShareDonut
                    centre={n(chTotal)}
                    caption="Messages"
                    data={Object.entries(byChannel).map(([c, v]) => ({
                      key: c,
                      label: label(CHANNEL_LABEL, c),
                      value: v,
                      color: CHANNEL_COLOR[c],
                    }))}
                  />
                ) : (
                  <Empty>No messages in this period.</Empty>
                )}
              </Panel>
              <Panel title="Delivery Trend" note="Last 7 days of the period." icon={TrendingUp}>
                {trend.some((t) => t.total > 0) ? (
                  <TrendArea
                    height={220}
                    data={trend.map((t) => ({ day: t.at.slice(0, 10), total: t.total }))}
                    series={[{ key: 'total', label: 'Messages', color: '#F5A623' }]}
                  />
                ) : (
                  <Empty>No messages in the last 7 days of the period.</Empty>
                )}
              </Panel>
              <Panel title="Delivery Outcomes" icon={CheckCircle2}>
                {k.total + k.skipped > 0 ? (
                  <>
                    <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
                      {(
                        [
                          [k.sent, '#1F9D55'],
                          [k.queued, '#F5A623'],
                          [k.failed, '#E5484D'],
                          [k.skipped, '#C9C4B8'],
                        ] as const
                      ).map(([v, c]) => (
                        <span
                          key={c}
                          style={{ width: `${(100 * v) / (k.total + k.skipped)}%`, background: c }}
                        />
                      ))}
                    </div>
                    <ul className="mt-4 space-y-2">
                      <LegendRow
                        color="#1F9D55"
                        name="Delivered"
                        value={n(k.sent)}
                        share={rate(k.sent, k.total)}
                      />
                      <LegendRow
                        color="#F5A623"
                        name="In Progress"
                        value={n(k.queued)}
                        share={rate(k.queued, k.total)}
                      />
                      <LegendRow
                        color="#E5484D"
                        name="Failed"
                        value={n(k.failed)}
                        share={rate(k.failed, k.total)}
                      />
                      <LegendRow
                        color="#2F6FDB"
                        name="Retried"
                        value={n(k.retried)}
                        share={rate(k.retried, k.total)}
                      />
                      <LegendRow
                        color="#C9C4B8"
                        name="Skipped (not sent on purpose)"
                        value={n(k.skipped)}
                      />
                    </ul>
                  </>
                ) : (
                  <Empty>No messages in this period.</Empty>
                )}
              </Panel>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
