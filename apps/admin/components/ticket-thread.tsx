'use client';

import { Button, Input, useToast } from '@nexg/ui';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface ThreadMessage {
  id: string;
  body: string;
  internal: boolean;
  createdAt: string;
  author: string | null;
}

/**
 * The conversation and the reply box, from the Concierge desk artboard.
 *
 * An internal note and a reply are the same control with a different
 * destination, because they are the same action for the person using it —
 * the difference is one switch and it is labelled.
 */
export function TicketThread({
  ticketId,
  opening,
  openedAt,
  from,
  messages,
  onReply,
  onStatus,
  status,
}: {
  ticketId: string;
  opening: string;
  openedAt: string;
  from: string;
  messages: ThreadMessage[];
  status: string;
  onReply: (body: string, internal: boolean) => Promise<{ ok: boolean; message: string }>;
  onStatus: (
    next: 'open' | 'assigned' | 'answered' | 'resolved' | 'closed',
    assignToMe: boolean,
  ) => Promise<{ ok: boolean; message: string }>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [body, setBody] = React.useState('');
  const [internal, setInternal] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const run = async (work: () => Promise<{ ok: boolean; message: string }>, clear = false) => {
    setPending(true);
    const result = await work();
    setPending(false);

    toast({
      title: result.ok ? 'Done' : 'Not done',
      description: result.message,
      tone: result.ok ? 'success' : 'danger',
    });
    if (result.ok) {
      if (clear) setBody('');
      router.refresh();
    }
  };

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex min-h-[28rem] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto">
        <p className="text-muted-light text-center text-[0.6875rem] font-semibold">
          Received via the web form · {time(openedAt)}
        </p>

        <div className="border-border bg-surface max-w-[85%] rounded-2xl rounded-tl-sm border p-4">
          <p className="text-[0.875rem] leading-[1.7]">{opening}</p>
          <p className="text-muted-light mt-2 text-[0.625rem] font-semibold">
            {from} · {time(openedAt)}
          </p>
        </div>

        {messages.map((message) =>
          message.internal ? (
            <div
              key={message.id}
              className="border-gold/30 bg-gold-soft ml-auto max-w-[85%] rounded-2xl border p-4"
            >
              <p className="text-gold-text flex items-center gap-1.5 text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
                <Lock className="h-3 w-3" />
                Internal note · not visible to the guest
              </p>
              <p className="text-ink mt-2 text-[0.875rem] leading-[1.7]">{message.body}</p>
              <p className="text-muted-light mt-2 text-[0.625rem] font-semibold">
                {message.author ?? 'Staff'} · {time(message.createdAt)}
              </p>
            </div>
          ) : (
            <div
              key={message.id}
              className="bg-ink ml-auto max-w-[85%] rounded-2xl rounded-tr-sm p-4 text-white"
            >
              <p className="text-[0.875rem] leading-[1.7]">{message.body}</p>
              <p className="mt-2 text-[0.625rem] font-semibold text-white/45">
                {message.author ?? 'Staff'} · {time(message.createdAt)}
              </p>
            </div>
          ),
        )}
      </div>

      <div className="border-border mt-5 border-t pt-4">
        <Input
          id={`reply_${ticketId}`}
          label={internal ? 'Internal note' : 'Reply to them'}
          hint={
            internal
              ? 'Kept on the ticket for the desk. They never see it.'
              : 'Goes back on the contact they gave us.'
          }
          placeholder={internal ? 'What the next agent needs to know…' : 'Type your reply…'}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            loading={pending}
            onClick={() => run(() => onReply(body, internal), true)}
          >
            {internal ? 'Save note' : 'Send reply'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            aria-pressed={internal}
            onClick={() => setInternal((v) => !v)}
          >
            {internal ? 'Switch to reply' : 'Make it an internal note'}
          </Button>

          <span className="ml-auto flex gap-2">
            {status !== 'resolved' && status !== 'closed' ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => onStatus('assigned', true))}
                >
                  Assign to me
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => onStatus('resolved', false))}
                >
                  Mark resolved
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => onStatus('open', false))}
              >
                Reopen
              </Button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
