import { Panel, Row, Tile } from '@/components/merchant/bits';
import { ReportProblem } from '@/components/merchant/board-client';
import { MerchantPage, merchantContext } from '@/components/merchant/frame';
import { createClient } from '@/lib/supabase/server';

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
  partner_merchant: 'Merchant ops',
  payment_or_refund: 'Money',
  hotel_partnership: 'Partnerships',
  something_else: 'Product',
  order_problem: 'An order',
  account: 'Account',
};

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

/**
 * Reaching a person.
 *
 * The reply times shown are measured on this account, not a
 * published target. A promise of "under two minutes" beside a
 * thread that waited two days is worse than no promise.
 */
export default async function SupportPage() {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  const { data } = await createClient()
    .from('merchant_ticket_v')
    .select('*')
    .order('created_at', { ascending: false });

  const all = (data as TicketRow[] | null) ?? [];
  const open = all.filter((t) => t.resolved_at === null);
  const answered = all.filter((t) => t.first_reply_at !== null);

  const replies = answered
    .map(
      (t) =>
        (new Date(t.first_reply_at as string).getTime() - new Date(t.created_at).getTime()) /
        60000,
    )
    .sort((a, b) => a - b);
  const median =
    replies.length >= 3 ? Math.round(replies[Math.floor(replies.length / 2)] as number) : null;

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/support"
      title="Support"
      lead="Merchant ops for day-to-day help, partnerships for your agreement and fees, and the product team for bugs and ideas. Every message gets a ticket you can follow."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Open tickets"
          value={String(open.length)}
          note={open.length > 0 ? (open[0]?.body.slice(0, 32) ?? '') : 'nothing open'}
          noteTone={open.length > 0 ? 'gold' : 'good'}
        />
        <Tile
          label="Median first reply"
          value={
            median === null ? '—' : median < 60 ? `${median} min` : `${Math.round(median / 60)} h`
          }
          note={median === null ? `${replies.length} replies — too few` : 'on your tickets'}
        />
        <Tile label="Merchant ops" value="07:00–23:00" note="7 days" />
        <Tile label="Tickets" value={String(all.length)} note="all time" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            t: 'Merchant ops',
            b: 'Orders, catalogue reviews, documents, counter phones. The desk on duty.',
          },
          {
            t: 'Partnerships',
            b: 'Your agreement, fees, new branches, featured slots.',
          },
          {
            t: 'Product & bugs',
            b: 'Something broken or an idea for the portal. It goes to the builders.',
          },
        ].map((c) => (
          <section key={c.t} className="border-border bg-surface rounded-xl border p-4">
            <h2 className="text-[0.9375rem] font-extrabold tracking-tight">{c.t}</h2>
            <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.6]">{c.b}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Your tickets" action={<ReportProblem page="Merchant portal" />}>
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
                            {t.resolved_at
                              ? 'Resolved'
                              : t.first_reply_at
                                ? 'Answered'
                                : 'Open'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
              A ticket opened from a call or WhatsApp appears here too, logged by whoever took
              it — so the desk remembers what you asked last week.
            </p>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="What merchant ops can do now">
            <Row label="Review a catalogue edit" value="yes" />
            <Row label="Re-check a document" value="yes" />
            <Row label="Pair a counter phone" value="yes" />
            <Row label="Change a dispute decision" value="support, not ops" tone="muted" />
            <Row label="Refund a guest directly" value="their bank, not us" tone="muted" />
          </Panel>

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              Urgent
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              A rider or guest in danger at your premises: call the 24-hour NexG line, which
              reaches Live Operations directly. Out of hours the desk answers a phone, not a
              form, and that difference only matters when it matters.
            </p>
          </section>
        </aside>
      </div>
    </MerchantPage>
  );
}
