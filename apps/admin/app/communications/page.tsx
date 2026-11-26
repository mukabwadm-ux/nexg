import {
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileText,
  Inbox,
  ListChecks,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Send,
  ShieldCheck,
  TriangleAlert,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { WorkflowSwitch } from '@/components/comms/client';
import {
  ChannelIcon,
  Chip,
  CommsHeader,
  CommsTabs,
  Empty,
  ErrorNote,
  Footnote,
  Panel,
  StateBadge,
  WaitingForDatabase,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { CardLink, DashCanvas, DashKpi, DashKpiGrid } from '@/components/portal/dash';
import {
  asObject,
  asStatus,
  AUDIENCE_TAG,
  commsHref,
  countsOf,
  delta,
  kpisOf,
  label,
  LOG_STATUS_LABEL,
  messageName,
  n,
  PROVIDER_LABEL,
  rate,
  rowsOf,
  when,
  type LogRow,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications & Automations' };
export const dynamic = 'force-dynamic';

interface Highlight {
  key: string;
  name: string;
  trigger: string;
  enabled: boolean;
  channels: string[];
  source: string;
}

const CARDS: { key: string; title: string; text: string; icon: LucideIcon; tone: string }[] = [
  {
    key: 'email',
    title: 'Email Configuration',
    text: 'The email provider, sender details, sending limits and a test send.',
    icon: Mail,
    tone: 'from-[#FFE2C4] to-[#FFC48A] text-[#C25E00]',
  },
  {
    key: 'sms',
    title: 'SMS Configuration',
    text: "Africa's Talking or Twilio, the sender ID, SMS templates and costs.",
    icon: MessageSquareText,
    tone: 'from-[#FFE9B0] to-[#FFD166] text-[#9A6700]',
  },
  {
    key: 'push',
    title: 'Push Notifications',
    text: 'The NexG bell, browser push and the phone apps (iOS & Android).',
    icon: Bell,
    tone: 'from-[#FFE9B0] to-[#FFC94D] text-[#B57A00]',
  },
  {
    key: 'whatsapp',
    title: 'WhatsApp Configuration',
    text: 'The WhatsApp Business API, its number, replies and templates.',
    icon: MessageCircle,
    tone: 'from-[#D6F5DD] to-[#9BE3AE] text-[#1E7B34]',
  },
  {
    key: 'templates',
    title: 'Message Templates',
    text: 'Reusable email, SMS, WhatsApp and push messages with {{fields}}.',
    icon: FileText,
    tone: 'from-[#EBDDFF] to-[#CDB2FF] text-[#6B3FB8]',
  },
  {
    key: 'workflows',
    title: 'Automated Workflows',
    text: 'Event-based messages: booking confirmed, payout sent, a reminder.',
    icon: Workflow,
    tone: 'from-[#EBDDFF] to-[#CDB2FF] text-[#6B3FB8]',
  },
  {
    key: 'scheduled',
    title: 'Scheduled Messages',
    text: 'One-time or recurring messages: promotions, updates, notices.',
    icon: CalendarClock,
    tone: 'from-[#FFE2C4] to-[#FFC48A] text-[#C25E00]',
  },
  {
    key: 'bulk',
    title: 'Manual & Bulk Messaging',
    text: 'Send to guests, hosts, riders, merchants or one person.',
    icon: Megaphone,
    tone: 'from-[#FFE2C4] to-[#FFB380] text-[#C25E00]',
  },
  {
    key: 'queue',
    title: 'Message Queue',
    text: 'Messages waiting, sending and retrying, with the retry rules.',
    icon: Inbox,
    tone: 'from-[#EBDDFF] to-[#CDB2FF] text-[#6B3FB8]',
  },
  {
    key: 'logs',
    title: 'Delivery Logs',
    text: 'Every message, its status, errors and what the provider said.',
    icon: ListChecks,
    tone: 'from-[#FFE2C4] to-[#FFC48A] text-[#C25E00]',
  },
  {
    key: 'analytics',
    title: 'Analytics & Reports',
    text: 'Sent, delivered and failed by channel, audience and campaign.',
    icon: BarChart3,
    tone: 'from-[#FFE9B0] to-[#FFC94D] text-[#B57A00]',
  },
  {
    key: 'consent',
    title: 'Preferences & Consent',
    text: 'Marketing consent, opt-outs and suppression (Kenya DPA 2019).',
    icon: ShieldCheck,
    tone: 'from-[#FFE9B0] to-[#FFC94D] text-[#B57A00]',
  },
];

/**
 * Communications & Automations → Overview: what went out in the period, a
 * card for each part of the module, the automations that are on, whether
 * each channel is really connected, and the latest messages.
 */
export default async function CommsOverviewPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const q = await ctx.read('rpc_comms_overview', { p_from: period.from, p_to: period.to });
  const o = asObject(q.data);
  const k = kpisOf(o.kpis);
  const prev = kpisOf(o.prev);
  const ch = asObject(o.channels);
  const counts = countsOf(o.counts);
  const highlights = rowsOf<Highlight>(o.workflows);
  const recent = rowsOf<LogRow>(o.recent);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const href = (path: string, params: Record<string, string | null> = {}) =>
    commsHref(path, period, params);
  const email = asStatus(ch.email);
  const sms = asStatus(ch.sms);
  const wa = asStatus(ch.whatsapp);
  const web = asStatus(ch.web_push);

  const subtitle: Record<string, string> = {
    templates: `${n(counts.templates)} active`,
    workflows: `${n(counts.workflows)} on`,
    scheduled: `${n(counts.scheduled)} scheduled`,
    queue: `${n(counts.queue)} waiting`,
    consent: `${n(counts.suppressed)} suppressed`,
  };

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen={null}
        subtitle="Configure channels, templates and automated messages for hosts, guests, riders and merchants."
        period={period}
      />
      <DashCanvas>
        <CommsTabs active="overview" period={period} />
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
                explain="Every email, SMS, WhatsApp and in-app message queued or sent in the period (skipped ones left out). The change is against the period before."
                href={href('/communications/logs')}
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Delivered"
                value={n(k.sent)}
                explain="Accepted by the provider (Resend, the SMS gateway, Meta) or shown in the bell. Providers' read receipts are not wired in yet."
              >
                <span className="text-success text-[0.9375rem] font-extrabold">
                  {rate(k.sent, k.total)}
                </span>
              </DashKpi>
              <DashKpi
                icon={Inbox}
                label="In Progress"
                value={n(k.queued)}
                explain="Queued and not sent yet: waiting for the dispatcher, retrying, or held because a provider is not connected."
                href={href('/communications/queue')}
              >
                <span className="text-muted text-[0.875rem] font-semibold">
                  {rate(k.queued, k.total)}
                </span>
              </DashKpi>
              <DashKpi
                icon={Users}
                label="Unique Recipients"
                value={n(k.recipients)}
                delta={delta(k.recipients, prev.recipients)}
                explain="Different addresses and accounts messaged in the period."
              />
              <DashKpi
                icon={TriangleAlert}
                iconTone="red"
                label="Failed"
                value={n(k.failed)}
                upIsBad
                delta={delta(k.failed, prev.failed)}
                explain="Given up on after the retries, or refused by the provider."
                href={href('/communications/logs', { status: 'failed' })}
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
              <Panel title="Manage Your Communications">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {CARDS.map((c) => {
                    const Icon = c.icon;
                    return (
                      <li key={c.key}>
                        <Link
                          href={href(`/communications/${c.key}`)}
                          className="border-border focus-visible:ring-gold group flex h-full items-center gap-3 rounded-2xl border bg-gradient-to-r from-white to-[#FFFBF2] p-3.5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2"
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${c.tone}`}
                          >
                            <Icon className="h-7 w-7" strokeWidth={1.7} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-extrabold">{c.title}</span>
                            <span className="text-muted block text-[0.8125rem] font-semibold leading-snug">
                              {c.text}
                            </span>
                            {subtitle[c.key] && (
                              <span className="mt-1 block text-[0.75rem] font-bold text-[#8A5C00]">
                                {subtitle[c.key]}
                              </span>
                            )}
                          </span>
                          <ChevronRight
                            aria-hidden="true"
                            className="text-muted h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Panel>

              <div className="space-y-4">
                <Panel
                  title="Automation Highlights"
                  icon={Zap}
                  aside={
                    <CardLink href={href('/communications/workflows')}>View All Workflows</CardLink>
                  }
                >
                  {highlights.length === 0 ? (
                    <Empty>No automations yet.</Empty>
                  ) : (
                    <ul className="divide-border divide-y">
                      {highlights.slice(0, 6).map((w) => (
                        <li key={w.key} className="flex items-center justify-between gap-3 py-2.5">
                          <span className="min-w-0">
                            <span className="block truncate text-[0.9375rem] font-bold">
                              {w.name}
                            </span>
                            <span className="text-muted block truncate text-[0.8125rem] font-semibold">
                              When “{w.trigger}” ·{' '}
                              {w.source === 'system' ? 'NexG email' : 'Custom workflow'}
                            </span>
                          </span>
                          <WorkflowSwitch
                            id={w.key}
                            enabled={w.enabled}
                            name={w.name}
                            canEdit={canEdit}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title="Communication Channel Status">
                  <ul className="divide-border divide-y">
                    {(
                      [
                        ['email', 'Email', email.provider ?? 'resend', email],
                        ['sms', 'SMS', sms.provider ?? 'africastalking', sms],
                        ['whatsapp', 'WhatsApp', 'meta', wa],
                        ['in_app', 'Push', 'vapid', web],
                      ] as const
                    ).map(([key, name, provider, s]) => (
                      <li key={key} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <ChannelIcon channel={key} />
                          <span className="min-w-0">
                            <span className="block text-[0.9375rem] font-bold">
                              {name} ({label(PROVIDER_LABEL, provider)})
                            </span>
                            <span className="text-muted block text-[0.8125rem] font-semibold">
                              {s.last_sent_at
                                ? `Last sent ${when(s.last_sent_at)}`
                                : 'Nothing sent through it yet'}
                            </span>
                          </span>
                        </span>
                        <Link
                          href={href(`/communications/${key === 'in_app' ? 'push' : key}`)}
                          className="shrink-0"
                        >
                          <StateBadge state={s.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Footnote>
                    Connected means the provider is set up and has sent; the channel pages say what
                    is missing.
                  </Footnote>
                </Panel>

                <Panel
                  title="Recent Communications"
                  aside={<CardLink href={href('/communications/logs')}>View All</CardLink>}
                >
                  {recent.length === 0 ? (
                    <Empty>No messages yet.</Empty>
                  ) : (
                    <ul className="divide-border divide-y">
                      {recent.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 py-2.5">
                          <ChannelIcon channel={r.channel} />
                          <Link
                            href={href('/communications/logs', { selected: r.id })}
                            className="min-w-0 flex-1 hover:underline"
                          >
                            <span className="block truncate text-[0.875rem] font-bold">
                              {messageName(r)} – {label(AUDIENCE_TAG, r.audience)}
                            </span>
                            <span className="text-muted block text-[0.75rem] font-semibold">
                              {when(r.created_at)}
                            </span>
                          </Link>
                          <Chip status={r.status} text={label(LOG_STATUS_LABEL, r.status)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
