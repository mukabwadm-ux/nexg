import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { Pill } from '@/components/live/shared';
import {
  Conversation,
  type ConversationHead,
  type MessageRow,
} from '@/components/messaging/conversation';
import {
  CHANNEL_LABEL,
  Empty,
  TOPIC_LABEL,
  Tile,
  ago,
  fmtSeconds,
  sla,
} from '@/components/messaging/shared';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Messaging' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'inbox', label: 'Inbox', built: true },
  { key: 'internal', label: 'Internal', built: true },
  { key: 'channels', label: 'Channels', built: false },
  { key: 'insights', label: 'Insights', built: false },
  { key: 'canned', label: 'Canned replies', built: false },
  { key: 'settings', label: 'Settings', built: false },
] as const;

const CHIPS = [
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'active', label: 'Active orders' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'all', label: 'All' },
] as const;

interface InboxRow {
  id: string;
  kind: string;
  status: string;
  topic: string | null;
  subject: string;
  priority: string;
  city: string | null;
  origin_channel: string;
  current_channel: string;
  assignee_id: string | null;
  assignee: string | null;
  owner_team: string;
  escalated_to: string[];
  last_message_at: string | null;
  first_responded_at: string | null;
  object_label: string | null;
  object_type: string | null;
  with_whom: string | null;
  snippet: string | null;
  internal_notes: number;
  overdue_s: number | null;
  unassigned: boolean;
}

/**
 * Operate → Messaging.
 *
 * One queue, sorted by who has been waiting longest on the
 * thing that matters most, and one conversation view that shows
 * internal and external side by side for staff while the
 * database guarantees the guest's copy has neither.
 *
 * Four of the six tabs are not built. They are greyed rather
 * than linked, for the reason this console learned the hard
 * way: a rail entry pointing at a route that does not exist is
 * a 404 somebody finds before you do.
 */
export default async function MessagingPage({
  searchParams,
}: {
  searchParams?: { tab?: string; chip?: string; id?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'messaging');
  const supabase = createClient();

  const requested = searchParams?.tab;
  const tab = TABS.find((t) => t.key === requested && t.built)?.key ?? 'inbox';
  const chip = CHIPS.some((c) => c.key === searchParams?.chip) ? searchParams!.chip! : 'all';

  const [{ data: badges }, { data: desk }] = await Promise.all([
    supabase.from('msg_badges_v').select('*').maybeSingle(),
    supabase.from('msg_desk_status_v').select('*').maybeSingle(),
  ]);

  /*
   * The queue and the thread list are the same view with a
   * different `kind`. An escalation is the same conversation
   * with different people in it, so it would be odd if the two
   * tabs disagreed about what a conversation is.
   */
  let query = supabase
    .from('msg_inbox_v')
    .select('*')
    .eq('kind', tab === 'inbox' ? 'external' : 'internal_thread')
    .order('priority')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(40);

  if (tab === 'inbox') {
    if (chip === 'mine') query = query.eq('assignee_id', staff.staffId);
    if (chip === 'unassigned') query = query.is('assignee_id', null);
    if (chip === 'active') query = query.eq('object_type', 'order');
    if (chip === 'waiting') query = query.in('status', ['open', 'waiting_on_us', 'escalated']);
  }

  const { data: rows } = await query;
  const list = (rows as InboxRow[] | null) ?? [];
  const selected = list.find((r) => r.id === searchParams?.id) ?? list[0];

  let head: ConversationHead | null = null;
  let messages: MessageRow[] = [];
  let canReplyExternal = false;
  let isParticipant = false;

  if (selected) {
    const [convRes, msgRes, partRes] = await Promise.all([
      supabase.from('msg_inbox_v').select('*').eq('id', selected.id).maybeSingle(),
      supabase
        .from('msg_message_v')
        .select('*')
        .eq('conversation_id', selected.id)
        .order('seq')
        .limit(200),
      supabase
        .from('msg_participant')
        .select('can_reply_external')
        .eq('conversation_id', selected.id)
        .eq('staff_user_id', staff.staffId)
        .maybeSingle(),
    ]);
    head = convRes.data as ConversationHead | null;
    messages = (msgRes.data as MessageRow[] | null) ?? [];
    const me = partRes.data as { can_reply_external: boolean } | null;
    isParticipant = me !== null;
    canReplyExternal = me?.can_reply_external ?? false;
  }

  const base = `/messaging?tab=${tab}`;

  return (
    <ConsoleShell staff={staff} current="messaging">
      <ConsoleHeader
        title={tab === 'inbox' ? 'Messaging' : 'Internal threads'}
        breadcrumb={
          tab === 'inbox'
            ? 'Live chat from the website, apps and WhatsApp · staffed by the Concierge desk · escalate to anyone who knows'
            : 'Staff to staff · threads attached to orders, merchants, riders, refunds · decisions stay with the record'
        }
      />

      <div className="border-border bg-surface flex flex-wrap gap-2 border-b px-4 py-3 sm:px-8">
        {TABS.map((t) =>
          t.built ? (
            <Link
              key={t.key}
              href={`/messaging?tab=${t.key}`}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-extrabold transition-colors ${
                t.key === tab
                  ? 'bg-ink text-white'
                  : 'border-border-strong bg-surface text-ink hover:border-ink border'
              }`}
            >
              {t.label}
            </Link>
          ) : (
            <span
              key={t.key}
              title="Designed, not built yet"
              className="border-border text-muted-light cursor-not-allowed rounded-full border border-dashed px-4 py-2 text-[0.8125rem] font-extrabold"
            >
              {t.label}
            </span>
          ),
        )}
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-8">
        {tab === 'inbox' ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Open now"
              value={String(badges?.open_now ?? 0)}
              note={`${badges?.unassigned ?? 0} unassigned`}
            />
            <Tile
              label="Past their first reply"
              value={String(badges?.overdue ?? 0)}
              note="nobody has answered yet"
              tone={(badges?.overdue ?? 0) > 0 ? 'warn' : 'plain'}
            />
            <Tile
              label="First reply · last 30 min"
              value={desk?.median_first_reply_s ? fmtSeconds(desk.median_first_reply_s) : '[—]'}
              note="median · target 60 s"
            />
            <Tile
              label="Desk online"
              value={String(desk?.online ?? 0)}
              note={`${desk?.capacity_left ?? 0} chats of room left`}
              tone={(desk?.online ?? 0) === 0 ? 'warn' : 'good'}
            />
          </div>
        ) : null}

        {tab === 'inbox' ? (
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <Link
                key={c.key}
                href={`${base}&chip=${c.key}`}
                className={`rounded-full px-3.5 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
                  c.key === chip
                    ? 'bg-ink text-white'
                    : 'border-border-strong bg-surface hover:border-ink border'
                }`}
              >
                {c.label}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          {/* ───────────────────────────────────── the queue */}
          <div className="border-border bg-surface overflow-hidden rounded-xl border">
            {list.length === 0 ? (
              <Empty>
                {tab === 'inbox'
                  ? 'Nothing waiting. Not a loading state — the queue is genuinely empty.'
                  : 'No internal threads. One opens when somebody escalates a conversation.'}
              </Empty>
            ) : (
              <ul>
                {list.map((r) => {
                  const s = sla(r.overdue_s, r.first_responded_at !== null);
                  const on = selected?.id === r.id;
                  return (
                    <li key={r.id}>
                      <Link
                        href={`${base}&chip=${chip}&id=${r.id}`}
                        className={`border-border block border-b px-3.5 py-3 transition-colors last:border-0 ${
                          on ? 'bg-bg border-l-ink border-l-[3px]' : 'hover:bg-bg'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-extrabold">
                            {/* Same rule as the header: a thread is
                                named by what it is about, a guest
                                conversation by who it is with. */}
                            {r.kind === 'external' ? (r.with_whom ?? r.subject) : r.subject}
                          </span>
                          <span className="text-muted-light shrink-0 text-[0.625rem] font-semibold">
                            {ago(r.last_message_at)}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {r.topic ? (
                            <Pill tone="bg-bg text-muted">{TOPIC_LABEL[r.topic]}</Pill>
                          ) : null}
                          {r.object_label ? (
                            <span className="text-gold text-[0.625rem] font-extrabold">
                              {r.object_label}
                            </span>
                          ) : null}
                          {r.internal_notes > 0 ? (
                            <span className="text-warn text-[0.625rem] font-extrabold">
                              {r.internal_notes} note{r.internal_notes === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </div>

                        {r.snippet ? (
                          <p className="text-muted mt-1 line-clamp-2 text-[0.75rem] font-semibold">
                            {r.snippet}
                          </p>
                        ) : null}

                        <p className="text-muted-light mt-1 text-[0.625rem] font-semibold">
                          {[
                            s.text,
                            CHANNEL_LABEL[r.current_channel],
                            r.assignee ?? 'unassigned',
                            r.escalated_to.length ? r.escalated_to.join(', ') : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-muted-light border-border border-t px-3.5 py-2.5 text-[0.625rem] font-semibold">
              {tab === 'inbox'
                ? 'Sorted by urgency, then by who has waited longest. A conversation stops being an SLA problem once it has had its first reply, even while it stays open.'
                : 'A thread keeps the decision and the links with the record it is about.'}
            </p>
          </div>

          {/* ─────────────────────────────── the conversation */}
          {head ? (
            <Conversation
              head={head}
              messages={messages}
              isMine={head.assignee_id === staff.staffId}
              canReplyExternal={canReplyExternal}
              isParticipant={isParticipant}
            />
          ) : (
            <div className="border-border bg-surface rounded-xl border">
              <Empty>Pick a conversation on the left.</Empty>
            </div>
          )}
        </div>

        {tab === 'internal' ? (
          <p className="text-muted-light text-[0.6875rem] font-semibold">
            Teams, direct messages and group chats are designed and not built. What exists is the
            part that carries consequences: a thread attached to a record, visible to the staff in
            it and to nobody outside, kept with that record afterwards.
          </p>
        ) : null}
      </div>
    </ConsoleShell>
  );
}
