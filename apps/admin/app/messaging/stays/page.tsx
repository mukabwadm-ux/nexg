import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { Empty, Tile, ago } from '@/components/messaging/shared';
import {
  StayChat,
  type StayChatMessage,
  type StayChatThread,
} from '@/components/messaging/stay-chat';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Stay chats' };
export const dynamic = 'force-dynamic';

/* The filters the database knows (rpc_stay_chat_staff_threads). */
const CHIPS = [
  { key: 'needs', label: 'Needs NexG' },
  { key: 'unanswered', label: 'Waiting on the host' },
  { key: 'joined', label: 'NexG is in' },
  { key: 'all', label: 'All' },
] as const;
type Chip = (typeof CHIPS)[number]['key'];

interface ListRow extends StayChatThread {
  city: string | null;
  unread: number;
  last_message_at: string | null;
  last_message: { body: string | null; side: string } | null;
}

interface ThreadsResult {
  threads: ListRow[];
  counts: Record<Chip, number>;
}

/**
 * Operate → Messaging → Stay chats.
 *
 * The private chats between a stay's guest and its host (20270312000110), which the Concierge queue never lists.
 * The Concierge desk and hospitality operations can read them here, join as NexG, and write; the guest and the host
 * see that NexG joined and read everything NexG writes. Every opening, join, message and leave is audited in the
 * database. Who may see a chat is decided there too: anyone else reaching this page gets nothing.
 */
export default async function StayChatsPage({
  searchParams,
}: {
  searchParams?: { chip?: string; id?: string };
}) {
  const staff = await requireStaff();
  if (!staff.modules.some((m) => m.key === 'messaging' || m.key === 'hotels')) {
    redirect('/?denied=messaging');
  }
  const supabase = createClient();
  const chip: Chip = CHIPS.some((c) => c.key === searchParams?.chip)
    ? (searchParams!.chip as Chip)
    : 'needs';

  const { data, error } = await supabase.rpc('rpc_stay_chat_staff_threads', {
    p_filter: chip,
    p_limit: 60,
  });
  const refused = error?.code === '42501';
  const result = (data as unknown as ThreadsResult | null) ?? null;
  const list = result?.threads ?? [];
  const counts = result?.counts;
  const selectedId =
    list.find((t) => t.id === searchParams?.id)?.id ?? searchParams?.id ?? list[0]?.id;

  let thread: StayChatThread | null = null;
  let messages: StayChatMessage[] = [];
  if (selectedId && !refused) {
    const opened = await supabase.rpc('rpc_stay_chat_staff_messages', {
      p_thread_id: selectedId,
      p_limit: 100,
    });
    const body = opened.data as unknown as {
      thread: StayChatThread;
      messages: StayChatMessage[];
    } | null;
    if (!opened.error && body?.thread) {
      thread = body.thread;
      messages = body.messages ?? [];
    }
  }

  return (
    <ConsoleShell staff={staff} current="messaging">
      <ConsoleHeader
        title="Stay chats"
        breadcrumb="Guests and hosts writing to each other about a stay · join as NexG when either asks, or when a chat needs it"
      />

      <div className="space-y-5 px-4 py-5 sm:px-8">
        <p className="text-[0.8125rem] font-semibold">
          <Link href="/messaging" className="underline">
            Back to the Messaging desk
          </Link>
        </p>

        {refused ? (
          <Empty>
            Stay chats are private between a guest and a host. Only the Concierge desk and
            hospitality operations can open them.
          </Empty>
        ) : error ? (
          <Empty>Stay chats could not be loaded. Refresh to try again.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile
                label="Asked for NexG"
                value={String(counts?.needs ?? 0)}
                note="no NexG reply yet"
                tone={(counts?.needs ?? 0) > 0 ? 'warn' : 'plain'}
              />
              <Tile
                label="Waiting on the host"
                value={String(counts?.unanswered ?? 0)}
                note="the guest wrote last"
              />
              <Tile label="NexG is in" value={String(counts?.joined ?? 0)} note="joined now" />
              <Tile label="All stay chats" value={String(counts?.all ?? 0)} />
            </div>

            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <Link
                  key={c.key}
                  href={`/messaging/stays?chip=${c.key}`}
                  aria-current={c.key === chip ? 'page' : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
                    c.key === chip
                      ? 'bg-ink text-white'
                      : 'border-border-strong bg-surface hover:border-ink border'
                  }`}
                >
                  {c.label} · {counts?.[c.key] ?? 0}
                </Link>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
              <div className="border-border bg-surface overflow-hidden rounded-xl border">
                {list.length === 0 ? (
                  <Empty>
                    {chip === 'needs'
                      ? 'Nobody is waiting for NexG.'
                      : chip === 'unanswered'
                        ? 'No guest is waiting on a host.'
                        : chip === 'joined'
                          ? 'NexG is not in any stay chat.'
                          : 'No stay chats yet.'}
                  </Empty>
                ) : (
                  <ul>
                    {list.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/messaging/stays?chip=${chip}&id=${t.id}`}
                          aria-current={t.id === selectedId ? 'true' : undefined}
                          className={`border-border block border-b px-4 py-3 ${
                            t.id === selectedId ? 'bg-bg' : 'hover:bg-bg'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-extrabold">
                              {t.guest_name} · {t.host_name}
                            </span>
                            <span className="text-muted-light text-[0.6875rem] font-semibold">
                              {ago(t.last_message_at)}
                            </span>
                          </span>
                          <span className="text-muted block truncate text-[0.75rem] font-semibold">
                            {t.last_message?.body ?? 'No messages yet'}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1.5 text-[0.625rem] font-extrabold uppercase tracking-wide">
                            {t.nexg.waiting ? (
                              <span className="text-danger">Asked for NexG</span>
                            ) : null}
                            {t.nexg.present ? <span>NexG is in</span> : null}
                            {t.unread > 0 ? <span>{t.unread} unread</span> : null}
                            {t.city ? <span className="text-muted-light">{t.city}</span> : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {thread ? (
                <StayChat key={thread.id} thread={thread} messages={messages} />
              ) : (
                <Empty>Choose a chat to read it.</Empty>
              )}
            </div>
          </>
        )}
      </div>
    </ConsoleShell>
  );
}
