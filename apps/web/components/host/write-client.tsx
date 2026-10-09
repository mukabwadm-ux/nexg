'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { replyToConversation, startConversation } from '@/app/host/actions';

import { Actions, Area, Drawer, Field, Said, Select, Submit, Text, useAction } from './form';

/**
 * Writing to NexG.
 *
 * "Write to us" used to be a link to a contact form that did
 * not exist at that path, so the one button somebody presses
 * when something is wrong gave them a 404. It is a composer
 * now, and what it opens is a real conversation: the reply
 * lands in Messages and the thread continues there.
 *
 * Who it reaches is chosen by topic rather than by naming a
 * team, because a host knows what their problem is about and
 * does not know how we are organised. The routing rules turn
 * the topic into a desk.
 */
export const DESKS: {
  value: string;
  label: string;
  note: string;
}[] = [
  {
    value: 'hotel_or_airbnb',
    label: 'Host ops — my account, units or cards',
    note: 'The desk that handles properties, QR cards, hand-off rules and packages.',
  },
  {
    value: 'my_order',
    label: 'Concierge — a guest, an order or a delivery',
    note: 'The desk that talks to guests and riders. Use this when somebody is waiting.',
  },
  {
    value: 'payment',
    label: 'Money — an invoice, a reward or a statement',
    note: 'Billing questions and anything on your statement that looks wrong.',
  },
  {
    value: 'partnership',
    label: 'Partnerships — commercial, or something bigger',
    note: 'More properties, a hotel, or a conversation about how we work together.',
  },
  {
    value: 'something_else',
    label: 'Something else',
    note: 'If none of the above fits. We will route it from here.',
  },
];

/**
 * The composer.
 *
 * `variant` only changes how the trigger looks — the drawer is
 * the same everywhere, because a host who learns it on Support
 * should not meet a different one in Messages.
 */
export function WriteToUs({
  hostId,
  variant = 'quiet',
  label = 'Write to us',
  presetTopic,
}: {
  hostId: string;
  variant?: 'dark' | 'light' | 'quiet';
  label?: string;
  presetTopic?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [topic, setTopic] = React.useState(presetTopic ?? 'hotel_or_airbnb');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [sentId, setSentId] = React.useState<string | null>(null);
  const { pending, outcome, run } = useAction();
  const router = useRouter();

  const desk = DESKS.find((d) => d.value === topic);

  const cls =
    variant === 'dark'
      ? 'rounded-lg bg-white px-4 py-3 text-center text-[0.8125rem] font-extrabold text-black'
      : variant === 'light'
        ? 'rounded-lg bg-white/10 px-4 py-3 text-center text-[0.8125rem] font-extrabold text-white'
        : 'border-border-strong rounded-lg border px-4 py-2.5 text-[0.8125rem] font-extrabold';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cls}>
        {label}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Write to us"
        lead="This opens a conversation, not a form. The reply arrives in Messages and you carry on from there."
      >
        {sentId ? (
          <div className="space-y-4">
            <p className="bg-success/10 text-success rounded-lg px-3 py-2.5 text-[0.8125rem] font-semibold leading-[1.65]">
              Sent to {desk?.label.split(' — ')[0] ?? 'us'}. You will see the reply in Messages
              and we will notify you.
            </p>
            <Actions>
              <Submit
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/host/messages/${sentId}`);
                }}
              >
                Open the thread
              </Submit>
              <Submit
                type="button"
                tone="quiet"
                onClick={() => {
                  setSentId(null);
                  setSubject('');
                  setBody('');
                }}
              >
                Write another
              </Submit>
            </Actions>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Who it is for">
              <Select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                options={DESKS.map((d) => ({ value: d.value, label: d.label }))}
              />
            </Field>
            {desk ? (
              <p className="text-muted-light -mt-2 text-[0.6875rem] font-semibold leading-[1.5]">
                {desk.note}
              </p>
            ) : null}

            <Field
              label="Subject"
              hint="One line. It is what the desk sees in the queue, and a thread with none waits behind the ones that have one."
            >
              <Text
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Lift out of service in Block A"
              />
            </Field>

            <Field label="Message">
              <Area
                rows={7}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Engineer booked for Thursday. Guests on floors 8 and above will need the service lift until then."
              />
            </Field>

            <Said outcome={outcome} />

            <Actions>
              <Submit
                type="button"
                pending={pending}
                onClick={() =>
                  run(
                    () => startConversation({ hostId, topic, subject, body }),
                    (o) => {
                      const id = o.data?.conversation_id;
                      if (o.ok && typeof id === 'string') setSentId(id);
                    },
                  )
                }
              >
                Send
              </Submit>
              <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
                Cancel
              </Submit>
            </Actions>

            <p className="text-muted-light text-[0.6875rem] font-semibold leading-[1.6]">
              Notes the desk writes to each other are invisible to you — not filtered by this
              page, invisible at the database. You see what is said to you.
            </p>
          </div>
        )}
      </Drawer>
    </>
  );
}

/* ══════════════════════════════════════════════ the composer */

/**
 * Replying inside a thread.
 *
 * Clears on success and leaves the page to refresh itself. An
 * optimistic line would have to be reconciled with the one the
 * server returns, and getting that wrong shows a host their own
 * message twice.
 */
export function Reply({ conversationId }: { conversationId: string }) {
  const [body, setBody] = React.useState('');
  const { pending, outcome, run } = useAction();

  return (
    <div className="border-border bg-surface border-t p-4">
      <Area
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        onKeyDown={(e) => {
          /* Ctrl/Cmd+Enter sends. Enter alone does not — these
             are paragraphs about a building, not chat lines. */
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && body.trim() !== '') {
            run(
              () => replyToConversation(conversationId, body),
              (o) => {
                if (o.ok) setBody('');
              },
            );
          }
        }}
      />
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <Submit
          type="button"
          pending={pending}
          onClick={() =>
            run(
              () => replyToConversation(conversationId, body),
              (o) => {
                if (o.ok) setBody('');
              },
            )
          }
        >
          Send
        </Submit>
        <span className="text-muted-light text-[0.6875rem] font-semibold">
          Ctrl + Enter sends
        </span>
      </div>
      {outcome && !outcome.ok ? (
        <p className="bg-danger/10 text-danger mt-2.5 rounded-lg px-3 py-2 text-[0.75rem] font-semibold">
          {outcome.message}
        </p>
      ) : null}
    </div>
  );
}

/** Marks a thread read once it has been opened. */
export function MarkRead({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const done = React.useRef(false);

  React.useEffect(() => {
    if (done.current) return;
    done.current = true;
    /*
     * On open, not on a button. A badge that only clears when
     * somebody presses something is a badge people learn to
     * ignore.
     */
    void import('@/app/host/actions').then(({ markConversationRead }) =>
      markConversationRead(conversationId).then(() => router.refresh()),
    );
  }, [conversationId, router]);

  return null;
}
