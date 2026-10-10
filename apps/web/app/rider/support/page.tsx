import { Panel, Row, Tile } from '@/components/rider/bits';
import { RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Support' };
export const dynamic = 'force-dynamic';

interface TicketRow {
  id: string;
  reference: string;
  topic: string;
  body: string;
  status: string;
  first_reply_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

const TOPIC: Record<string, string> = {
  partner_rider: 'Rider ops',
  payment_or_refund: 'Pay',
  account: 'Account',
  order_problem: 'An order',
  something_else: 'Product',
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

/**
 * Reaching a person.
 *
 * The reply times shown are measured on this rider's own
 * tickets, not a published target. A promise of "under two
 * minutes" above a thread that waited two days is worse than
 * no promise at all.
 */
export default async function RiderSupport() {
  const { h, supabase } = await riderContext();
  if (!h) return null;

  const { data } = await supabase
    .from('rider_ticket_v')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  const all = (data as TicketRow[] | null) ?? [];
  const open = all.filter((t) => t.resolved_at === null);
  const answered = all.filter((t) => t.first_reply_at !== null);

  const replies = answered
    .map(
      (t) =>
        (new Date(t.first_reply_at as string).getTime() - new Date(t.created_at).getTime()) / 60000,
    )
    .sort((a, b) => a - b);
  const median =
    replies.length >= 3 ? Math.round(replies[Math.floor(replies.length / 2)] as number) : null;

  return (
    <RiderBoard>
      <RiderPageHead
        title="Support"
        lead="Rider ops for anything on the road, pay for anything about money, and the product team for a bug or an idea. Every message gets a ticket you can follow."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          value={String(open.length)}
          label="Open tickets"
          note={open.length > 0 ? (open[0]?.body.slice(0, 30) ?? '') : 'nothing open'}
          noteTone={open.length > 0 ? 'gold' : 'good'}
        />
        <Tile
          value={
            median === null ? '—' : median < 60 ? `${median} min` : `${Math.round(median / 60)} h`
          }
          label="Median first reply"
          note={median === null ? `${replies.length} of 3 needed` : 'on your tickets'}
        />
        <Tile value="24 h" label="Rider ops" note="7 days, on call overnight" />
        <Tile value={String(all.length)} label="Tickets" note="all time" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { t: 'Rider ops', b: 'Offers, dispatch, a merchant keeping you waiting, your areas.' },
          { t: 'Pay', b: 'A trip that paid the wrong amount, a deposit that did not match.' },
          { t: 'Product & bugs', b: 'The app did something odd, or you have an idea for it.' },
        ].map((c) => (
          <section key={c.t} className="border-border bg-surface rounded-xl border p-4">
            <h2 className="text-[0.9375rem] font-extrabold tracking-tight">{c.t}</h2>
            <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.6]">{c.b}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Your tickets">
            {all.length === 0 ? (
              <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                You have not needed us yet. Opening one takes a sentence.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-border bg-bg border-b">
                    <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                      <th className="px-4 py-2">Ticket</th>
                      <th className="px-4 py-2">Subject</th>
                      <th className="px-4 py-2">Team</th>
                      <th className="px-4 py-2">Opened</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.map((t) => (
                      <tr
                        key={t.id}
                        className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                      >
                        <td className="px-4 py-3 font-extrabold">{t.reference}</td>
                        <td className="text-muted px-4 py-3">{t.body.slice(0, 64)}</td>
                        <td className="text-muted px-4 py-3">{TOPIC[t.topic] ?? t.topic}</td>
                        <td className="text-muted-light px-4 py-3">{when(t.created_at)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                              t.resolved_at
                                ? 'bg-success/10 text-success'
                                : t.first_reply_at
                                  ? 'bg-info-bg text-info'
                                  : 'bg-warning-bg text-warning'
                            }`}
                          >
                            {t.resolved_at ? 'Resolved' : t.first_reply_at ? 'Answered' : 'Open'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
              A ticket opened from a call or WhatsApp appears here too, logged by whoever took it
              — so the desk remembers what you asked last week.
            </p>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="What rider ops can do now">
            <Row label="Re-dispatch a stuck order" value="yes" />
            <Row label="Match a deposit by hand" value="yes" />
            <Row label="Change your areas" value="yes" />
            <Row label="Change a health score" value="no" tone="muted" />
            <Row label="Pay early" value="no" tone="muted" />
          </Panel>

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              Urgent
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              In danger, or somebody with you is: SOS in the app, or the 24-hour NexG line. It
              reaches Live Operations, who can see where you are. Do not open a ticket for that
              and wait.
            </p>
          </section>
        </aside>
      </div>
    </RiderBoard>
  );
}
