'use client';

import * as React from 'react';

import {
  joinStayChat,
  leaveStayChat,
  readStayChat,
  sendStayChat,
  type StayChatResult,
} from '@/app/messaging/stays/actions';
import { clock } from '@/components/messaging/shared';

export interface StayChatMessage {
  id: string;
  seq: number;
  body: string | null;
  redacted: boolean;
  at: string;
  side: 'guest' | 'host' | 'nexg' | 'system';
  mine: boolean;
  author: string | null;
  staff_name?: string | null;
}

export interface StayChatThread {
  id: string;
  stay_id: string;
  property_name: string | null;
  unit_name: string | null;
  host_name: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  stay_status: string;
  can_send: boolean;
  me_present?: boolean;
  nexg: {
    present: boolean;
    requested_at: string | null;
    requested_side: string | null;
    waiting: boolean;
  };
}

const SIDE_LABEL = { guest: 'Guest', host: 'Host', nexg: 'NexG' } as const;

/**
 * One stay chat from NexG's side. The guest and the host read everything written here, and see it as "NexG";
 * there is no internal note in a stay chat, so the composer has no internal mode.
 */
export function StayChat({
  thread,
  messages,
}: {
  thread: StayChatThread;
  messages: StayChatMessage[];
}) {
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<StayChatResult | null>(null);
  const pending = React.useRef<{ body: string; key: string } | null>(null);
  const joined = thread.me_present === true;

  React.useEffect(() => {
    if (joined) void readStayChat(thread.id);
  }, [joined, thread.id, messages.length]);

  async function act(run: () => Promise<StayChatResult>) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await run();
      setNote(result);
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const draft = body.trim();
    if (!draft) return;
    if (pending.current?.body !== draft)
      pending.current = { body: draft, key: crypto.randomUUID() };
    const key = pending.current.key;
    const result = await act(() => sendStayChat(thread.id, draft, key));
    if (result?.ok) {
      setBody('');
      pending.current = null;
      setNote(null);
    }
  }

  const place = [thread.unit_name, thread.property_name].filter(Boolean).join(' · ');

  return (
    <section className="border-border bg-surface flex min-h-[32rem] flex-col overflow-hidden rounded-xl border">
      <header className="border-border flex flex-wrap items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[0.9375rem] font-extrabold">
            {thread.guest_name} and {thread.host_name}
          </h2>
          <p className="text-muted text-[0.75rem] font-semibold">
            {place || 'Stay'} · {thread.check_in.slice(0, 10)} to {thread.check_out.slice(0, 10)} ·{' '}
            {thread.stay_status}
          </p>
          {thread.nexg.waiting ? (
            <p className="text-danger mt-1 text-[0.75rem] font-extrabold">
              The {thread.nexg.requested_side === 'host' ? 'host' : 'guest'} asked NexG to help{' '}
              {thread.nexg.requested_at ? clock(thread.nexg.requested_at) : ''}. Nobody from NexG
              has replied yet.
            </p>
          ) : null}
        </div>
        {joined ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => leaveStayChat(thread.id))}
            className="border-border-strong hover:border-ink rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-50"
          >
            Leave chat
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => joinStayChat(thread.id))}
            className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-50"
          >
            Join as NexG
          </button>
        )}
      </header>

      <ol className="flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-label="Messages">
        {messages.length === 0 ? (
          <li className="text-muted-light py-10 text-center text-[0.8125rem] font-semibold">
            No messages yet.
          </li>
        ) : null}
        {messages.map((m) =>
          m.side === 'system' ? (
            <li
              key={m.id}
              className="text-muted-light bg-bg mx-auto w-fit rounded-full px-3 py-1 text-center text-[0.6875rem] font-semibold"
            >
              {m.body} · {clock(m.at)}
            </li>
          ) : (
            <li
              key={m.id}
              className={`max-w-[80%] rounded-xl px-3 py-2 text-[0.8125rem] font-semibold ${
                m.side === 'nexg'
                  ? 'bg-ink ml-auto text-white'
                  : m.side === 'host'
                    ? 'bg-bg ml-auto'
                    : 'border-border border'
              }`}
            >
              <p className="text-[0.6875rem] font-extrabold opacity-80">
                {SIDE_LABEL[m.side]}
                {m.side === 'nexg' && m.staff_name ? ` · ${m.staff_name}` : ''}
                {m.side !== 'nexg' && m.author ? ` · ${m.author}` : ''} · {clock(m.at)}
              </p>
              <p className="whitespace-pre-wrap">{m.redacted ? 'Removed' : m.body}</p>
            </li>
          ),
        )}
      </ol>

      <div className="border-border space-y-2 border-t px-4 py-3">
        <p className="text-muted-light text-[0.6875rem] font-semibold">
          {joined
            ? 'The guest and the host both read what you write here. It shows as from NexG.'
            : 'Join to write. The guest and the host will see that NexG joined.'}
          {!thread.can_send
            ? ' The chat is closed to the guest and host, but NexG can still reply.'
            : ''}
        </p>
        {note && !note.ok ? (
          <p role="alert" className="text-danger text-[0.75rem] font-extrabold">
            {note.message ?? 'That could not be saved. Try again.'}
          </p>
        ) : note?.message ? (
          <p role="status" className="text-muted text-[0.75rem] font-semibold">
            {note.message}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="stay-chat-reply">
            Message to the guest and the host
          </label>
          <textarea
            id="stay-chat-reply"
            disabled={!joined || busy}
            value={body}
            maxLength={4000}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={joined ? 'Write to the guest and the host…' : 'Join as NexG to write.'}
            className="border-border focus:border-ink placeholder:text-muted-light bg-surface w-full resize-none rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold outline-none transition-colors disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!joined || busy || !body.trim()}
            onClick={() => void send()}
            className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
