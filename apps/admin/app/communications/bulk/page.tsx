import {
  CalendarClock,
  CheckCircle2,
  Hourglass,
  Megaphone,
  PieChart,
  Send,
  TriangleAlert,
  UserX,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut } from '@/components/charts';
import { Composer } from '@/components/comms/client';
import {
  AudienceChip,
  ChannelIcons,
  Chip,
  CommsHeader,
  CommsTabs,
  DataTable,
  Empty,
  ErrorNote,
  FilterRow,
  Footnote,
  LegendRow,
  Panel,
  StateBadge,
  WaitingForDatabase,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashKpi, DashKpiGrid, Pagination } from '@/components/portal/dash';
import { DashSearch } from '@/components/portal/dash-filters';
import {
  asNumber,
  asObject,
  asStatus,
  CHANNEL_LABEL,
  commsHref,
  countsOf,
  label,
  n,
  pageNumber,
  rate,
  rowsOf,
  when,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · Manual & Bulk Messaging' };
export const dynamic = 'force-dynamic';

const PER = 5;

interface Campaign {
  id: string;
  ref: string;
  name: string;
  kind: string;
  purpose: string;
  audiences: string[];
  channels: string[];
  people: number;
  queued: number;
  skipped_consent: number;
  skipped_suppressed: number;
  skipped_no_address: number;
  status: string;
  created_at: string;
  sent: number;
  failed: number;
  waiting: number;
}

/**
 * Manual & Bulk Messaging: compose, check who it reaches (only people who
 * said yes to marketing, never a suppressed address), confirm, send; or send
 * one service message to one address. The history shows what each send
 * really did.
 */
export default async function BulkPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; city?: string; q?: string; page?: string };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const sp = searchParams ?? {};
  const page = pageNumber(sp.page);
  const q = await ctx.read('rpc_comms_campaigns', {
    p_from: period.from,
    p_to: period.to,
    p_search: sp.q ?? null,
    p_page: page,
    p_per: PER,
  });
  const o = asObject(q.data);
  const k = asObject(o.kpis);
  const rows = rowsOf<Campaign>(o.rows);
  const templates = rowsOf<{
    id: string;
    name: string;
    channels: string[];
    email_subject: string | null;
    email_body: string | null;
    sms_body: string | null;
  }>(o.templates);
  const ch = asObject(o.channels);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const canSend = o.level === 'full';
  const messages = asNumber(k.messages);
  const sent = asNumber(k.sent);
  const failed = asNumber(k.failed);
  const queued = asNumber(k.queued);
  const skippedConsent = rows.reduce((s, r) => s + r.skipped_consent, 0);
  const cityName = ctx.cities.find((c) => c.id === ctx.city)?.name ?? null;
  const href = (extra: Record<string, string | null> = {}) =>
    commsHref('/communications/bulk', period, { city: ctx.city, q: sp.q ?? null, ...extra });

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="Manual & Bulk Messaging"
        subtitle="Send one-time messages or bulk campaigns to guests, hosts, riders, merchants and property managers."
        period={period}
        cities={ctx.cities}
        city={ctx.city}
      />
      <DashCanvas>
        <CommsTabs active="bulk" period={period} />
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
                label="Messages Sent"
                value={n(messages)}
                explain="Messages from bulk, announcement, scheduled and manual sends in the period."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Delivered"
                value={n(sent)}
                explain="Accepted by the provider or shown in the bell."
              >
                <span className="text-success text-[0.9375rem] font-extrabold">
                  {rate(sent, messages)}
                </span>
              </DashKpi>
              <DashKpi
                icon={UserX}
                label="Left Out (No Consent)"
                value={n(skippedConsent)}
                explain="People in the chosen audiences who have not said yes to marketing, in the sends listed below."
              />
              <DashKpi
                icon={Megaphone}
                label="Campaigns"
                value={n(asNumber(o.campaigns))}
                explain="Sends made in the period."
              />
              <DashKpi
                icon={Hourglass}
                label="In Progress"
                value={n(asNumber(o.in_progress))}
                explain="Sends with messages still waiting to go out."
                href={commsHref('/communications/queue', period)}
              />
              <DashKpi
                icon={TriangleAlert}
                iconTone="red"
                label="Failed"
                value={n(failed)}
                upIsBad
                explain="Messages from these sends the provider refused or that ran out of retries."
              >
                <span className="text-muted text-[0.875rem] font-semibold">
                  {rate(failed, messages)}
                </span>
              </DashKpi>
            </DashKpiGrid>

            <Panel
              title="Compose Message"
              note="Send a one-time or bulk message to the audience you choose."
              icon={Megaphone}
            >
              <Composer
                audiences={countsOf(o.audiences)}
                templates={templates}
                cityId={ctx.city}
                cityName={cityName}
                canSend={canSend}
                canEdit={canEdit}
              />
              <div className="border-border mt-4 flex flex-wrap items-center gap-3 border-t pt-3 text-[0.8125rem]">
                <span className="font-bold">Channels:</span>
                {(['email', 'sms', 'whatsapp'] as const).map((c) => (
                  <span key={c} className="flex items-center gap-1.5">
                    {label(CHANNEL_LABEL, c)} <StateBadge state={asStatus(ch[c]).status} />
                  </span>
                ))}
                <span className="text-muted">
                  A channel that is not connected keeps its messages in the queue until it is.
                </span>
              </div>
            </Panel>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <Panel
                title="Bulk Message History"
                note="All manual and bulk messages, their status and results."
              >
                <FilterRow>
                  <DashSearch
                    label="Search campaigns"
                    placeholder="Search campaigns…"
                    value={sp.q ?? ''}
                  />
                </FilterRow>
                <DataTable
                  caption="Bulk message history"
                  isEmpty={rows.length === 0}
                  empty="Nothing sent yet."
                  head={[
                    'Campaign Name',
                    'Audience',
                    'Channels',
                    'Recipients',
                    'Delivered',
                    'Left out',
                    'Status',
                    'Sent At',
                  ]}
                >
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="flex items-center gap-2">
                          {r.kind === 'scheduled' ? (
                            <CalendarClock
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0 text-[#E5A800]"
                            />
                          ) : (
                            <Megaphone
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0 text-[#E5A800]"
                            />
                          )}
                          <span className="min-w-0">
                            <span className="block font-bold">{r.name}</span>
                            <span className="text-muted block text-[0.75rem]">
                              {r.ref} ·{' '}
                              {r.kind === 'manual'
                                ? 'Manual'
                                : r.kind === 'scheduled'
                                  ? 'Scheduled'
                                  : r.kind === 'announcement'
                                    ? 'Announcement'
                                    : 'Bulk'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {r.audiences.length === 0 ? (
                            <span className="text-muted">One person</span>
                          ) : (
                            r.audiences.map((a) => <AudienceChip key={a} audience={a} plural />)
                          )}
                        </span>
                      </td>
                      <td>
                        <ChannelIcons channels={r.channels} />
                      </td>
                      <td className="tabular-nums">{n(r.queued)}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {n(r.sent)} <span className="text-muted">({rate(r.sent, r.queued)})</span>
                      </td>
                      <td
                        className="tabular-nums"
                        title={`${r.skipped_consent} no consent · ${r.skipped_suppressed} suppressed · ${r.skipped_no_address} no address`}
                      >
                        {n(r.skipped_consent + r.skipped_suppressed + r.skipped_no_address)}
                      </td>
                      <td>
                        <Chip
                          status={
                            r.waiting > 0
                              ? 'sending'
                              : r.failed > 0 && r.sent === 0
                                ? 'failed'
                                : 'completed'
                          }
                          text={
                            r.waiting > 0
                              ? 'Sending'
                              : r.failed > 0 && r.sent === 0
                                ? 'Failed'
                                : 'Completed'
                          }
                        />
                      </td>
                      <td className="whitespace-nowrap">{when(r.created_at)}</td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PER}
                  total={asNumber(o.total)}
                  noun="sends"
                  href={(p) => href({ page: String(p) })}
                />
              </Panel>

              <Panel
                title="Campaign Performance"
                note="Messages from sends in the period."
                icon={PieChart}
              >
                {messages > 0 ? (
                  <>
                    <ShareDonut
                      centre={rate(sent, messages)}
                      caption="Delivery Rate"
                      data={[
                        { key: 'sent', label: 'Delivered', value: sent, color: '#F5A623' },
                        { key: 'queued', label: 'In progress', value: queued, color: '#FFD98A' },
                        { key: 'failed', label: 'Failed', value: failed, color: '#C9C4B8' },
                      ]}
                    />
                    <ul className="mt-3 space-y-1.5">
                      <LegendRow
                        color="#F5A623"
                        name="Delivered"
                        value={n(sent)}
                        share={rate(sent, messages)}
                      />
                      <LegendRow
                        color="#FFD98A"
                        name="In progress"
                        value={n(queued)}
                        share={rate(queued, messages)}
                      />
                      <LegendRow
                        color="#C9C4B8"
                        name="Failed"
                        value={n(failed)}
                        share={rate(failed, messages)}
                      />
                    </ul>
                  </>
                ) : (
                  <Empty>No campaign messages in this period.</Empty>
                )}
                <Footnote>Opens are not tracked yet; they need the providers’ webhooks.</Footnote>
              </Panel>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
