import { Panel, Row, Tile, kesh } from '@/components/rider/bits';
import { RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Cash' };
export const dynamic = 'force-dynamic';

interface CashRow {
  on_hand_kes: number | null;
  cap_kes: number | null;
  remind_at_pct: number | null;
  pause_at_pct: number | null;
  netting_cutoff: string | null;
  prefer_mpesa_at_door: boolean | null;
  collected_today_kes: number | null;
}

interface EventRow {
  id: number;
  kind: string;
  amount_kes: number;
  order_reference: string | null;
  note: string | null;
  created_at: string;
}

interface DepositRow {
  id: string;
  provider_ref: string;
  amount_kes: number;
  account_reference: string | null;
  paid_at: string;
  match_status: string;
  matched_at: string | null;
}

const KIND: Record<string, string> = {
  collected: 'Collected at the door',
  deposit: 'Deposited',
  netted: 'Netted off your pay',
  write_off: 'Written off',
  manual_adjustment: 'Adjustment',
  recovery_payment: 'Recovery payment',
};

const MATCH: Record<string, { label: string; tone: string }> = {
  auto_matched: { label: 'Matched', tone: 'bg-success/10 text-success' },
  manual_matched: { label: 'Matched by hand', tone: 'bg-success/10 text-success' },
  unmatched: { label: 'Not matched yet', tone: 'bg-warning-bg text-warning' },
  rejected: { label: 'Rejected', tone: 'bg-danger-bg text-danger' },
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

/**
 * What you are holding.
 *
 * The number that matters is the one in your pocket, so it is
 * the first thing on the page and the only one at that size.
 * Everything under it explains how it got there — a cash board
 * that shows a balance without the movements behind it is one
 * a rider cannot argue with when it is wrong.
 */
export default async function RiderCash() {
  const { h, supabase } = await riderContext();
  if (!h) return null;

  const [cashRes, eventRes, depositRes] = await Promise.all([
    supabase.from('rider_cash_v').select('*').eq('rider_id', h.rider_id).maybeSingle(),
    supabase.from('rider_cash_event_v').select('*').eq('rider_id', h.rider_id).limit(40),
    supabase.from('rider_deposit_v').select('*').eq('rider_id', h.rider_id).limit(20),
  ]);

  const c = cashRes.data as CashRow | null;
  const events = (eventRes.data as EventRow[] | null) ?? [];
  const deposits = (depositRes.data as DepositRow[] | null) ?? [];

  const onHand = c?.on_hand_kes ?? 0;
  const cap = c?.cap_kes ?? null;
  /* No cap configured is not a cap of zero. Dividing by one
     would make every rider permanently over the limit. */
  const pct = cap && cap > 0 ? Math.round((onHand / cap) * 100) : null;
  const remindAt = c?.remind_at_pct ?? null;
  const pauseAt = c?.pause_at_pct ?? null;

  const band =
    pct === null
      ? 'plain'
      : pauseAt !== null && pct >= pauseAt
        ? 'danger'
        : remindAt !== null && pct >= remindAt
          ? 'gold'
          : 'good';

  const unmatched = deposits.filter((d) => d.match_status === 'unmatched');

  return (
    <RiderBoard>
      <RiderPageHead
        title="Cash"
        lead="What you collected at the door, what you have deposited, and the difference you are carrying. Deposit before your cap or offers pause."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          value={kesh(onHand)}
          label="On hand now"
          note={
            pct === null
              ? 'no cap set for your city'
              : `${pct}% of your ${kesh(cap)} cap`
          }
          noteTone={band === 'danger' ? 'danger' : band === 'gold' ? 'gold' : 'good'}
        />
        <Tile value={kesh(cap)} label="Your cap" note={cap === null ? 'not set' : 'per city rule'} />
        <Tile
          value={kesh(c?.collected_today_kes ?? 0)}
          label="Collected today"
          note="cash orders only"
        />
        <Tile
          value={String(unmatched.length)}
          label="Deposits not matched"
          note={unmatched.length > 0 ? 'send the M-Pesa message' : 'all matched'}
          noteTone={unmatched.length > 0 ? 'gold' : 'good'}
        />
      </div>

      {pct !== null && remindAt !== null && pct >= remindAt ? (
        <section
          className={`rounded-xl border px-4 py-3 ${
            band === 'danger'
              ? 'border-danger/30 bg-danger-bg'
              : 'border-warning/40 bg-warning-bg'
          }`}
        >
          <p
            className={`text-[0.8125rem] font-extrabold ${
              band === 'danger' ? 'text-danger' : 'text-warning'
            }`}
          >
            {band === 'danger'
              ? 'You are at your cap. Offers are paused until you deposit.'
              : `You are at ${pct}% of your cap. Deposit before ${pauseAt ?? 100}% or offers pause.`}
          </p>
          <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.6]">
            Pay to the NexG paybill with your rider reference. It matches automatically within a
            few minutes; nothing needs sending to anybody when it does.
          </p>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Movements">
            {events.length === 0 ? (
              <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                Nothing yet. Cash orders you deliver appear here the moment you close them.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-border bg-bg border-b">
                    <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                      <th className="px-4 py-2">When</th>
                      <th className="px-4 py-2">What</th>
                      <th className="px-4 py-2">Order</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => {
                      const out = e.kind !== 'collected' && e.kind !== 'manual_adjustment';
                      return (
                        <tr
                          key={e.id}
                          className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                        >
                          <td className="text-muted-light px-4 py-3">{when(e.created_at)}</td>
                          <td className="px-4 py-3 font-extrabold">
                            {KIND[e.kind] ?? e.kind}
                            {e.note ? (
                              <span className="text-muted-light ml-2 font-semibold">{e.note}</span>
                            ) : null}
                          </td>
                          <td className="text-muted px-4 py-3">{e.order_reference ?? '—'}</td>
                          <td
                            className={`px-4 py-3 text-right font-extrabold tabular-nums ${
                              out ? 'text-success' : ''
                            }`}
                          >
                            {out ? '−' : '+'}
                            {kesh(e.amount_kes)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Deposits">
            {deposits.length === 0 ? (
              <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                No deposits yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-border bg-bg border-b">
                    <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                      <th className="px-4 py-2">Paid</th>
                      <th className="px-4 py-2">Reference</th>
                      <th className="px-4 py-2">Sent as</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deposits.map((d) => {
                      const m = MATCH[d.match_status] ?? {
                        label: d.match_status,
                        tone: 'bg-bg text-muted',
                      };
                      return (
                        <tr
                          key={d.id}
                          className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                        >
                          <td className="text-muted-light px-4 py-3">{when(d.paid_at)}</td>
                          <td className="px-4 py-3 font-extrabold">{d.provider_ref}</td>
                          <td className="text-muted px-4 py-3">{d.account_reference ?? '—'}</td>
                          <td className="px-4 py-3 text-right font-extrabold tabular-nums">
                            {kesh(d.amount_kes)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${m.tone}`}
                            >
                              {m.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
              A deposit that has not matched is almost always the reference. Send the M-Pesa
              message to rider ops and it is matched by hand the same day — the money is not lost,
              it is only unlabelled.
            </p>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="How your cap works">
            <Row label="Your cap" value={kesh(cap)} tone={cap === null ? 'muted' : 'plain'} />
            <Row
              label="We remind you at"
              value={remindAt === null ? '—' : `${remindAt}%`}
              tone={remindAt === null ? 'muted' : 'plain'}
            />
            <Row
              label="Offers pause at"
              value={pauseAt === null ? '—' : `${pauseAt}%`}
              tone={pauseAt === null ? 'muted' : 'plain'}
            />
            <Row
              label="Netting cutoff"
              value={c?.netting_cutoff ?? '—'}
              tone={c?.netting_cutoff ? 'plain' : 'muted'}
            />
          </Panel>

          <section className="bg-ink rounded-xl p-4 text-white">
            <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
              Why there is a cap at all
            </h2>
            <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              It is not about trust. A rider carrying a large amount of cash through Nairobi at
              night is a rider somebody has a reason to follow. The cap keeps the amount on you
              small enough that it is not worth anybody&apos;s while.
            </p>
          </section>
        </aside>
      </div>
    </RiderBoard>
  );
}
