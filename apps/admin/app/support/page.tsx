import { EmptyState, StatusBadge } from '@nexg/ui';
import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { reply, setStatus } from '@/app/support/actions';
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
      'id, reference, from_role, topic, full_name, email, phone, order_reference, body, status, assigned_to, first_reply_at, created_at',
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

  return (
    <ConsoleShell staff={staff} current="/support">
      <ConsoleHeader
        title="Support & tickets"
        breadcrumb="Operate → Support & tickets · everything logged from the Help page"
        action={
          <span className="text-muted text-xs font-semibold">
            {waiting} waiting · {all.length} in total
          </span>
        }
      />

      <main className="px-4 py-5 sm:px-8">
        <div className="flex flex-wrap gap-2">
          {QUEUES.map((option) => {
            const count = all.filter((t) =>
              (option.statuses as readonly string[]).includes(t.status),
            ).length;
            const active = option.key === queueKey;
            return (
              <Link
                key={option.key}
                href={href({ queue: option.key })}
                className={`rounded-full border px-4 py-2 text-[0.8125rem] font-bold transition-colors ${
                  active
                    ? 'border-ink bg-ink text-white'
                    : 'border-border-strong bg-surface text-ink hover:border-ink'
                }`}
              >
                {option.label}
                {count > 0 && (
                  <span className={active ? 'ml-2 text-white/60' : 'text-muted-light ml-2'}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

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
