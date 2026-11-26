import {
  BarChart3,
  CheckCircle2,
  Download,
  FileBarChart,
  Filter,
  Hourglass,
  Lightbulb,
  MapPin,
  Megaphone,
  PieChart,
  RotateCcw,
  Send,
  TrendingUp,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut } from '@/components/charts';
import { VolumeRateChart } from '@/components/comms/charts';
import {
  AudienceChip,
  CHANNEL_COLOR,
  ChannelIcon,
  CommsHeader,
  CommsTabs,
  DataTable,
  Empty,
  ErrorNote,
  Footnote,
  Funnel,
  LegendRow,
  Panel,
  ShareBars,
  WaitingForDatabase,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashKpi, DashKpiGrid } from '@/components/portal/dash';
import {
  asObject,
  AUDIENCE_LABEL,
  CHANNEL_LABEL,
  commsHref,
  countsOf,
  delta,
  kpisOf,
  label,
  n,
  rate,
  rowsOf,
  trendOf,
  when,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · Analytics & Reports' };
export const dynamic = 'force-dynamic';

interface ChannelRow {
  channel: string;
  total: number;
  sent: number;
  failed: number;
}
interface AudienceRow {
  audience: string;
  recipients: number;
  total: number;
  sent: number;
  failed: number;
}
interface CampaignRow {
  ref: string;
  name: string;
  audiences: string[];
  total: number;
  sent: number;
  failed: number;
}

const TYPE_LABEL: Record<string, string> = {
  transactional: 'Transactional',
  promotional: 'Promotional',
  operational: 'Operational',
  system: 'System / Alerts',
};
const TYPE_COLOR: Record<string, string> = {
  transactional: '#F5A623',
  promotional: '#2F6FDB',
  operational: '#A855F7',
  system: '#1F9D55',
};

/**
 * Analytics & Reports: volume and delivery for the period by day, channel,
 * audience, campaign, type of message and city, a few facts worked out from
 * those, and the CSV exports.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const q = await ctx.read('rpc_comms_analytics', { p_from: period.from, p_to: period.to });
  const o = asObject(q.data);
  const k = kpisOf(o.kpis);
  const prev = kpisOf(o.prev);
  const trend = trendOf(o.trend);
  const channels = rowsOf<ChannelRow>(o.channels);
  const audiences = rowsOf<AudienceRow>(o.audiences);
  const campaigns = rowsOf<CampaignRow>(o.campaigns);
  const types = countsOf(o.types);
  const typeTotal = Object.values(types).reduce((s, v) => s + v, 0);
  const places = rowsOf<{ city: string; n: number }>(o.places);
  const reports = rowsOf<{ at: string; kind: string; rows: string }>(o.reports);
  const placeTotal = places.reduce((s, p) => s + p.n, 0);
  const maxCh = Math.max(1, ...channels.map((c) => c.total));

  /* Facts, worked out from the figures on this page; nothing is said that the data does not show. */
  const insights: string[] = [];
  const nowRate = k.total ? (100 * k.sent) / k.total : null;
  const prevRate = prev.total ? (100 * prev.sent) / prev.total : null;
  if (nowRate != null && prevRate != null)
    insights.push(
      `Delivery rate ${nowRate >= prevRate ? 'rose' : 'fell'} ${Math.abs(nowRate - prevRate).toFixed(1)} pp to ${nowRate.toFixed(1)}%.`,
    );
  const best = [...channels]
    .filter((c) => c.total >= 5)
    .sort((a, b) => b.sent / b.total - a.sent / a.total)[0];
  if (best)
    insights.push(
      `${label(CHANNEL_LABEL, best.channel)} has the highest delivery rate at ${rate(best.sent, best.total)}.`,
    );
  const busiest = [...audiences].sort((a, b) => b.total - a.total)[0];
  if (busiest)
    insights.push(
      `${label(AUDIENCE_LABEL, busiest.audience)} got the most messages (${n(busiest.total)}).`,
    );
  if (campaigns[0])
    insights.push(
      `“${campaigns[0].name}” was the largest send (${n(campaigns[0].total)} messages).`,
    );
  if (k.total) insights.push(`Failures were ${rate(k.failed, k.total)} of all messages.`);
  const deltaTotal = delta(k.total, prev.total);
  if (deltaTotal != null)
    insights.push(
      `Volume is ${deltaTotal >= 0 ? 'up' : 'down'} ${Math.abs(deltaTotal)}% on the period before.`,
    );

  const exportLink = (kind: string, text: string) => (
    <a
      key={kind}
      href={commsHref('/communications/export', period, { kind })}
      download
      className="border-border-strong hover:bg-bg flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 text-[0.875rem] font-bold"
    >
      {text}
      <Download aria-hidden="true" className="h-4 w-4 text-[#B57A00]" />
    </a>
  );

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="Analytics & Reports"
        subtitle="Measure performance and engagement for all your communications (email, SMS, WhatsApp, push and in-app)."
        period={period}
      />
      <DashCanvas>
        <CommsTabs active="analytics" period={period} />
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
                delta={delta(k.total, prev.total)}
                explain="Queued or sent in the period, all channels. The change is against the period before."
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
              />
              <DashKpi
                icon={TriangleAlert}
                iconTone="red"
                label="Failed"
                value={n(k.failed)}
                upIsBad
                delta={delta(k.failed, prev.failed)}
                explain="Refused, or out of retries."
              />
              <DashKpi
                icon={RotateCcw}
                label="Retried"
                value={n(k.retried)}
                explain="Needed more than one try."
              />
              <DashKpi
                icon={Users}
                label="Unique Recipients"
                value={n(k.recipients)}
                delta={delta(k.recipients, prev.recipients)}
                explain="Different addresses and accounts messaged."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <Panel
                title="Message Volume Trend"
                note="Messages sent over time, and the share delivered."
                icon={TrendingUp}
              >
                {trend.some((t) => t.total > 0) ? (
                  <VolumeRateChart data={trend} />
                ) : (
                  <Empty>No messages in this period.</Empty>
                )}
              </Panel>
              <Panel
                title="Channel Performance"
                note="Delivery rate and volume by channel."
                icon={BarChart3}
              >
                <DataTable
                  caption="Channel performance"
                  isEmpty={channels.length === 0}
                  empty="No messages in this period."
                  head={['Channel', '', 'Sent', 'Delivered', 'Rate']}
                >
                  {channels.map((c) => (
                    <tr key={c.channel}>
                      <td className="whitespace-nowrap font-semibold">
                        <span className="flex items-center gap-2">
                          <ChannelIcon channel={c.channel} />
                          {label(CHANNEL_LABEL, c.channel)}
                        </span>
                      </td>
                      <td className="w-[30%]">
                        <span className="bg-bg block h-2.5 overflow-hidden rounded-full">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${(100 * c.total) / maxCh}%`,
                              background: CHANNEL_COLOR[c.channel] ?? '#C9C4B8',
                            }}
                          />
                        </span>
                      </td>
                      <td className="tabular-nums">{n(c.total)}</td>
                      <td className="tabular-nums">{n(c.sent)}</td>
                      <td className="font-bold tabular-nums">{rate(c.sent, c.total)}</td>
                    </tr>
                  ))}
                </DataTable>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel
                title="Audience Engagement"
                note="How each audience's messages fared."
                icon={Users}
              >
                <DataTable
                  caption="Audience engagement"
                  isEmpty={audiences.length === 0}
                  empty="No messages in this period."
                  head={['Audience', 'Recipients', 'Delivered', 'Rate']}
                >
                  {audiences.map((a) => (
                    <tr key={a.audience}>
                      <td>
                        <AudienceChip audience={a.audience} plural />
                      </td>
                      <td className="tabular-nums">{n(a.recipients)}</td>
                      <td className="tabular-nums">{n(a.sent)}</td>
                      <td className="font-bold tabular-nums">{rate(a.sent, a.total)}</td>
                    </tr>
                  ))}
                </DataTable>
              </Panel>
              <Panel
                title="Campaign Performance (Top 5)"
                note="The largest sends in the period."
                icon={Megaphone}
              >
                <DataTable
                  caption="Campaign performance"
                  isEmpty={campaigns.length === 0}
                  empty="No campaigns in this period."
                  head={['Campaign', 'Audience', 'Sent', 'Delivery']}
                >
                  {campaigns.map((c) => (
                    <tr key={c.ref}>
                      <td>
                        <span className="block font-semibold">{c.name}</span>
                        <span className="text-muted block text-[0.75rem]">{c.ref}</span>
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {c.audiences.map((a) => (
                            <AudienceChip key={a} audience={a} plural />
                          ))}
                        </span>
                      </td>
                      <td className="tabular-nums">{n(c.total)}</td>
                      <td className="font-bold tabular-nums">{rate(c.sent, c.total)}</td>
                    </tr>
                  ))}
                </DataTable>
              </Panel>
              <Panel
                title="Delivery Funnel"
                note="Message journey from send to delivery."
                icon={Filter}
              >
                <Funnel
                  steps={[
                    { label: 'Sent', value: k.total },
                    { label: 'Delivered', value: k.sent },
                    { label: 'In Progress', value: k.queued },
                    { label: 'Retried', value: k.retried },
                    { label: 'Failed', value: k.failed },
                  ]}
                />
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-4">
              <Panel title="Key Insights" icon={Lightbulb}>
                {insights.length === 0 ? (
                  <Empty>Nothing to compare yet.</Empty>
                ) : (
                  <ul className="space-y-2 text-[0.875rem] font-semibold">
                    {insights.map((t) => (
                      <li key={t} className="flex gap-2">
                        <span aria-hidden="true" className="text-[#1F9D55]">
                          ▲
                        </span>
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Message Types" icon={PieChart}>
                {typeTotal > 0 ? (
                  <>
                    <ShareDonut
                      centre={n(typeTotal)}
                      caption="Messages"
                      data={Object.entries(types).map(([t, v]) => ({
                        key: t,
                        label: label(TYPE_LABEL, t),
                        value: v,
                        color: TYPE_COLOR[t],
                      }))}
                    />
                    <ul className="mt-3 space-y-1.5">
                      {Object.entries(types).map(([t, v]) => (
                        <LegendRow
                          key={t}
                          color={TYPE_COLOR[t] ?? '#C9C4B8'}
                          name={label(TYPE_LABEL, t)}
                          value={rate(v, typeTotal)}
                        />
                      ))}
                    </ul>
                  </>
                ) : (
                  <Empty>No messages in this period.</Empty>
                )}
              </Panel>
              <Panel title="Delivery by Location (Top 5)" icon={MapPin}>
                <ShareBars
                  rows={places.map((p) => ({
                    label: p.city,
                    value: p.n,
                    text: rate(p.n, placeTotal),
                  }))}
                  empty="No messages carried a city yet. Sends to hosts, riders and merchants from this module record theirs."
                />
              </Panel>
              <Panel
                title="Reports & Exports"
                note="Download detailed records as CSV."
                icon={FileBarChart}
              >
                <div className="space-y-2">
                  {exportLink('logs', 'Delivery logs')}
                  {exportLink('campaigns', 'Bulk & scheduled sends')}
                  {exportLink('consent', 'Consent records')}
                  {exportLink('suppression', 'Suppression lists')}
                </div>
                {reports.length > 0 && (
                  <ul className="text-muted mt-3 space-y-1 text-[0.75rem] font-semibold">
                    {reports.map((r) => (
                      <li key={r.at}>
                        {when(r.at)} · {r.kind} · {r.rows} rows
                      </li>
                    ))}
                  </ul>
                )}
                <Footnote>Each download is recorded in the audit log.</Footnote>
              </Panel>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
