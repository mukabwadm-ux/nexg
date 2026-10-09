import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DASH, clock, when } from '@/components/host/bits';
import { Fact, HowItWorks, Pill, TwoColumn } from '@/components/host/module';
import { HostSection, hostContext } from '@/components/host/section';
import { MarkRead, Reply } from '@/components/host/write-client';

export const metadata = { title: 'Thread' };
export const dynamic = 'force-dynamic';

interface Conversation {
  id: string;
  subject: string | null;
  topic: string | null;
  status: string;
  created_at: string;
  last_message_at: string | null;
  first_responded_at: string | null;
  resolved_at: string | null;
  about: string | null;
  unread: number;
}

interface Message {
  id: string;
  seq: number;
  body: string | null;
  channel: string | null;
  created_at: string;
  redacted: boolean;
  author: string | null;
  author_kind: string | null;
  mine: boolean;
}

/**
 * One thread.
 *
 * Only external messages reach here, and that is enforced at
 * the policy rather than by this page — an agent's note to a
 * colleague is not something a query here could show even if
 * somebody wrote one that tried.
 */
export default async function HostThreadPage({ params }: { params: { id: string } }) {
  const { home, live, nav, supabase, photoUrl } = await hostContext();
  if (!home) return null;

  const [convRes, msgRes] = await Promise.all([
    supabase.from('host_conversation_v').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('host_message_v')
      .select('*')
      .eq('conversation_id', params.id)
      .order('seq'),
  ]);

  const conv = convRes.data as Conversation | null;
  /* RLS answers this, so a thread that is not theirs simply
     does not come back — there is no "not yours" branch to get
     wrong. */
  if (!conv) notFound();

  const messages = (msgRes.data as Message[] | null) ?? [];
  const waiting = conv.resolved_at === null && messages[messages.length - 1]?.mine === true;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      photoUrl={photoUrl}
      current="/host/messages"
      title={conv.subject ?? 'Conversation'}
      lead={
        conv.resolved_at
          ? 'Resolved. Replying here reopens it — if it was not actually finished, say so and it goes back in the queue.'
          : waiting
            ? 'With us. You will see the reply here and we will notify you.'
            : 'Open. Carry on below.'
      }
      headlineValue={String(messages.length)}
      headlineNote={messages.length === 1 ? 'Message' : 'Messages'}
    >
      <MarkRead conversationId={conv.id} />

      <Link
        href="/host/messages"
        className="text-muted hover:text-ink inline-block text-[0.75rem] font-extrabold"
      >
        ← All messages
      </Link>

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">This thread</h2>
              </div>
              <Fact
                label="Status"
                value={
                  conv.resolved_at ? (
                    <Pill tone="good">Resolved</Pill>
                  ) : conv.first_responded_at ? (
                    <Pill tone="info">Answered</Pill>
                  ) : (
                    <Pill tone="warn">Waiting on us</Pill>
                  )
                }
              />
              <Fact label="Opened" value={when(conv.created_at)} />
              <Fact
                label="First reply"
                value={conv.first_responded_at ? when(conv.first_responded_at) : 'not yet'}
              />
              <Fact label="About" value={conv.about ?? DASH} />
            </section>

            <HowItWorks title="What you see">
              Messages to and from you. Notes the desk writes to each other are invisible at the
              database, not filtered by this page — so there is no query anywhere that could show
              you one.
            </HowItWorks>
          </>
        }
      >
        <section className="border-border bg-surface overflow-hidden rounded-xl border">
          <div className="space-y-4 p-4">
            {messages.length === 0 ? (
              <p className="text-muted-light py-8 text-center text-[0.8125rem] font-semibold">
                Nothing in this thread yet.
              </p>
            ) : null}

            {messages.map((m) => (
              <div key={m.id} className={m.mine ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[85%]">
                  <p
                    className={`text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide ${
                      m.mine ? 'text-right' : ''
                    }`}
                  >
                    {m.mine ? 'You' : (m.author ?? 'NexG')}
                    <span className="ml-2 font-semibold normal-case tracking-normal">
                      {when(m.created_at)} {clock(m.created_at)}
                    </span>
                  </p>
                  <div
                    className={`mt-1 rounded-xl px-3.5 py-2.5 text-[0.8125rem] font-semibold leading-[1.7] ${
                      m.mine ? 'bg-ink text-white' : 'bg-bg text-ink'
                    }`}
                  >
                    {m.redacted ? (
                      <span className="text-muted-light italic">
                        This message was removed from the record.
                      </span>
                    ) : (
                      m.body
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Reply conversationId={conv.id} />
        </section>
      </TwoColumn>
    </HostSection>
  );
}
