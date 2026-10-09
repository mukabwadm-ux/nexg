import { DASH, when } from '@/components/host/bits';
import {
  Fact,
  HowItWorks,
  Kpi,
  KpiRow,
  Pill,
  Segmented,
  Table,
  Td,
  Tr,
  TwoColumn,
} from '@/components/host/module';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

interface ConversationRow {
  id: string;
  subject: string | null;
  topic: string | null;
  status: string;
  priority: string | null;
  created_at: string;
  last_message_at: string | null;
  first_responded_at: string | null;
  resolved_at: string | null;
  rating: number | null;
  about: string | null;
  object_type: string | null;
  last_message: string | null;
  last_external_at: string | null;
  unread: number;
}

/**
 * Threads between a host and NexG.
 *
 * This reads the same conversation model the concierge desk
 * uses, through a view that does not carry the assignee, the
 * owning team or the escalation path. A host does not need to
 * know which agent is on shift, and a page that had those
 * columns available would eventually show one.
 *
 * Internal notes are not filtered here. They are invisible at
 * the policy — a host cannot read a message whose visibility is
 * internal, whatever query is written against it.
 */
export default async function HostMessagesPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const { home, live, nav, supabase, photoUrl } = await hostContext();
  if (!home) return null;

  const { data } = await supabase
    .from('host_conversation_v')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false });

  const all = (data as ConversationRow[] | null) ?? [];
  const tab = searchParams?.tab ?? 'open';

  const open = all.filter((c) => c.status !== 'resolved' && c.status !== 'closed');
  const unread = all.filter((c) => c.unread > 0);
  const resolved = all.filter((c) => c.resolved_at !== null);
  const rows = tab === 'all' ? all : tab === 'unread' ? unread : tab === 'resolved' ? resolved : open;

  const unreadTotal = all.reduce((a, c) => a + c.unread, 0);

  const replies = all
    .filter((c) => c.first_responded_at)
    .map(
      (c) =>
        (new Date(c.first_responded_at as string).getTime() - new Date(c.created_at).getTime()) /
        60000,
    )
    .sort((a, b) => a - b);
  const median =
    replies.length >= 3 ? Math.round(replies[Math.floor(replies.length / 2)] as number) : null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      photoUrl={photoUrl}
      current="/host/messages"
      title="Messages"
      lead="Threads between you and NexG, whether they started here, on WhatsApp or on a call. One record, so the desk remembers what you asked last week."
      headlineValue={String(unreadTotal)}
      headlineNote={unreadTotal === 1 ? 'Unread message' : 'Unread messages'}
    >
      <KpiRow>
        <Kpi label="Threads" value={String(all.length)} note="you are in" />
        <Kpi
          label="Unread"
          value={String(unreadTotal)}
          note={`${unread.length} thread${unread.length === 1 ? '' : 's'}`}
          tone={unreadTotal > 0 ? 'gold' : 'good'}
        />
        <Kpi label="Open" value={String(open.length)} note="not yet closed" />
        <Kpi label="Resolved" value={String(resolved.length)} note="closed out" tone="good" />
        <Kpi
          label="Median first reply"
          value={
            median === null ? DASH : median < 60 ? `${median}m` : `${Math.round(median / 60)}h`
          }
          note={median === null ? `${replies.length} replies — too few` : 'on your threads'}
        />
        <Kpi label="Desk hours" value="7–22" note="Nairobi time" href="/host/support" />
      </KpiRow>

      <Segmented
        base="/host/messages"
        param="tab"
        current={tab}
        options={[
          { key: 'open', label: 'Open', count: open.length },
          { key: 'unread', label: 'Unread', count: unread.length },
          { key: 'resolved', label: 'Resolved', count: resolved.length },
          { key: 'all', label: 'All', count: all.length },
        ]}
      />

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">Start a thread</h2>
              </div>
              <div className="space-y-2 px-4 py-4">
                <a
                  href="https://wa.me/254700000000"
                  className="bg-ink block rounded-lg px-4 py-2.5 text-center text-[0.8125rem] font-extrabold text-white"
                >
                  WhatsApp host ops
                </a>
                <a
                  href="/help/contact?from=host"
                  className="border-border-strong block rounded-lg border px-4 py-2.5 text-center text-[0.8125rem] font-extrabold"
                >
                  Write to us
                </a>
              </div>
              <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
                Replying from inside this page is the next piece. Both routes above land in the
                same thread, so nothing is lost by using them meanwhile.
              </p>
            </section>

            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">What you see</h2>
              </div>
              <Fact label="Messages to and from you" value="yes" />
              <Fact label="The desk's internal notes" value="never" />
              <Fact label="Who is assigned" value="not shown" />
            </section>

            <HowItWorks title="Why notes are invisible">
              An agent writing &ldquo;check whether this host has paid&rdquo; to a colleague is
              working, not hiding. Those notes are invisible to you at the database, not filtered
              by this page — there is no query anywhere that could show you one.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Thread', 'About', 'Last message', 'When', 'Status']}
          empty={
            tab === 'unread'
              ? 'Nothing unread.'
              : 'No threads yet. WhatsApp or write to us and one opens here.'
          }
          caption="A thread started on WhatsApp or on a call is listed here too, logged by whoever took it."
        >
          {rows.map((c) => (
            <Tr key={c.id} tone={c.unread > 0 ? 'warn' : 'plain'}>
              <Td strong note={c.topic ? c.topic.replace(/_/g, ' ') : undefined}>
                {c.subject ?? 'No subject'}
                {c.unread > 0 ? (
                  <span className="ml-1.5">
                    <Pill tone="gold">{c.unread} new</Pill>
                  </span>
                ) : null}
              </Td>
              <Td muted>{c.about ?? DASH}</Td>
              <Td>
                <span className="line-clamp-2 max-w-[22rem]">{c.last_message ?? DASH}</span>
              </Td>
              <Td muted>{when(c.last_message_at)}</Td>
              <Td>
                {c.resolved_at ? (
                  <Pill tone="good">Resolved</Pill>
                ) : c.first_responded_at ? (
                  <Pill tone="info">Answered</Pill>
                ) : (
                  <Pill tone="warn">Waiting on us</Pill>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      </TwoColumn>
    </HostSection>
  );
}
