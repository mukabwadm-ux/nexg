import {
  CheckCircle2,
  Coins,
  FileText,
  GitBranch,
  Hourglass,
  MessageSquareText,
  Send,
  Settings2,
  TriangleAlert,
  Users,
  Workflow,
  TrendingUp,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut } from '@/components/charts';
import { StackedBars } from '@/components/comms/charts';
import { CostForm, RetryForm, TestSendForm, WorkflowSwitch } from '@/components/comms/client';
import {
  AUDIENCE_COLOR,
  AudienceChip,
  Chip,
  CommsHeader,
  CommsTabs,
  DataTable,
  Empty,
  ErrorNote,
  Footnote,
  KeyValues,
  Panel,
  ProviderRow,
  WaitingForDatabase,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { CardLink, DashCanvas, DashKpi, DashKpiGrid } from '@/components/portal/dash';
import {
  asNumber,
  asObject,
  asStatus,
  AUDIENCE_LABEL,
  commsHref,
  countsOf,
  delta,
  kpisOf,
  label,
  n,
  providerState,
  rate,
  rowsOf,
  TEMPLATE_STATUS_LABEL,
  trendOf,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · SMS Configuration' };
export const dynamic = 'force-dynamic';

/**
 * SMS Configuration: Africa's Talking or Twilio (whichever notify-dispatch
 * has keys for), the sender ID, the order it tries them in, SMS templates
 * and workflows, this month's use and cost, who the messages went to and
 * the last seven days.
 */
export default async function SmsConfigPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const q = await ctx.read('rpc_comms_channel', {
    p_channel: 'sms',
    p_from: period.from,
    p_to: period.to,
  });
  const o = asObject(q.data);
  const k = kpisOf(o.kpis);
  const prev = kpisOf(o.prev);
  const status = asStatus(asObject(o.channels).sms);
  const detail = (status.detail ?? {}) as {
    sender_id?: string | null;
    africastalking?: boolean;
    twilio?: boolean;
  };
  const settings = asObject(o.settings);
  const month = asObject(o.month);
  const cost = asNumber(o.cost_kes);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const templates = rowsOf<{
    id: string;
    name: string;
    audience: string;
    trigger: string | null;
    status: string;
  }>(o.templates);
  const workflows = rowsOf<{
    id: string;
    name: string;
    trigger: string;
    enabled: boolean;
    fired: number;
  }>(o.workflows);
  const audiences = countsOf(o.audiences);
  const audTotal = Object.values(audiences).reduce((s, v) => s + v, 0);
  const trend = trendOf(o.trend);

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="SMS Configuration"
        subtitle="Your SMS provider, sender ID, templates and automated SMS for hosts, guests, riders and merchants."
        period={period}
      />
      <DashCanvas>
        <CommsTabs active="sms" period={period} />
        {q.waiting ? (
          <WaitingForDatabase />
        ) : q.error ? (
          <ErrorNote message={q.error} />
        ) : (
          <>
            <DashKpiGrid>
              <DashKpi
                featured
                icon={Send}
                label="SMS Sent"
                value={n(k.total)}
                delta={delta(k.total, prev.total)}
                explain="SMS queued or sent in the period."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Delivered"
                value={n(k.sent)}
                explain="Accepted by the SMS gateway. Handset delivery reports are not wired in yet."
              >
                <span className="text-success text-[0.9375rem] font-extrabold">
                  {rate(k.sent, k.total)}
                </span>
              </DashKpi>
              <DashKpi
                icon={Hourglass}
                label="Pending"
                value={n(k.queued)}
                explain="Waiting, retrying, or held because no SMS provider is connected."
                href={commsHref('/communications/queue', period, { channel: 'sms' })}
              >
                <span className="text-muted text-[0.875rem] font-semibold">
                  {rate(k.queued, k.total)}
                </span>
              </DashKpi>
              <DashKpi
                icon={TriangleAlert}
                iconTone="red"
                label="Failed"
                value={n(k.failed)}
                upIsBad
                delta={delta(k.failed, prev.failed)}
                explain="Given up on after the retries, or refused by the gateway."
                href={commsHref('/communications/logs', period, {
                  channel: 'sms',
                  status: 'failed',
                })}
              />
              <DashKpi
                icon={Coins}
                label="SMS Spend"
                value={cost > 0 ? `KES ${n(cost * k.sent)}` : '—'}
                explain="Sent SMS × the price per SMS set below. An estimate; the gateway's invoice is the real figure."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Panel
                title="SMS Provider"
                note="Connect and manage your SMS gateway."
                icon={MessageSquareText}
              >
                <ul className="space-y-2">
                  <ProviderRow
                    provider="africastalking"
                    note="Recommended for Kenya & Africa; used first"
                    state={providerState(status, 'africastalking')}
                    selected={status.provider === 'africastalking'}
                  />
                  <ProviderRow
                    provider="twilio"
                    note="Global SMS provider; used when Africa's Talking is not set"
                    state={providerState(status, 'twilio')}
                    selected={status.provider === 'twilio'}
                  />
                </ul>
                {status.last_config_error && status.status !== 'connected' && (
                  <p className="text-danger mt-2 text-[0.8125rem] font-semibold">
                    Last run said: {status.last_config_error}
                  </p>
                )}
              </Panel>

              <Panel title="Sender ID & Settings" note="Your SMS sender identity." icon={Settings2}>
                <KeyValues
                  rows={[
                    [
                      'Sender ID',
                      detail.sender_id ?? (status.status === 'connected' ? 'Gateway default' : '—'),
                    ],
                    ['Where it is set', 'AT_SENDER_ID (or TWILIO_FROM)'],
                    ['Delivery reports (DLR)', 'Not wired in'],
                    ['Two-way SMS (replies)', 'Not wired in'],
                  ]}
                />
                <Footnote>
                  An alphanumeric sender ID (up to 11 characters, e.g. NEXG) must be approved by
                  Africa’s Talking and the networks before it is used.
                </Footnote>
              </Panel>

              <Panel
                title="SMS Routing & Fallback"
                note="How a message finds a gateway, and its retries."
                icon={GitBranch}
              >
                <p className="text-muted mb-3 text-[0.8125rem] leading-relaxed">
                  Africa’s Talking is used when its keys are set; Twilio only when it is the one
                  set. A failed SMS is retried on the same gateway with the rules below.
                </p>
                <RetryForm value={asObject(settings.retry)} canEdit={canEdit} compact />
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <Panel
                title="SMS Templates"
                note="Reusable SMS templates."
                icon={FileText}
                aside={
                  <span className="flex items-center gap-3">
                    <CardLink
                      href={commsHref('/communications/templates', period, { channel: 'sms' })}
                    >
                      View All
                    </CardLink>
                    <Link
                      href={commsHref('/communications/templates', period, { selected: 'new' })}
                      className="rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-3 py-2 text-[0.8125rem] font-bold text-[#1A1A1A]"
                    >
                      + New Template
                    </Link>
                  </span>
                }
              >
                <DataTable
                  caption="SMS templates"
                  isEmpty={templates.length === 0}
                  empty="No SMS templates yet."
                  head={['Template Name', 'Audience', 'Trigger/Event', 'Status']}
                >
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <td className="font-semibold">
                        <Link
                          className="hover:underline"
                          href={commsHref('/communications/templates', period, { selected: t.id })}
                        >
                          {t.name}
                        </Link>
                      </td>
                      <td>
                        <AudienceChip audience={t.audience} plural />
                      </td>
                      <td>{t.trigger ?? '—'}</td>
                      <td>
                        <Chip status={t.status} text={label(TEMPLATE_STATUS_LABEL, t.status)} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </Panel>

              <Panel
                title="Automated SMS Workflows"
                note="Send SMS automatically for key events."
                icon={Workflow}
                aside={
                  <CardLink href={commsHref('/communications/workflows', period)}>
                    View All
                  </CardLink>
                }
              >
                {workflows.length === 0 ? (
                  <Empty>No workflow sends SMS yet.</Empty>
                ) : (
                  <ul className="divide-border divide-y">
                    {workflows.map((w) => (
                      <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block font-bold">{w.name}</span>
                          <span className="text-muted block text-[0.8125rem] font-semibold">
                            When “{w.trigger}” · fired {n(w.fired)} times
                          </span>
                        </span>
                        <WorkflowSwitch
                          id={`wf:${w.id}`}
                          enabled={w.enabled}
                          name={w.name}
                          canEdit={canEdit}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-border mt-3 border-t pt-3">
                  <p className="mb-2 text-sm font-bold">Send a test SMS</p>
                  <TestSendForm channel="sms" canEdit={canEdit} cta="Send Test SMS" />
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel title="SMS Usage & Cost" note="This month's SMS and spend." icon={Coins}>
                <KeyValues
                  rows={[
                    ['Total SMS Sent', n(asNumber(month.total))],
                    ['Delivered', n(asNumber(month.sent))],
                    ['Failed', n(asNumber(month.failed))],
                    ['Total Spend', cost > 0 ? `KES ${n(cost * asNumber(month.sent))}` : '—'],
                    ['Avg. Cost per SMS', cost > 0 ? `KES ${cost.toFixed(2)}` : 'Not set'],
                  ]}
                />
                <div className="mt-3">
                  <CostForm
                    channel="sms"
                    value={asObject(settings.cost_kes) as Record<string, number>}
                    canEdit={canEdit}
                  />
                </div>
              </Panel>
              <Panel title="Audience Distribution" icon={Users}>
                {audTotal > 0 ? (
                  <ShareDonut
                    centre={n(audTotal)}
                    caption="SMS Sent"
                    data={Object.entries(audiences).map(([a, v]) => ({
                      key: a,
                      label: label(AUDIENCE_LABEL, a),
                      value: v,
                      color: AUDIENCE_COLOR[a] ?? '#D9D4CA',
                    }))}
                  />
                ) : (
                  <Empty>No SMS in this period.</Empty>
                )}
              </Panel>
              <Panel title="Delivery Trend" note="Last 7 days of the period." icon={TrendingUp}>
                {trend.some((t) => t.total > 0) ? (
                  <StackedBars
                    data={trend.map((t) => ({
                      at: t.at,
                      sent: t.sent,
                      failed: t.failed,
                      queued: t.queued,
                    }))}
                    series={[
                      { key: 'sent', label: 'Delivered', color: '#F5A623' },
                      { key: 'queued', label: 'In progress', color: '#FFD98A' },
                      { key: 'failed', label: 'Failed', color: '#E5484D' },
                    ]}
                  />
                ) : (
                  <Empty>No SMS in the last 7 days of the period.</Empty>
                )}
              </Panel>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
