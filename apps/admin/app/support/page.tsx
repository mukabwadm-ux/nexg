import { EmptyState, StatusBadge } from '@nexg/ui';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Hourglass,
  Inbox,
  MessageSquareReply,
  Ticket,
  UserCheck,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { reply, setStatus } from '@/app/support/actions';
import { ShareDonut, TrendArea } from '@/components/charts';
import { Kpi, KpiGrid, Panel, PillTabs } from '@/components/console-kit';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { TicketThread, type ThreadMessage } from '@/components/ticket-thread';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Support & tickets' };
export const dynamic = 'force-dynamic';

const QUEUES = [
  { key: 'queue', label: 'Queue', statuses: ['open'] },
  { key: 'mine', label: 'Mine', statuses: ['assigned'] },
  { key: 'answered', label: 'Answered', statuses: ['answered'] },
  { key: 'done', label: 'Resolved', statuses: ['resolved', 'closed'] },
] as const;

/*
 * The forms speak in field names; a desk agent reads English.
 * An unmapped key still renders with its underscores turned to
 * spaces, so a form can add a question and the answer shows up
 * without this file changing — just less prettily.
 */
const DETAIL_LABEL: Record<string, string> = {
  need: 'They want',
  when: 'When',
  when_detail: 'Time they gave',
  staying_at: 'Staying at',
  zone: 'Zone',
  notes: 'They added',
  from_role: 'Filling in as',
  topic: 'Topic they chose',
  kind: 'They are a',
  units_band: 'How many units',
  handoff: 'How riders hand over',
  listing_link: 'Listing link',
  address: 'First unit address',
  city: 'City',
};

const DETAIL_VALUE: Record<string, string> = {
  asap: 'As soon as possible',
  later: 'At a time to arrange',
  /* What a host told us on the landing page. */
  single_unit: 'Single unit',
  multi_unit: 'A few units',
  property_manager: 'Property manager',
  '1': '1 unit',
  '2_5': '2 to 5 units',
  '6_20': '6 to 20 units',
  '20_plus': '20 units or more',
  guest_meets_at_gate: 'Guest meets at gate',
  leave_with_askari: 'Leave with askari',
  lockbox: 'Lockbox',
  call_guest_first: 'Call guest first',
  reception: 'Reception',
  caretaker: 'Caretaker',
};

const TOPIC_LABEL: Record<string, string> = {
  order_problem: 'Order problem',
  payment_or_refund: 'Payment or refund',
  account: 'Account',
  concierge_request: 'Concierge request',
  partner_rider: 'Rider',
  partner_merchant: 'Merchant',
  hotel_partnership: 'Hotel',
  something_else: 'Something else',
};

const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  open: 'danger',
  assigned: 'warning',
  answered: 'neutral',
  resolved: 'success',
  closed: 'success',
};

function waitedFor(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export default async function SupportAndTicketsPage({
  searchParams,
}: {
  searchParams?: { queue?: string; ticket?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'support');
  const supabase = createClient();

  const queueKey = QUEUES.some((q) => q.key === searchParams?.queue)
    ? (searchParams!.queue as string)
    : 'queue';
  const queue = QUEUES.find((q) => q.key === queueKey)!;

  const { data: tickets } = await supabase
    .from('support_ticket')
    .select(
      'id, reference, from_role, topic, full_name, email, phone, order_reference, body, details, source_form, status, assigned_to, first_reply_at, created_at',
    )
    .order('created_at', { ascending: true });

  const all = tickets ?? [];
  const inQueue = all.filter((t) => (queue.statuses as readonly string[]).includes(t.status));

  const selected = all.find((t) => t.id === searchParams?.ticket) ?? inQueue[0] ?? all[0] ?? null;

  const { data: notices } = selected
    ? await supabase
        .from('notification')
        .select('kind, status, error, sent_at')
        .eq('ticket_id', selected.id)
        .order('created_at', { ascending: true })
    : { data: [] };

  const { data: thread } = selected
    ? await supabase
        .from('support_message')
        .select('id, body, internal, created_at, staff_user(display_name)')
        .eq('ticket_id', selected.id)
        .order('created_at', { ascending: true })
    : { data: [] };

  const messages: ThreadMessage[] = (thread ?? []).map((m) => ({
    id: m.id,
    body: m.body,
    internal: m.internal,
    createdAt: m.created_at,
    author: (m.staff_user as { display_name: string } | null)?.display_name ?? null,
  }));

  const href = (patch: { queue?: string; ticket?: string }) => {
    const params = new URLSearchParams();
    const q = patch.queue ?? queueKey;
    if (q !== 'queue') params.set('queue', q);
    if (patch.ticket) params.set('ticket', patch.ticket);
    const search = params.toString();
    return search ? `/support?${search}` : '/support';
  };

  const waiting = all.filter((t) => t.status === 'open').length;
  const handling = all.filter((t) => t.status === 'assigned').length;
  const answered = all.filter((t) => t.status === 'answered').length;
  const resolved = all.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

  /* How long people wait for a first answer, over the tickets that have one. */
  const replyMinutes = all
    .filter((t) => t.first_reply_at)
    .map(
      (t) => (new Date(t.first_reply_at!).getTime() - new Date(t.created_at).getTime()) / 60_000,
    );
  const avgReply = replyMinutes.length
    ? replyMinutes.reduce((a, b) => a + b, 0) / replyMinutes.length
    : null;
  const duration = (minutes: number) =>
    minutes < 60
      ? `${Math.max(1, Math.round(minutes))} min`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`
        : `${(minutes / 1440).toFixed(1)} days`;

  /* The last 30 days, Nairobi time: what came in, and what got a first answer. */
  const nairobiDay = (at: string | number) =>
    new Date(at).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const days = new Map<string, { created: number; replied: number }>();
  for (let i = 29; i >= 0; i--)
    days.set(nairobiDay(Date.now() - i * 86_400_000), { created: 0, replied: 0 });
  for (const t of all) {
    const c = days.get(nairobiDay(t.created_at));
    if (c) c.created += 1;
    if (t.first_reply_at) {
      const r = days.get(nairobiDay(t.first_reply_at));
      if (r) r.replied += 1;
    }
  }
  const trend = [...days].map(([day, v]) => ({ day, ...v }));
  const inMonth = trend.reduce((sum, d) => sum + d.created, 0);

  const tally = (pick: (t: (typeof all)[number]) => string, label: (k: string) => string) => {
    const counts = new Map<string, number>();
    for (const t of all) counts.set(pick(t), (counts.get(pick(t)) ?? 0) + 1);
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => ({ key, label: label(key), value }));
  };
  const byTopic = tally(
    (t) => t.topic,
    (k) => TOPIC_LABEL[k] ?? k.replace(/_/g, ' '),
  );
  const byRole = tally(
    (t) => t.from_role ?? 'unknown',
    (k) => (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' '),
  );

  return (
    <ConsoleShell staff={staff} current="/support">
      <ConsoleHeader
        title="Support & tickets"
        breadcrumb="Everything sent from the Help page, as tickets with a reference people can quote."
        action={
          <span className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/80">
            {waiting} waiting · {all.length} in total
          </span>
        }
      />

      <main className="px-4 py-5 sm:px-8">
        {all.length > 0 && (
          <>
            <KpiGrid>
              <Kpi
                featured
                icon={Ticket}
                label="All tickets"
                value={all.length.toLocaleString('en-KE')}
                note={`${inMonth} in the last 30 days`}
              />
              <Kpi
                icon={Hourglass}
                label="Waiting"
                value={waiting.toLocaleString('en-KE')}
                note="Nobody has picked up"
                href="/support"
              />
              <Kpi
                icon={UserCheck}
                label="Being handled"
                value={handling.toLocaleString('en-KE')}
                note="Assigned to someone"
                href="/support?queue=mine"
              />
              <Kpi
                icon={MessageSquareReply}
                label="Answered"
                value={answered.toLocaleString('en-KE')}
                note="Waiting on the person"
                href="/support?queue=answered"
              />
              <Kpi
                icon={CheckCircle2}
                label="Resolved"
                value={resolved.toLocaleString('en-KE')}
                note={
                  all.length
                    ? `${Math.round((resolved / all.length) * 100)}% of all tickets`
                    : undefined
                }
                href="/support?queue=done"
              />
              <Kpi
                icon={Clock}
                label="Average first reply"
                value={avgReply === null ? null : duration(avgReply)}
                note={
                  avgReply === null ? 'No replies yet' : `Across ${replyMinutes.length} answered`
                }
              />
            </KpiGrid>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Panel title="Ticket trend" aside="Last 30 days">
                <TrendArea
                  data={trend}
                  height={200}
                  series={[
                    { key: 'created', label: 'New tickets' },
                    { key: 'replied', label: 'First replies', color: '#1F9D55' },
                  ]}
                />
              </Panel>
              <Panel title="Tickets by topic">
                <ShareDonut
                  data={byTopic}
                  centre={all.length.toLocaleString('en-KE')}
                  caption="Tickets"
                  stacked
                />
              </Panel>
              <Panel title="Who wrote in">
                <ShareDonut
                  data={byRole}
                  centre={all.length.toLocaleString('en-KE')}
                  caption="Tickets"
                  stacked
                />
              </Panel>
            </div>
          </>
        )}

        <PillTabs
          className="mt-5"
          tabs={QUEUES.map((option) => ({
            href: href({ queue: option.key }),
            label: option.label,
            count: all.filter((t) => (option.statuses as readonly string[]).includes(t.status))
              .length,
            active: option.key === queueKey,
          }))}
        />

        {all.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title="Nothing has come in yet"
              description="Messages from the Help page land here as tickets, with a reference the person can quote on the phone."
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start">
            {/* Queue */}
            <ul className="space-y-2.5">
              {inQueue.length === 0 ? (
                <li className="border-border bg-surface text-muted-light rounded-xl border p-6 text-center text-sm font-semibold">
                  Nothing in this queue.
                </li>
              ) : (
                inQueue.map((ticket) => {
                  const active = ticket.id === selected?.id;
                  return (
                    <li key={ticket.id}>
                      <Link
                        href={href({ ticket: ticket.id })}
                        scroll={false}
                        className={`block rounded-xl border p-4 transition-colors ${
                          active
                            ? 'border-gold bg-gold/[0.07]'
                            : 'border-border bg-surface hover:border-border-strong'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[0.875rem] font-extrabold">
                            {ticket.full_name?.trim() || ticket.reference}
                          </span>
                          <span
                            className={`shrink-0 text-[0.6875rem] font-bold ${
                              ticket.status === 'open' ? 'text-danger' : 'text-muted-light'
                            }`}
                          >
                            {waitedFor(ticket.created_at)}
                          </span>
                        </span>
                        <span className="text-muted-light mt-0.5 block truncate text-[0.6875rem] font-semibold">
                          {ticket.from_role} · {TOPIC_LABEL[ticket.topic] ?? ticket.topic} ·{' '}
                          {ticket.reference}
                        </span>
                        <span className="text-muted mt-2 line-clamp-2 block text-xs font-semibold leading-snug">
                          {ticket.body}
                        </span>
                      </Link>
                    </li>
                  );
                })
              )}
            </ul>

            {/* Thread */}
            {selected ? (
              <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:items-start">
                <section className="border-border bg-surface rounded-2xl border p-5">
                  <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight">
                        {selected.full_name?.trim() || 'Anonymous'}
                        <StatusBadge tone={STATUS_TONE[selected.status] ?? 'neutral'}>
                          {selected.status}
                        </StatusBadge>
                      </p>
                      <p className="text-muted-light mt-0.5 text-xs font-semibold">
                        {selected.reference} · {TOPIC_LABEL[selected.topic] ?? selected.topic}
                        {selected.order_reference && ` · ref ${selected.order_reference}`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <TicketThread
                      ticketId={selected.id}
                      opening={selected.body}
                      openedAt={selected.created_at}
                      from={selected.full_name?.trim() || selected.from_role}
                      status={selected.status}
                      messages={messages}
                      onReply={async (body: string, internal: boolean) => {
                        'use server';
                        return reply(selected.id, body, internal);
                      }}
                      onStatus={async (
                        next: 'open' | 'assigned' | 'answered' | 'resolved' | 'closed',
                        assignToMe: boolean,
                      ) => {
                        'use server';
                        return setStatus(selected.id, next, assignToMe);
                      }}
                    />
                  </div>
                </section>

                {/*
                 * What the form asked, and what they answered.
                 *
                 * The body is a sentence for reading; this is the
                 * same thing as fields, so an agent arranging a
                 * table for four does not have to parse a
                 * paragraph to find the time. Rendered from
                 * whatever the form sent, so a form can add a
                 * question without this page changing.
                 */}
                {(() => {
                  /* `details` is Json, so it is narrowed once here
                     rather than cast at each use. */
                  const asked =
                    selected.details &&
                    typeof selected.details === 'object' &&
                    !Array.isArray(selected.details)
                      ? (selected.details as Record<string, unknown>)
                      : null;
                  return asked && Object.keys(asked).length > 0 ? (
                    <aside className="border-border bg-surface mb-4 rounded-2xl border p-5">
                      <h2 className="text-sm font-extrabold uppercase tracking-wide">
                        What they asked for
                      </h2>
                      {selected.source_form ? (
                        <p className="text-muted-light mt-0.5 text-xs font-semibold">
                          from the {selected.source_form.replace(/_/g, ' ')} form
                        </p>
                      ) : null}
                      <dl className="mt-3 space-y-2 text-sm">
                        {Object.entries(asked)
                          .filter(([k, v]) => {
                            if (v === null || v === '' || v === undefined) return false;
                            /* Coordinates are not something a person
                             reads. They are summarised in a sentence
                             below instead. */
                            return (
                              k !== 'lat' &&
                              k !== 'lng' &&
                              k !== 'location_source' &&
                              /* The host record has a link under it; a bare
                                 uuid on its own line is just noise. */
                              k !== 'host_id'
                            );
                          })
                          .map(([key, value]) => (
                            <div key={key} className="flex justify-between gap-3">
                              <dt className="text-muted-light shrink-0 font-semibold">
                                {DETAIL_LABEL[key] ?? key.replace(/_/g, ' ')}
                              </dt>
                              <dd className="text-right font-bold">
                                {DETAIL_VALUE[String(value)] ?? String(value)}
                              </dd>
                            </div>
                          ))}
                      </dl>
                      {typeof asked.lat === 'number' && typeof asked.lng === 'number' ? (
                        <p className="text-muted-light mt-2 text-xs font-semibold">
                          They dropped a pin, so the spot is settled — no need to ask which gate.
                        </p>
                      ) : null}
                      {/*
                       * A host application also made a host record, and
                       * that is where the verification happens. The
                       * ticket is the queue; the record is the work.
                       */}
                      {typeof asked.host_id === 'string' ? (
                        <Link
                          href={`/hotels/hosts/${asked.host_id}/verify`}
                          className="text-ink mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold underline underline-offset-4"
                        >
                          Open the host record
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      ) : null}
                    </aside>
                  ) : null;
                })()}

                <aside className="border-border bg-surface rounded-2xl border p-5">
                  <h2 className="text-sm font-extrabold uppercase tracking-wide">
                    How to reach them
                  </h2>
                  <dl className="mt-3 space-y-2 text-sm">
                    {[
                      ['Email', selected.email],
                      ['Phone', selected.phone],
                      ['They are a', selected.from_role],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className="text-muted-light shrink-0 font-semibold">{label}</dt>
                        <dd className="truncate text-right font-bold">{value || '—'}</dd>
                      </div>
                    ))}
                  </dl>

                  {/*
                   * What the person has actually been told. Shown because a
                   * desk that cannot see a failed acknowledgement will assume
                   * one went out.
                   */}
                  <h2 className="border-border mt-5 border-t pt-4 text-sm font-extrabold uppercase tracking-wide">
                    What they have been told
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {(notices ?? []).length === 0 ? (
                      <li className="text-muted-light text-xs font-semibold">Nothing queued.</li>
                    ) : (
                      (notices ?? []).map((notice, index) => (
                        <li key={index} className="text-xs">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-bold">
                              {notice.kind === 'ticket_received' ? 'Acknowledgement' : 'Resolved'}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide ${
                                notice.status === 'sent'
                                  ? 'bg-success-bg text-success'
                                  : notice.status === 'no_address'
                                    ? 'bg-bg text-muted-light'
                                    : 'bg-danger-bg text-danger'
                              }`}
                            >
                              {notice.status === 'no_address' ? 'no email' : notice.status}
                            </span>
                          </span>
                          {notice.error && (
                            <span className="text-muted-light mt-0.5 block leading-snug">
                              {notice.error}
                            </span>
                          )}
                        </li>
                      ))
                    )}
                  </ul>

                  <p className="text-muted border-border mt-4 border-t pt-3 text-xs font-semibold leading-[1.7]">
                    Replies in the thread are recorded, not delivered — reach them on the contact
                    above. Only the acknowledgement and the resolved notice are emailed.
                  </p>
                </aside>
              </div>
            ) : (
              <p className="text-muted-light text-sm font-semibold">Choose a ticket.</p>
            )}
          </div>
        )}
      </main>
    </ConsoleShell>
  );
}
