import {
  CheckCircle2,
  Coins,
  Inbox,
  Mail,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  UserRound,
  XCircle,
} from 'lucide-react';
import type { Metadata } from 'next';

import {
  CostForm,
  EmailLimitsForm,
  RetryForm,
  SenderForm,
  TestSendForm,
} from '@/components/comms/client';
import {
  Chip,
  CommsHeader,
  CommsTabs,
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
  delta,
  kpisOf,
  n,
  rate,
  rowsOf,
  when,
} from '@/lib/comms';
import { checkDomain, type DnsState } from '@/lib/comms-dns';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · Email Configuration' };
export const dynamic = 'force-dynamic';

const DNS_TEXT: Record<DnsState, string> = {
  configured: 'Configured',
  missing: 'Missing',
  unknown: 'Could not check',
};
const DNS_TONE: Record<DnsState, string> = {
  configured: 'active',
  missing: 'failed',
  unknown: 'unknown',
};

/**
 * Email Configuration: Resend (what notify-dispatch really sends with), the
 * sender for messages from this module, the domain's SPF / DKIM / DMARC read
 * from DNS, a test send, the sending rules and this month's use.
 */
export default async function EmailConfigPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const q = await ctx.read('rpc_comms_channel', {
    p_channel: 'email',
    p_from: period.from,
    p_to: period.to,
  });
  const o = asObject(q.data);
  const k = kpisOf(o.kpis);
  const prev = kpisOf(o.prev);
  const status = asStatus(asObject(o.channels).email);
  const route = asObject(o.route) as {
    from_name?: string;
    from_email?: string;
    reply_to?: string | null;
  };
  const settings = asObject(o.settings);
  const month = asObject(o.month);
  const cost = asNumber(o.cost_kes);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const templates = rowsOf<{ id: string; name: string }>(o.templates);
  const dns =
    q.waiting || q.error ? null : await checkDomain(route.from_email ?? 'info@nexgapp.com');
  const reportedFrom = (status.detail as { from?: string } | undefined)?.from;

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="Email Configuration"
        subtitle="Your email provider, sender details, authentication and email sending rules for NexG."
        period={period}
      />
      <DashCanvas>
        <CommsTabs active="email" period={period} />
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
                label="Emails Sent"
                value={n(k.total)}
                delta={delta(k.total, prev.total)}
                explain="Emails queued or sent in the period."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Delivered"
                value={n(k.sent)}
                explain="Accepted by Resend. Opens and clicks are not tracked: that needs Resend's webhook, which is not wired in."
              >
                <span className="text-success text-[0.9375rem] font-extrabold">
                  {rate(k.sent, k.total)}
                </span>
              </DashKpi>
              <DashKpi
                icon={Inbox}
                label="In Progress"
                value={n(k.queued)}
                explain="Waiting, retrying, or held because the provider is not connected."
                href={commsHref('/communications/queue', period, { channel: 'email' })}
              />
              <DashKpi
                icon={XCircle}
                label="Skipped"
                value={n(k.skipped)}
                explain="Not sent on purpose: no address on file, or that kind of email is switched off in Settings › Email routing."
              />
              <DashKpi
                icon={TriangleAlert}
                iconTone="red"
                label="Failed"
                value={n(k.failed)}
                upIsBad
                delta={delta(k.failed, prev.failed)}
                explain="Given up on after the retries, or refused by Resend."
                href={commsHref('/communications/logs', period, {
                  channel: 'email',
                  status: 'failed',
                })}
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <Panel
                title="Email Provider (Transactional)"
                note="Every NexG email goes through this provider."
                icon={Mail}
              >
                <ul className="space-y-2">
                  <ProviderRow
                    provider="resend"
                    note="What notify-dispatch sends with today"
                    state={status.status}
                    selected
                    extra={
                      status.status === 'connected' ? (
                        <p className="text-muted mt-2 text-[0.8125rem]">
                          {reportedFrom ? `Default sender ${reportedFrom}. ` : ''}
                          {status.last_sent_at
                            ? `Last email accepted ${when(status.last_sent_at)}.`
                            : ''}
                        </p>
                      ) : status.last_config_error ? (
                        <p className="text-danger mt-2 text-[0.8125rem] font-semibold">
                          Last run said: {status.last_config_error}
                        </p>
                      ) : null
                    }
                  />
                </ul>
                <Footnote>
                  Zoho ZeptoMail, SendGrid and Amazon SES are not wired into the sender; switching
                  to one is a code change in notify-dispatch, not a setting.
                </Footnote>
              </Panel>

              <Panel
                title="Sender & Identity Settings"
                note="The sender for messages from Communications & Automations."
                icon={UserRound}
              >
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                  <SenderForm value={route} canEdit={canEdit} />
                  <div className="space-y-3">
                    <p className="text-sm font-bold">From Email (Display)</p>
                    <div className="border-border flex items-center gap-3 rounded-xl border p-3">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#141414] text-[0.6875rem] font-extrabold text-[#F5C842]"
                      >
                        NEXG
                      </span>
                      <span className="min-w-0 text-[0.8125rem]">
                        <span className="block truncate font-bold">
                          {route.from_name ?? 'NexG'} &lt;{route.from_email ?? 'info@nexgapp.com'}
                          &gt;
                        </span>
                        <span className="text-muted block">To: guest@example.com</span>
                      </span>
                    </div>
                    <p className="text-muted text-[0.8125rem] leading-relaxed">
                      Order, stay and partner emails keep their own senders in Settings › Email
                      routing; this one is for announcements, bulk, scheduled and workflow messages.
                    </p>
                    <CardLink href="/settings?tab=emails">Email routing</CardLink>
                  </div>
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <Panel
                title="Domain Authentication"
                note="Read live from DNS for the sender's domain."
                icon={ShieldCheck}
              >
                {dns ? (
                  <ul className="divide-border divide-y">
                    {(
                      [
                        [
                          'SPF (Sender Policy Framework)',
                          dns.spf,
                          dns.spfAt ? `TXT on ${dns.spfAt}` : `TXT on send.${dns.domain}`,
                        ],
                        [
                          'DKIM (DomainKeys Identified Mail)',
                          dns.dkim,
                          `TXT on resend._domainkey.${dns.domain}`,
                        ],
                        [
                          'DMARC (Domain-based Message Authentication)',
                          dns.dmarc,
                          `TXT on _dmarc.${dns.domain}`,
                        ],
                      ] as const
                    ).map(([name, state, where]) => (
                      <li key={name} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block text-[0.9375rem] font-bold">{name}</span>
                          <span className="text-muted block text-[0.8125rem] font-semibold">
                            {where}
                          </span>
                        </span>
                        <Chip status={DNS_TONE[state]} text={DNS_TEXT[state]} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted text-sm">Set a sender email to check its domain.</p>
                )}
                <Footnote>
                  Missing records are added at the domain’s DNS host, from the values Resend shows
                  for the domain.
                </Footnote>
              </Panel>

              <Panel
                title="Test Email"
                note="Send a test to check the provider, sender and branding."
                icon={Send}
              >
                <TestSendForm channel="email" templates={templates} canEdit={canEdit} />
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Panel
                title="Email Sending Rules"
                note="Limits and behaviour for outgoing emails."
                icon={SlidersHorizontal}
              >
                <EmailLimitsForm
                  value={asObject(settings.email_limits) as { daily?: number; per_minute?: number }}
                  canEdit={canEdit}
                />
                <div className="border-border mt-4 border-t pt-4">
                  <p className="mb-2 text-sm font-bold">Retries (all channels)</p>
                  <RetryForm value={asObject(settings.retry)} canEdit={canEdit} />
                </div>
                <Footnote>
                  Unsubscribe: every marketing email from this module carries an opt-out link,
                  always. Bounces are recorded as failures in the Delivery Logs; add an address to a
                  suppression list to stop it.
                </Footnote>
              </Panel>

              <Panel title="Email Usage & Cost (This Month)" icon={Coins}>
                <KeyValues
                  rows={[
                    ['Emails Sent', n(asNumber(month.sent))],
                    ['Failed', n(asNumber(month.failed))],
                    ['Queued or sent', n(asNumber(month.total))],
                    [
                      'Estimated Cost (KES)',
                      cost > 0 ? `≈ ${n(cost * asNumber(month.sent))}` : 'Set the price below',
                    ],
                    ['Plan', 'Resend (see its dashboard)'],
                  ]}
                />
                <div className="mt-3">
                  <CostForm
                    channel="email"
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
