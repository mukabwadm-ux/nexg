import { Bell, Headphones } from 'lucide-react';
import Link from 'next/link';

import { ago } from '@/components/partner/bits';
import { ReplyBox } from '@/components/rider/reply-box';
import { Nothing, PageHead, RiderPage, panel, ring } from '@/components/rider/ui';
import { requireRider } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import { markMessagesRead } from '../actions';

export const metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

const THREADS = {
  ops: {
    name: 'Rider Ops',
    blurb: 'People at NexG. Reply here.',
    icon: <Headphones className="h-5 w-5" />,
  },
  system: {
    name: 'System Notifications',
    blurb: 'Automatic notices about your account.',
    icon: <Bell className="h-5 w-5" />,
  },
} as const;
type ThreadKey = keyof typeof THREADS;

/**
 * Messages, as two threads: automatic notices from the system, and the
 * conversation with rider ops (anything a person at NexG sent, and the
 * rider's own replies). The open thread lives in the URL. Guests never
 * message riders directly.
 */
export default async function RiderMessages({
  searchParams,
}: {
  searchParams: { thread?: string };
}) {
  const me = await requireRider();
  const supabase = createClient();

  const { data, error } = await supabase
    .from('rider_message')
    .select('id, direction, channel, subject, body, created_at, read_at, actor_id')
    .eq('rider_id', me.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (data as Row[] | null) ?? [];
  const unread = rows.filter((r) => r.direction === 'out' && !r.read_at);
  if (unread.length > 0) await markMessagesRead(me.id);

  const threadOf = (r: Row): ThreadKey => (r.direction === 'in' || r.actor_id ? 'ops' : 'system');
  const byThread: Record<ThreadKey, Row[]> = { ops: [], system: [] };
  for (const r of rows) byThread[threadOf(r)].push(r);

  const order = (Object.keys(THREADS) as ThreadKey[]).sort((a, b) =>
    (byThread[b][0]?.created_at ?? '').localeCompare(byThread[a][0]?.created_at ?? ''),
  );
  const asked = searchParams.thread;
  const open: ThreadKey = asked === 'ops' || asked === 'system' ? asked : (order[0] ?? 'ops');
  const thread = [...byThread[open]].reverse();

  return (
    <RiderPage>
      <PageHead title="Messages" lead="Stay connected with NEXGAPP" />
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700"
        >
          Your messages could not be read: {error.message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <nav aria-label="Conversations" className={`${panel} !p-2`}>
          <ul className="space-y-1">
            {order.map((key) => {
              const last = byThread[key][0];
              const fresh = unread.filter((r) => threadOf(r) === key).length;
              const on = key === open;
              return (
                <li key={key}>
                  <Link
                    href={`/rider/messages?thread=${key}`}
                    prefetch={false}
                    scroll={false}
                    aria-current={on ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-2xl p-3 ${ring} ${
                      on ? 'bg-[#fff6cf]' : 'hover:bg-[#f6f7fb]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
                    >
                      {THREADS[key].icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-extrabold text-[color:var(--rider-ink)]">
                        {THREADS[key].name}
                      </span>
                      <span className="block truncate text-[13px] font-medium text-slate-600">
                        {last ? (last.subject ?? last.body) : THREADS[key].blurb}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {last ? (
                        <span className="text-[12px] font-semibold text-slate-500">
                          {ago(last.created_at)}
                        </span>
                      ) : null}
                      {fresh > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-extrabold text-white">
                          {fresh}
                          <span className="sr-only"> new</span>
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className={panel} aria-labelledby="thread-title">
          <div className="mb-4 flex items-center gap-3 border-b border-[#eef0f6] pb-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fdd128] text-[color:var(--rider-ink)]"
            >
              {THREADS[open].icon}
            </span>
            <div>
              <h2 id="thread-title" className="text-[17px] font-extrabold">
                {THREADS[open].name}
              </h2>
              <p className="text-[13px] font-medium text-slate-500">{THREADS[open].blurb}</p>
            </div>
          </div>

          {thread.length === 0 ? (
            <Nothing
              title="Nothing here yet."
              body={
                open === 'ops'
                  ? 'Write to rider ops below. They answer here.'
                  : 'Notices about your account land here, and stay.'
              }
            />
          ) : (
            <ol className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
              {thread.map((m) => {
                const mine = m.direction === 'in';
                return (
                  <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        mine
                          ? 'rounded-br-md bg-[#141a2a] text-white'
                          : 'rounded-bl-md bg-[#f3f5fa]'
                      }`}
                    >
                      {m.subject ? <p className="text-[14px] font-extrabold">{m.subject}</p> : null}
                      <p className="whitespace-pre-line text-[14px] font-medium">{m.body}</p>
                      <p
                        className={`mt-1 text-[11.5px] font-semibold ${mine ? 'text-white/60' : 'text-slate-500'}`}
                      >
                        {mine ? 'You' : 'NexG'} · {ago(m.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {open === 'ops' ? (
            <ReplyBox />
          ) : (
            <p className="mt-4 text-[12.5px] font-semibold text-slate-500">
              Notices cannot be answered. To reach a person,{' '}
              <Link href="/rider/messages?thread=ops" className="font-extrabold underline">
                write to rider ops
              </Link>
              . In an emergency use SOS.
            </p>
          )}
        </section>
      </div>
    </RiderPage>
  );
}

interface Row {
  id: string;
  direction: string;
  channel: string;
  subject: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
  actor_id: string | null;
}
