import {
  CheckCircle2,
  Code2,
  Coins,
  FileText,
  Inbox,
  MessageCircle,
  MessagesSquare,
  Phone,
  Send,
  Store,
  TrendingUp,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { StackedBars } from '@/components/comms/charts';
import { CostForm, TestSendForm, WorkflowSwitch } from '@/components/comms/client';
import {
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
  commsHref,
  dayOnly,
  delta,
  kpisOf,
  label,
  n,
  rate,
  rowsOf,
  TEMPLATE_STATUS_LABEL,
  trendOf,
  when,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · WhatsApp Configuration' };
export const dynamic = 'force-dynamic';

/**
 * WhatsApp Configuration: the Meta WhatsApp Cloud API connection
 * notify-dispatch sends with, the number it sends from, the replies that come
 * back into the support inbox, templates and workflows on WhatsApp, a test,
 * the last seven days and this month's use.
 */
export default async function WhatsAppConfigPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const q = await ctx.read('rpc_comms_channel', {
    p_channel: 'whatsapp',
    p_from: period.from,
    p_to: period.to,
  });
  const o = asObject(q.data);
  const k = kpisOf(o.kpis);
  const prev = kpisOf(o.prev);
  const status = asStatus(asObject(o.channels).whatsapp);
  const detail = (status.detail ?? {}) as { phone_number_id?: string | null };
  const wa = asObject(o.whatsapp);
  const settings = asObject(o.settings);
  const month = asObject(o.month);
  const cost = asNumber(o.cost_kes);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const templates = rowsOf<{
    id: string;
    name: string;
    audience: string;
    status: string;
    updated_at: string;
  }>(o.templates);
  const workflows = rowsOf<{
    id: string;
    name: string;
    trigger: string;
    enabled: boolean;
    fired: number;
  }>(o.workflows);
  const trend = trendOf(o.trend);
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const webhook = supabase ? `${supabase.replace(/\/$/, '')}/functions/v1/whatsapp-webhook` : null;

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="WhatsApp Configuration"
        subtitle="Your WhatsApp Business account, templates and automated messages for guests, hosts, riders and merchants."
        period={period}
      />
      <DashCanvas>
        <CommsTabs active="whatsapp" period={period} />
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
                label="Messages Sent"
                value={n(k.total)}
                delta={delta(k.total, prev.total)}
                explain="WhatsApp messages queued or sent in the period."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Delivered"
                value={n(k.sent)}
                explain="Accepted by Meta. Read receipts arrive at the webhook but are not counted here yet."
              >
                <span className="text-success text-[0.9375rem] font-extrabold">
                  {rate(k.sent, k.total)}
                </span>
              </DashKpi>
              <DashKpi
                icon={MessagesSquare}
                label="Incoming Messages"
                value={n(asNumber(wa.incoming_period))}
                explain="Messages people sent NexG on WhatsApp in the period. They land in Support › Live chat."
                href="/messaging?tab=inbox"
              />
              <DashKpi
                icon={Inbox}
                label="Staff Replies"
                value={n(asNumber(wa.replies_period))}
                explain="Replies staff sent from the live chat over WhatsApp in the period."
              />
              <DashKpi
                icon={TriangleAlert}
                iconTone="red"
                label="Failed"
                value={n(k.failed)}
                upIsBad
                delta={delta(k.failed, prev.failed)}
                explain="Given up on after the retries, or refused by Meta."
                href={commsHref('/communications/logs', period, {
                  channel: 'whatsapp',
                  status: 'failed',
                })}
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel
                title="WhatsApp Business API"
                note="Your official WhatsApp Business account."
                icon={MessageCircle}
              >
                <ul className="space-y-2">
                  <ProviderRow
                    provider="meta"
                    name="Meta WhatsApp Cloud API"
                    note="Business account (official), used by notify-dispatch"
                    state={status.status}
                    selected
                  />
                </ul>
                {status.last_config_error && status.status !== 'connected' && (
                  <p className="text-danger mt-2 text-[0.8125rem] font-semibold">
                    Last run said: {status.last_config_error}
                  </p>
                )}
              </Panel>
              <Panel
                title="Business Profile"
                note="What customers see. Edited in Meta Business Manager."
                icon={Store}
              >
                <KeyValues
                  rows={[
                    ['Business Name', 'NexG'],
                    ['Display Name', 'Set in Meta Business Manager'],
                    ['Profile photo and description', 'Set in Meta Business Manager'],
                    ['Conversations so far', n(asNumber(wa.conversations))],
                  ]}
                />
                <Footnote>
                  The profile is not read through the API here, so nothing on this card is guessed.
                </Footnote>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="WhatsApp Numbers" note="The number connected to the API." icon={Phone}>
                <DataTable
                  caption="WhatsApp numbers"
                  isEmpty={!detail.phone_number_id}
                  empty={
                    status.status === 'connected'
                      ? 'Connected; the number ID is reported on the next send.'
                      : 'No number connected yet.'
                  }
                  head={['Phone number ID', 'Purpose', 'Status']}
                >
                  <tr>
                    <td className="font-semibold tabular-nums">{detail.phone_number_id}</td>
                    <td>Every WhatsApp message and reply</td>
                    <td>
                      <Chip
                        status={status.status === 'connected' ? 'active' : 'failed'}
                        text={status.status === 'connected' ? 'Active' : 'Not connected'}
                      />
                    </td>
                  </tr>
                </DataTable>
                <Footnote>
                  A second number needs a second phone number ID in Meta and a change to the sender.
                </Footnote>
              </Panel>
              <Panel
                title="WhatsApp Message Templates"
                note="Messages outside a 24-hour reply window must use a Meta-approved template."
                icon={FileText}
                aside={
                  <CardLink
                    href={commsHref('/communications/templates', period, { channel: 'whatsapp' })}
                  >
                    View All
                  </CardLink>
                }
              >
                <DataTable
                  caption="WhatsApp templates"
                  isEmpty={templates.length === 0}
                  empty="No templates use WhatsApp yet."
                  head={['Template Name', 'Status', 'Last Updated']}
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
                        <Chip status={t.status} text={label(TEMPLATE_STATUS_LABEL, t.status)} />
                      </td>
                      <td className="whitespace-nowrap">{dayOnly(t.updated_at)}</td>
                    </tr>
                  ))}
                </DataTable>
                <Footnote>
                  Meta approval is requested in Meta Business Manager; its approval state is not
                  read here.
                </Footnote>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel
                title="Automated WhatsApp Workflows"
                note="Sent automatically on events."
                icon={Workflow}
                aside={
                  <CardLink href={commsHref('/communications/workflows', period)}>
                    View All
                  </CardLink>
                }
              >
                {workflows.length === 0 ? (
                  <Empty>No workflow sends on WhatsApp yet.</Empty>
                ) : (
                  <ul className="divide-border divide-y">
                    {workflows.map((w) => (
                      <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block font-bold">{w.name}</span>
                          <span className="text-muted block text-[0.8125rem] font-semibold">
                            When “{w.trigger}”
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
              </Panel>
              <Panel title="Send Test Message" note="Test your WhatsApp setup." icon={Send}>
                <TestSendForm
                  channel="whatsapp"
                  templates={templates}
                  canEdit={canEdit}
                  cta="Send Test Message"
                />
              </Panel>
              <Panel
                title="Delivery Performance"
                note="Last 7 days of the period."
                icon={TrendingUp}
              >
                {trend.some((t) => t.total > 0) ? (
                  <StackedBars
                    legend={false}
                    data={trend.map((t) => ({ at: t.at, sent: t.sent, failed: t.failed }))}
                    series={[
                      { key: 'sent', label: 'Delivered', color: '#1F9D55' },
                      { key: 'failed', label: 'Failed', color: '#E5484D' },
                    ]}
                  />
                ) : (
                  <Empty>No WhatsApp messages in the last 7 days of the period.</Empty>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel
                title="Integration Settings"
                note="Where WhatsApp meets the rest of NexG."
                icon={Workflow}
              >
                <ul className="space-y-2 text-[0.875rem]">
                  <li className="flex items-center justify-between gap-3">
                    <span className="font-semibold">Replies land in Support › Live chat</span>
                    <Link
                      href="/messaging?tab=inbox"
                      className="font-bold text-[#8A5C00] underline"
                    >
                      Open
                    </Link>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="font-semibold">Booking, order and payment messages</span>
                    <Link
                      href={commsHref('/communications/workflows', period)}
                      className="font-bold text-[#8A5C00] underline"
                    >
                      Workflows
                    </Link>
                  </li>
                </ul>
              </Panel>
              <Panel
                title="Webhook & API Settings"
                note="Where Meta sends status updates and replies."
                icon={Code2}
              >
                <KeyValues
                  rows={[
                    [
                      'Webhook URL',
                      webhook ? (
                        <code key="w" className="text-[0.75rem]">
                          {webhook}
                        </code>
                      ) : (
                        '—'
                      ),
                    ],
                    ['Receives', 'Incoming messages, message status'],
                    ['Last delivery accepted', when(status.last_sent_at)],
                  ]}
                />
                <Footnote>
                  The verify token and app secret are Supabase secrets of the whatsapp-webhook
                  function.
                </Footnote>
              </Panel>
              <Panel title="WhatsApp Usage & Cost (This Month)" icon={Coins}>
                <KeyValues
                  rows={[
                    ['Messages Sent', n(asNumber(month.total))],
                    ['Delivered', n(asNumber(month.sent))],
                    ['Failed', n(asNumber(month.failed))],
                    [
                      'Estimated Cost',
                      cost > 0 ? `KES ${n(cost * asNumber(month.sent))}` : 'Set the price below',
                    ],
                    ['Plan / Package', 'Meta (API)'],
                  ]}
                />
                <div className="mt-3">
                  <CostForm
                    channel="whatsapp"
                    value={asObject(settings.cost_kes) as Record<string, number>}
                    canEdit={canEdit}
                  />
                </div>
              </Panel>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
