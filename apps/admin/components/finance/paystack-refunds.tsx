import { cn } from '@nexg/ui';
import Link from 'next/link';

import {
  cell,
  Empty,
  figure,
  ModePill,
  Note,
  sub,
  Table,
} from '@/components/finance/paystack-parts';
import { PanelHead, Pill, Sheet } from '@/components/portal/kit';
import { PaystackRefundButton } from '@/components/refunds/paystack-refund-button';
import {
  money,
  REFUND_SHOWS,
  REFUND_STATES,
  type DueRow,
  type RefundKind,
  type Refunds,
  type RefundShow,
} from '@/lib/finance-paystack';
import { dateTime, type Tone } from '@/lib/portal';

const KIND: Record<RefundKind, string> = {
  order: 'Order',
  stay: 'Stay',
  booking: 'Booking',
  cinema: 'Cinema',
};

const STATE_TONE: Record<string, Tone> = {
  opened: 'amber',
  pending: 'blue',
  processing: 'blue',
  processed: 'green',
  failed: 'red',
  'needs-attention': 'red',
};

const SHOW: Record<RefundShow, string> = { due: 'Due', refunded: 'Refunded', all: 'All' };

const BY_HAND = 'Handled by hand in the Paystack dashboard.';
/* A cinema refund the database does not mark by hand: the cinema worker sends it. */
const AUTOMATIC = 'NexG sends this refund automatically.';

/** Which keys the console holds: a refund goes out with the payment's own. */
export interface HeldKeys {
  test: boolean;
  live: boolean;
}

/**
 * Paystack refunds: the money due back and not yet sent, then every try. The
 * button is the same one as on the order and stay pages.
 */
export function PaystackRefunds({
  refunds,
  show,
  canAct,
  held,
  showHref,
}: {
  refunds: Refunds;
  show: RefundShow;
  canAct: boolean;
  held: HeldKeys;
  showHref: (show: RefundShow) => string;
}) {
  return (
    <>
      <Sheet>
        <PanelHead title="Money to Send Back" aside="due and not yet with Paystack" />
        {refunds.due.length === 0 ? (
          <Empty>No Paystack refund is due.</Empty>
        ) : (
          <Table
            caption="Refunds due and not yet sent"
            heads={['For', { label: 'Amount', right: true }, 'Due Since', 'Last Try', 'Send']}
          >
            {refunds.due.map((d) => (
              <tr key={`${d.kind}-${d.target_id}`}>
                <td className={cell}>
                  <span className="font-semibold">{d.label}</span>
                  <span className={sub}>
                    {KIND[d.kind]}
                    {d.paid_reference ? ` · paid as ${d.paid_reference}` : ''}
                  </span>
                </td>
                <td className={figure}>
                  <span className="block font-semibold">{money(d.amount_cents)}</span>
                  <ModePill test={d.is_test} />
                </td>
                <td className={cell}>{dateTime(d.due_since)}</td>
                <td className={cell}>
                  {d.last_try ? (
                    <>
                      {REFUND_STATES[d.last_try.state] ?? d.last_try.state}
                      {d.last_try.failure_reason && (
                        <span className={sub}>{d.last_try.failure_reason}</span>
                      )}
                      <span className={sub}>{dateTime(d.last_try.updated_at)}</span>
                    </>
                  ) : (
                    <span className="text-muted-light">—</span>
                  )}
                </td>
                <td className={cell}>
                  <Send row={d} canAct={canAct} held={held} />
                </td>
              </tr>
            ))}
          </Table>
        )}
        <Note>
          After a failed try, check it in the Paystack dashboard before sending again. Do not also
          send the money by M-Pesa or bank.
        </Note>
      </Sheet>

      <Sheet>
        <PanelHead title="Paystack Refunds" aside="the newest 200">
          {REFUND_SHOWS.map((k) => (
            <Link
              key={k}
              href={showHref(k)}
              aria-current={k === show ? 'true' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-bold',
                k === show ? 'bg-ink border-ink text-white' : 'border-border text-muted',
              )}
            >
              {SHOW[k]}
            </Link>
          ))}
        </PanelHead>
        {refunds.refunds.length === 0 ? (
          <Empty>
            {show === 'due'
              ? 'No refund is on its way or waiting.'
              : show === 'refunded'
                ? 'Paystack has processed no refund yet.'
                : 'No Paystack refund has been started.'}
          </Empty>
        ) : (
          <Table
            caption="Paystack refunds"
            heads={['For', { label: 'Amount', right: true }, 'State', 'Started By', 'Last Update']}
          >
            {refunds.refunds.map((r) => (
              <tr key={r.id}>
                <td className={cell}>
                  <span className="font-semibold">{r.label}</span>
                  <span className={sub}>
                    {KIND[r.kind]} · {r.reference}
                    {r.paid_reference ? ` · paid as ${r.paid_reference}` : ''}
                  </span>
                </td>
                <td className={figure}>
                  <span className="block font-semibold">{money(r.amount_cents)}</span>
                  <ModePill test={r.is_test} />
                </td>
                <td className={cell}>
                  <Pill tone={STATE_TONE[r.state] ?? 'grey'}>
                    {REFUND_STATES[r.state] ?? r.state}
                  </Pill>
                  {r.failure_reason && <span className={sub}>{r.failure_reason}</span>}
                  {r.state === 'failed' && r.settled && (
                    <span className={sub}>The money went back another way.</span>
                  )}
                  {r.by_hand ? (
                    <span className="text-danger block text-xs font-bold">{BY_HAND}</span>
                  ) : (
                    r.kind === 'cinema' &&
                    r.state === 'opened' &&
                    !r.settled && <span className={sub}>{AUTOMATIC}</span>
                  )}
                </td>
                <td className={cell}>{r.created_by ?? 'The system'}</td>
                <td className={cell}>
                  {dateTime(r.updated_at)}
                  <span className={sub}>started {dateTime(r.created_at)}</span>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Sheet>
    </>
  );
}

function Send({ row, canAct, held }: { row: DueRow; canAct: boolean; held: HeldKeys }) {
  const why = (text: string) => <span className="text-muted text-xs font-bold">{text}</span>;
  if (row.by_hand) return why(BY_HAND);
  /* The console never sends a cinema refund. */
  if (row.kind === 'cinema') return why(AUTOMATIC);
  if (!canAct) return why('Due');
  if (!row.can_send) {
    return why(
      row.kind === 'stay' ? 'Hospitality staff send stay refunds.' : 'You cannot send this one.',
    );
  }
  const mode = row.is_test ? 'test' : 'live';
  if (!held[mode]) return why(`The console has no ${mode} Paystack key.`);
  if (row.amount_cents === null) return why('The amount could not be read.');
  return (
    <PaystackRefundButton
      kind={row.kind}
      targetId={row.target_id}
      amount={money(row.amount_cents)}
    />
  );
}
