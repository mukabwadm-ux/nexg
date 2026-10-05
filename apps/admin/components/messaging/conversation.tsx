'use client';

import * as React from 'react';

import {
  escalate,
  resolveConversation,
  sendMessage,
  takeConversation,
  type Result,
} from '@/app/messaging/actions';
import { CHANNEL_LABEL, InternalMark, TEAM_LABEL, TOPIC_LABEL, clock } from '@/components/messaging/shared';
import { Pill } from '@/components/live/shared';

export interface MessageRow {
  id: string;
  seq: number;
  kind: string;
  visibility: 'external' | 'internal';
  body: string | null;
  created_at: string;
  channel_out: string | null;
  delivery: string;
  author: string | null;
  author_kind: string | null;
  author_role: string | null;
  author_staff_id: string | null;
  redacted_at: string | null;
  redaction_reason: string | null;
}

export interface ConversationHead {
  id: string;
  kind: string;
  subject: string;
  status: string;
  topic: string | null;
  priority: string;
  current_channel: string;
  origin_channel: string;
  owner_team: string;
  escalated_to: string[];
  assignee_id: string | null;
  assignee: string | null;
  with_whom: string | null;
  object_label: string | null;
  city: string | null;
}

const TEAMS = ['dispatch', 'merchant_ops', 'rider_ops', 'finance', 'partnerships', 'hotels_desk'];

/**
 * The middle column: the transcript, and the composer under it.
 *
 * The composer has two modes and they are made to look nothing
 * alike. An internal note is yellow, locked and labelled; a
 * reply to the guest is plain and says how it will be delivered
 * ("Guest is on WhatsApp"). The database refuses a guest-bound
 * message from somebody who may not send one, but refusing late
 * is not the same as making the mistake hard to make: an agent
 * who types a note about a guest into the wrong box has already
 * written the sentence.
 */
export function Conversation({
  head,
  messages,
  isMine,
  canReplyExternal,
  isParticipant,
}: {
  head: ConversationHead;
  messages: MessageRow[];
  isMine: boolean;
  canReplyExternal: boolean;
  /*
   * Being in the conversation at all is a different thing from
   * being allowed to answer the guest, and the composer used to
   * conflate them. A super admin reading an unassigned chat was
   * told "you joined this conversation to help, not to answer
   * the guest" — which is the sentence for an escalated team,
   * and is simply untrue for somebody who has not joined
   * anything. They need to take it.
   */
  isParticipant: boolean;
}) {
  const [mode, setMode] = React.useState<'external' | 'internal'>(
    head.kind === 'external' && canReplyExternal ? 'external' : 'internal',
  );
  /* Somebody who is not in the conversation cannot write to it
     at all — the RPC refuses, and offering a box that throws is
     worse than not offering one. */
  const canWrite = isParticipant;
  /*
   * An internal thread has no outside, so offering "Reply to…"
   * against "Internal note" is a choice between one real option
   * and one that means nothing — and the one that means nothing
   * was selected by default, labelled "Reply to Finance".
   */
  const internalOnly = head.kind !== 'external';
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [flash, setFlash] = React.useState<Result | null>(null);
  const [panel, setPanel] = React.useState<'none' | 'escalate' | 'resolve'>('none');
  const end = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function run(fn: () => Promise<Result>) {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    setFlash(result);
    return result;
  }

  async function send() {
    if (!body.trim()) return;
    const text = body;
    const result = await run(() => sendMessage(head.id, text, mode));
    if (result.ok) setBody('');
  }

  const resolved = head.status === 'resolved' || head.status === 'closed';

  return (
    <section className="border-border bg-surface flex min-h-[32rem] flex-col rounded-xl border">
      {/* ─────────────────────────────────────────────── header */}
      <header className="border-border border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
                {/* A thread is named by what it is about; a guest
                    conversation by who it is with. Using the
                    first non-staff participant for both titled a
                    thread "Finance", which is who is in the room
                    rather than why. */}
                {internalOnly ? head.subject : (head.with_whom ?? head.subject)}
              </h2>
              {head.priority === 'urgent' ? (
                <Pill tone="bg-danger text-white">Urgent</Pill>
              ) : null}
              {head.object_label ? (
                <Pill tone="bg-gold/15 text-gold-ink">{head.object_label}</Pill>
              ) : null}
              {head.origin_channel !== head.current_channel ? (
                <Pill tone="border border-success/40 text-success">
                  {CHANNEL_LABEL[head.origin_channel]} → {CHANNEL_LABEL[head.current_channel]}
                </Pill>
              ) : null}
              {resolved ? <Pill tone="bg-success/15 text-success">Resolved</Pill> : null}
            </div>
            <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
              {[
                head.city,
                head.topic ? TOPIC_LABEL[head.topic] : null,
                head.assignee ? `assigned to ${head.assignee}` : 'unassigned',
                head.escalated_to.length ? `${head.escalated_to.join(', ')} joined` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-1.5">
            {!isMine && !resolved ? (
              <Button onClick={() => void run(() => takeConversation(head.id))} busy={busy} primary>
                Take it
              </Button>
            ) : null}
            {!resolved ? (
              <>
                <Button onClick={() => setPanel(panel === 'escalate' ? 'none' : 'escalate')}>
                  Escalate
                </Button>
                <Button onClick={() => setPanel(panel === 'resolve' ? 'none' : 'resolve')}>
                  Resolve
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {flash ? (
          <p
            className={`mt-2 rounded-lg px-3 py-2 text-[0.75rem] font-semibold ${
              flash.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
            }`}
          >
            {flash.message ?? (flash.ok ? 'Done.' : 'That did not work.')}
          </p>
        ) : null}
      </header>

      {panel === 'escalate' ? (
        <EscalatePanel id={head.id} onDone={(r) => { setFlash(r); setPanel('none'); }} />
      ) : null}
      {panel === 'resolve' ? (
        <ResolvePanel
          id={head.id}
          topic={head.topic}
          onDone={(r) => { setFlash(r); setPanel('none'); }}
        />
      ) : null}

      {/* ──────────────────────────────────────────── transcript */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={end} />
      </div>

      {/* ───────────────────────────────────────────── composer */}
      {resolved ? (
        <div className="border-border text-muted-light border-t px-4 py-4 text-center text-[0.75rem] font-semibold">
          This conversation is resolved. A reply from the guest within 48 hours reopens it here
          rather than starting a new one.
        </div>
      ) : (
        <div
          className={`border-t px-4 py-3 ${
            mode === 'internal' ? 'border-warn/30 bg-warn/[0.06]' : 'border-border'
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {internalOnly ? null : (
              <div className="flex gap-1">
                <ModeButton
                  on={mode === 'external'}
                  disabled={!canReplyExternal}
                  onClick={() => setMode('external')}
                >
                  Reply to {head.with_whom ?? 'them'}
                </ModeButton>
                <ModeButton
                  on={mode === 'internal'}
                  disabled={!canWrite}
                  onClick={() => setMode('internal')}
                >
                  Internal note
                </ModeButton>
              </div>
            )}

            {mode === 'internal' ? (
              <InternalMark>Internal · staff only · kept with the record</InternalMark>
            ) : (
              <span className="text-muted-light text-[0.6875rem] font-semibold">
                Delivered as {CHANNEL_LABEL[head.current_channel]}
              </span>
            )}

            {!canReplyExternal ? (
              <span className="text-muted-light ml-auto text-[0.6875rem] font-semibold">
                {isParticipant
                  ? 'You joined to help — the desk agent answers the guest.'
                  : internalOnly
                    ? 'Take this thread to write in it.'
                    : 'Take it before you can reply, so the guest has one person on it.'}
              </span>
            ) : null}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              disabled={!canWrite}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder={
                !canWrite
                  ? 'Take this conversation to write in it.'
                  : internalOnly
                    ? 'Message the thread…  @mention a team or person'
                    : mode === 'internal'
                      ? 'A note for the team. The guest never sees this.'
                      : `Reply to ${head.with_whom ?? 'them'}…  Enter to send · Shift+Enter for a new line`
              }
              className="border-border focus:border-ink placeholder:text-muted-light bg-surface w-full resize-none rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold outline-none transition-colors disabled:opacity-50"
            />
            <Button onClick={() => void send()} busy={busy || !canWrite} primary>
              Send
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Bubble({ m }: { m: MessageRow }) {
  if (m.kind === 'system') {
    return (
      <p className="text-muted-light bg-bg mx-auto w-fit rounded-full px-3 py-1 text-center text-[0.6875rem] font-semibold">
        {m.body}
      </p>
    );
  }

  if (m.redacted_at) {
    return (
      <p className="border-border text-muted-light mx-auto w-fit rounded-lg border border-dashed px-3 py-1.5 text-[0.6875rem] font-semibold">
        Redacted · {m.redaction_reason} · {clock(m.redacted_at)}
      </p>
    );
  }

  if (m.kind === 'decision') {
    return (
      <div className="border-success/40 bg-success/5 rounded-xl border px-3 py-2.5">
        <p className="text-success text-[0.625rem] font-extrabold uppercase tracking-wide">
          Decision · pinned
        </p>
        <p className="mt-0.5 text-[0.8125rem] font-semibold">{m.body}</p>
        <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
          {m.author} · {clock(m.created_at)}
        </p>
      </div>
    );
  }

  /* Internal notes are a different shape, not a different shade
     of the same shape. Somebody scanning a transcript should not
     have to read carefully to know which lines the guest saw. */
  if (m.visibility === 'internal') {
    return (
      <div className="border-warn/30 bg-warn/[0.08] rounded-xl border px-3 py-2.5">
        <InternalMark>
          Internal · only staff see this · {m.author ?? 'system'}
        </InternalMark>
        <p className="mt-1 text-[0.8125rem] font-semibold">{m.body}</p>
        <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
          {clock(m.created_at)}
        </p>
      </div>
    );
  }

  const fromStaff = m.author_kind === 'staff';
  return (
    <div className={`flex ${fromStaff ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
          fromStaff ? 'bg-ink text-white' : 'border-border bg-bg border'
        }`}
      >
        <p className="text-[0.8125rem] font-semibold">{m.body}</p>
        <p
          className={`mt-1 text-[0.625rem] font-semibold ${
            fromStaff ? 'text-white/60' : 'text-muted-light'
          }`}
        >
          {fromStaff ? `${m.author ?? 'You'} · ${m.author_role ?? 'Concierge'}` : m.author}
          {' · '}
          {clock(m.created_at)}
          {m.channel_out && m.channel_out !== 'web' ? ` · ${CHANNEL_LABEL[m.channel_out]}` : ''}
        </p>
      </div>
    </div>
  );
}

function EscalatePanel({ id, onDone }: { id: string; onDone: (r: Result) => void }) {
  const [team, setTeam] = React.useState('dispatch');
  const [note, setNote] = React.useState('');
  const [handOver, setHandOver] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="border-border bg-bg border-b px-4 py-3">
      <p className="text-[0.8125rem] font-extrabold">Escalate to…</p>
      <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
        This opens an internal thread on the conversation. They see the full context; the guest
        never sees their phone number or their name unless you hand over.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TEAMS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTeam(t)}
            className={`rounded-full px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
              team === t
                ? 'bg-ink text-white'
                : 'border-border-strong bg-surface hover:border-ink border'
            }`}
          >
            {TEAM_LABEL[t] ?? t}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What do they need to know?"
        className="border-border focus:border-ink placeholder:text-muted-light bg-surface mt-2 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
      />
      <label className="mt-2 flex items-start gap-2 text-[0.75rem] font-semibold">
        <input
          type="checkbox"
          checked={handOver}
          onChange={(e) => setHandOver(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Hand the guest over to them as well. Without this you stay the one voice the guest hears
          — which is usually what you want.
        </span>
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void escalate(id, team, null, note, handOver).then((r) => {
            setBusy(false);
            onDone(r);
          });
        }}
        className="bg-ink mt-2 rounded-full px-4 py-2 text-[0.75rem] font-extrabold text-white disabled:opacity-50"
      >
        {busy ? 'Escalating…' : `Escalate to ${TEAM_LABEL[team] ?? team}`}
      </button>
    </div>
  );
}

function ResolvePanel({
  id,
  topic,
  onDone,
}: {
  id: string;
  topic: string | null;
  onDone: (r: Result) => void;
}) {
  const [chosen, setChosen] = React.useState(topic ?? 'my_order');
  const [subtopic, setSubtopic] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="border-border bg-bg border-b px-4 py-3">
      <p className="text-[0.8125rem] font-extrabold">Resolve · what was it about?</p>
      <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
        Two taps. The tag is the only thing that makes a pattern visible later — without it this
        conversation teaches the company nothing.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(TOPIC_LABEL).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setChosen(key)}
            className={`rounded-full px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
              chosen === key
                ? 'bg-ink text-white'
                : 'border-border-strong bg-surface hover:border-ink border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        value={subtopic}
        onChange={(e) => setSubtopic(e.target.value)}
        placeholder="More precisely — e.g. hotel access · security hold"
        className="border-border focus:border-ink placeholder:text-muted-light bg-surface mt-2 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What actually fixed it? (optional)"
        className="border-border focus:border-ink placeholder:text-muted-light bg-surface mt-1.5 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void resolveConversation(id, chosen, subtopic, note).then((r) => {
            setBusy(false);
            onDone(r);
          });
        }}
        className="bg-ink mt-2 rounded-full px-4 py-2 text-[0.75rem] font-extrabold text-white disabled:opacity-50"
      >
        {busy ? 'Resolving…' : 'Resolve'}
      </button>
    </div>
  );
}

function Button({
  children,
  onClick,
  busy,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[0.75rem] font-extrabold transition-colors disabled:opacity-50 ${
        primary
          ? 'bg-ink text-white hover:opacity-90'
          : 'border-border-strong bg-surface hover:border-ink border'
      }`}
    >
      {children}
    </button>
  );
}

function ModeButton({
  children,
  on,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'You joined this conversation to help, not to answer the guest.' : undefined}
      className={`rounded-full px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? 'bg-ink text-white' : 'border-border-strong bg-surface hover:border-ink border'
      }`}
    >
      {children}
    </button>
  );
}
