import { Panel, Row, Tile } from '@/components/merchant/bits';
import { DisputeReply, type DisputeRow } from '@/components/merchant/board-client';
import { MerchantPage, merchantContext } from '@/components/merchant/frame';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Disputes' };
export const dynamic = 'force-dynamic';

const STEPS: [string, string][] = [
  [
    '1 · Claim',
    'A guest reports it through the concierge; the refund may be issued to them at once.',
  ],
  ['2 · Your reply', 'Within 48 h: packing photo, counter note, the pickup PIN record.'],
  ['3 · Decision', 'Support reviews both sides within one working day.'],
  ['4 · Statement', 'The outcome appears on the next statement with the reason.'],
];

/**
 * Refunds and claims that touch the merchant's money.
 *
 * The countdown is the page. A dispute with eighteen hours left
 * and one decided last month need different things from
 * whoever opens this, and the only thing separating them is how
 * long is left to reply.
 */
export default async function DisputesPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  const { data } = await createClient()
    .from('merchant_dispute_v')
    .select('*')
    .eq('merchant_id', m.merchant_id)
    .order('opened_at', { ascending: false });

  const all = (data as DisputeRow[] | null) ?? [];
  const tab = searchParams?.tab ?? 'open';
  const open = all.filter((d) => d.open);
  const decided = all.filter((d) => !d.open);
  const rows = tab === 'decided' ? decided : tab === 'all' ? all : open;

  const atStake = open.reduce((a, d) => a + Number(d.amount_claimed_kes ?? 0), 0);
  const won = decided.filter((d) => d.charged_to !== 'merchant').length;
  const lost = decided.filter((d) => d.charged_to === 'merchant').length;

  const reasons = new Map<string, number>();
  for (const d of all) {
    const k = d.reason ?? 'other';
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
  }
  const topReason = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/disputes"
      title="Disputes"
      lead="Refunds and claims that touch your money. Reply with evidence before the deadline; NexG decides within one working day and both sides see the reasoning."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          label="Open"
          value={String(open.length)}
          note={
            open.length === 0
              ? 'nothing waiting'
              : open[0]?.hours_left != null
                ? `reply due in ${open[0].hours_left} h`
                : 'awaiting your reply'
          }
          noteTone={open.length > 0 ? 'danger' : 'good'}
        />
        <Tile
          label="Overdue"
          value={String(open.filter((d) => d.overdue).length)}
          note="decided without you"
          noteTone={open.some((d) => d.overdue) ? 'danger' : 'plain'}
        />
        <Tile label="Won / lost" value={`${won} / ${lost}`} note="decided" />
        <Tile
          label="Money at stake"
          value={`KES ${atStake.toLocaleString('en-KE')}`}
          note="open claims"
        />
        <Tile
          label="Most common"
          value={topReason ? topReason[0] : '—'}
          note={topReason ? `${topReason[1]} of ${all.length}` : 'none yet'}
        />
      </div>

      <div className="border-border-strong bg-bg inline-flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5">
        {[
          { k: 'open', l: 'Open', n: open.length },
          { k: 'decided', l: 'Decided', n: decided.length },
          { k: 'all', l: 'All', n: all.length },
        ].map((t) => (
          <a
            key={t.k}
            href={t.k === 'open' ? '/merchant/disputes' : `/merchant/disputes?tab=${t.k}`}
            aria-current={tab === t.k ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-extrabold ${
              tab === t.k ? 'bg-ink text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {t.l}
            <span className="ml-1.5 opacity-70">{t.n}</span>
          </a>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Disputes">
            {rows.length === 0 ? (
              <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                {tab === 'open'
                  ? 'Nothing open. Not a loading state — every claim has been dealt with.'
                  : 'Nothing in this view.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-border bg-bg border-b">
                    <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                      <th className="px-4 py-2">Order</th>
                      <th className="px-4 py-2">Reason</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2">Reply due</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr
                        key={d.id}
                        className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                          d.overdue ? 'bg-danger/5' : d.open ? 'bg-warning-bg/40' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-extrabold">{d.order_reference ?? '—'}</td>
                        <td className="text-muted px-4 py-3">
                          {d.reason ?? '—'}
                          {d.guest_note ? (
                            <span className="text-muted-light block text-[0.6875rem]">
                              {d.guest_note.slice(0, 54)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {d.amount_claimed_kes === null
                            ? '—'
                            : `KES ${Number(d.amount_claimed_kes).toLocaleString('en-KE')}`}
                        </td>
                        <td className="px-4 py-3">
                          {!d.open ? (
                            <span className="text-muted-light">—</span>
                          ) : d.overdue ? (
                            <span className="text-danger font-extrabold">Overdue</span>
                          ) : d.hours_left === null ? (
                            '—'
                          ) : (
                            <span
                              className={d.hours_left < 6 ? 'text-danger font-extrabold' : ''}
                            >
                              {d.hours_left} h
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                              !d.open
                                ? d.charged_to === 'merchant'
                                  ? 'bg-danger/10 text-danger'
                                  : 'bg-success/10 text-success'
                                : 'bg-warning-bg text-warning'
                            }`}
                          >
                            {!d.open
                              ? d.charged_to === 'merchant'
                                ? 'Decided · you pay'
                                : 'Decided · NexG pays'
                              : 'Awaiting your reply'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DisputeReply dispute={d} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="How decisions are made">
            <div className="grid gap-3 p-4 sm:grid-cols-4">
              {STEPS.map(([t, b]) => (
                <div key={t} className="border-border rounded-lg border p-3">
                  <p className="text-[0.75rem] font-extrabold">{t}</p>
                  <p className="text-muted mt-1 text-[0.6875rem] font-semibold leading-[1.55]">
                    {b}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="What counts as evidence">
            <Row label="Packing photo" value="strongest" />
            <Row label="Pickup PIN record" value="automatic" />
            <Row label="Counter note" value="helps" />
            <Row label="We always check" value="does not" tone="muted" />
            <p className="text-muted-light px-4 py-3 text-[0.6875rem] font-semibold leading-[1.6]">
              Photographing every bag at hand-over takes a second and settles most of these. It is
              the single thing that moves the won/lost figure above.
            </p>
          </Panel>

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              Who pays for what
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              Missing or wrong items are the merchant&apos;s. Late delivery and rider conduct are
              NexG&apos;s. A guest who simply changed their mind is nobody&apos;s and is refused.
              The rule does not move because a particular guest is upset.
            </p>
          </section>
        </aside>
      </div>
    </MerchantPage>
  );
}
