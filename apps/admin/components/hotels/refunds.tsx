import { Card } from '@nexg/ui';

import { PaystackRefundButton } from '@/components/refunds/paystack-refund-button';

import { PaidBookings } from './paid-bookings';
import { paidVia, shortDate, type PaidBookingRow } from './paid-bookings-data';
import { PaystackRefundCheck } from './paystack-refund-check';
import { RecordRefund } from './record-refund';
import { Chip, DASH, EmptyRow, kes, Pill, Tile, when } from './shared';

export interface StayRefundRow {
  stay_id: string;
  reason: 'late_payment' | 'cancelled';
  property: string | null;
  unit: string | null;
  host: string | null;
  check_in: string;
  check_out: string;
  paid_kes: number | null;
  payment_reference: string | null;
  mpesa_receipt: string | null;
  payer_phone: string | null;
  guest_email: string | null;
  guest_name: string | null;
  refund_due_at: string;
  refunded_at: string | null;
  refund_reference: string | null;
  refund_note: string | null;
  refunded_by: string | null;
  /** What to send back under the stay's cancellation policy (20270222000300). */
  refund_kes: number | null;
  /** What the policy keeps, the host's less NexG's commission. */
  cancellation_fee_kes: number | null;
  /* How the guest paid, and where Paystack's refund stands (20270328000100).
     Absent while the database is older than that. */
  provider?: string | null;
  is_test?: boolean | null;
  paystack_state?: string | null;
  paystack_reference?: string | null;
}

/** What goes back to the guest: the policy's refund, or the whole payment. */
const toRefund = (r: StayRefundRow) => r.refund_kes ?? r.paid_kes;

const REASON: Record<StayRefundRow['reason'], string> = {
  late_payment: 'Paid after the dates were taken',
  cancelled: 'Cancelled by NexG',
};

/** Where Paystack's refund stands, as the database last heard it. */
const PAYSTACK_STATE: Record<string, { label: string; tone?: string }> = {
  opened: { label: 'Started, no answer recorded', tone: 'bg-warning-bg text-warning' },
  pending: { label: 'Sent to Paystack: pending' },
  processing: { label: 'Sent to Paystack: processing' },
  processed: { label: 'Processed by Paystack', tone: 'bg-success-bg text-success' },
  'needs-attention': { label: 'Needs attention in Paystack', tone: 'bg-danger-bg text-danger' },
  failed: { label: 'Failed', tone: 'bg-danger-bg text-danger' },
};

/**
 * A Paystack payment is refunded with the button, and the row moves to Refunded
 * when Paystack says so; a row that did not is given what the Paystack
 * dashboard shows. Anything else is sent back by M-Pesa or bank and recorded
 * here, and so is a Paystack payment returned that way, which the database
 * allows only while no Paystack refund is open or processed.
 */
function DueRefund({ row }: { row: StayRefundRow }) {
  const amount = kes(toRefund(row));
  if (row.provider === undefined) {
    /* The database does not say how it was paid yet: offer both, as before. */
    return (
      <div className="space-y-2">
        <PaystackRefundButton kind="stay" targetId={row.stay_id} amount={amount} />
        <RecordRefund stayId={row.stay_id} amount={amount} />
      </div>
    );
  }
  if (row.provider !== 'paystack') return <RecordRefund stayId={row.stay_id} amount={amount} />;

  const state = row.paystack_state ? PAYSTACK_STATE[row.paystack_state] : undefined;
  /* The state is of a refund that has not failed, when there is one. */
  const noneLive = !row.paystack_state || row.paystack_state === 'failed';
  return (
    <div className="w-60 space-y-2">
      {state && <Pill tone={state.tone}>{state.label}</Pill>}
      <PaystackRefundButton kind="stay" targetId={row.stay_id} amount={amount} />
      <details>
        <summary className="text-muted cursor-pointer text-[0.6875rem] font-bold">
          Paystack shows it refunded or failed but this row didn&rsquo;t update?
        </summary>
        <PaystackRefundCheck
          stayId={row.stay_id}
          amount={amount}
          canFail={!noneLive && row.paystack_state !== 'processed'}
          shownReference={row.paystack_reference ?? null}
        />
      </details>
      {noneLive && (
        <details>
          <summary className="text-muted cursor-pointer text-[0.6875rem] font-bold">
            Sent it by M-Pesa or bank instead?
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-danger text-[0.6875rem] font-semibold">
              Only for money you sent yourself, after checking that Paystack has not refunded it.
            </p>
            <RecordRefund stayId={row.stay_id} amount={amount} />
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Paid stays NexG can cancel, then the stays that owe a guest their money back.
 * Paystack payments are refunded through Paystack and update by themselves;
 * other payments are sent by M-Pesa or bank and their reference recorded here.
 */
export function RefundsTab({
  rows,
  paid,
  filter,
  canRecord,
}: {
  rows: StayRefundRow[];
  /** Null when the paid bookings could not be loaded. */
  paid: PaidBookingRow[] | null;
  filter: string;
  canRecord: boolean;
}) {
  const due = rows.filter((r) => !r.refunded_at);
  const refunded = rows.filter((r) => r.refunded_at);
  const visible = filter === 'refunded' ? refunded : filter === 'all' ? rows : due;
  const owed = due.reduce((sum, r) => sum + (toRefund(r) ?? 0), 0);
  const oldest = due.length
    ? Math.max(...due.map((r) => Date.now() - Date.parse(r.refund_due_at)))
    : 0;
  const href = (f: string) => `/hotels?tab=refunds${f === 'due' ? '' : `&filter=${f}`}`;

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Refunds due"
          value={String(due.length)}
          tone={due.length ? 'danger' : undefined}
        />
        <Tile label="Owed to guests" value={kes(owed)} />
        <Tile
          label="Oldest waiting"
          value={due.length ? `${Math.floor(oldest / 86_400_000)} d` : DASH}
          tone={oldest > 3 * 86_400_000 ? 'warning' : undefined}
        />
        <Tile label="Refunded" value={String(refunded.length)} />
      </div>

      {canRecord && <PaidBookings rows={paid} />}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {[
          ['due', 'Due'],
          ['refunded', 'Refunded'],
          ['all', 'All'],
        ].map(([k, label]) => (
          <Chip key={k} on={filter === k} href={href(k!)}>
            {label}
          </Chip>
        ))}
      </div>

      <Card className="mt-5 overflow-x-auto p-0">
        <table className="w-full min-w-[58rem] text-left">
          <thead>
            <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th className="px-4 py-3">Stay</th>
              <th className="px-4 py-3">Why</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Paid with</th>
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Due since</th>
              <th className="px-4 py-3">Refund</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.stay_id}
                className="border-border hover:bg-bg border-b align-top last:border-b-0"
              >
                <td className="px-4 py-3">
                  <p className="text-[0.8125rem] font-extrabold">
                    {r.property ?? DASH} · {r.unit ?? DASH}
                  </p>
                  <p className="text-muted mt-0.5 text-[0.6875rem] font-semibold">
                    {shortDate(r.check_in)} → {shortDate(r.check_out)} · {r.host ?? DASH}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <Pill
                    tone={
                      r.reason === 'late_payment'
                        ? 'bg-warning-bg text-warning'
                        : 'bg-bg text-muted'
                    }
                  >
                    {REASON[r.reason] ?? r.reason}
                  </Pill>
                </td>
                <td className="px-4 py-3 text-[0.8125rem] font-extrabold">
                  {kes(toRefund(r))}
                  {r.cancellation_fee_kes ? (
                    <p className="text-muted mt-0.5 text-[0.6875rem] font-semibold">
                      of {kes(r.paid_kes)} paid; {kes(r.cancellation_fee_kes)} kept by the policy
                    </p>
                  ) : null}
                </td>
                <td className="text-muted px-4 py-3 text-[0.6875rem] font-semibold">
                  {r.provider !== undefined && (
                    <p className="text-ink font-extrabold">{paidVia(r.provider, r.is_test)}</p>
                  )}
                  <p className="text-ink mt-0.5 font-extrabold">{r.mpesa_receipt ?? DASH}</p>
                  <p className="mt-0.5">{r.payer_phone ?? DASH}</p>
                  <p className="mt-0.5">{r.payment_reference ?? ''}</p>
                </td>
                <td className="text-muted px-4 py-3 text-[0.6875rem] font-semibold">
                  <p className="text-ink">{r.guest_name ?? DASH}</p>
                  <p className="mt-0.5">{r.guest_email ?? DASH}</p>
                </td>
                <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                  {when(r.refund_due_at)}
                </td>
                <td className="px-4 py-3">
                  {r.refunded_at ? (
                    <div className="text-[0.6875rem] font-semibold">
                      <Pill tone="bg-success-bg text-success">Refunded {when(r.refunded_at)}</Pill>
                      <p className="mt-1 font-extrabold">{r.refund_reference}</p>
                      <p className="text-muted mt-0.5">{r.refunded_by ?? ''}</p>
                      {r.refund_note && <p className="text-muted mt-0.5">{r.refund_note}</p>}
                    </div>
                  ) : canRecord ? (
                    <DueRefund row={r} />
                  ) : (
                    <span className="text-muted text-[0.6875rem] font-semibold">Due</span>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <EmptyRow colSpan={7}>
                {filter === 'refunded'
                  ? 'No refunds recorded yet.'
                  : 'No refunds due. Nothing is owed to a guest.'}
              </EmptyRow>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="mt-5 p-5">
        <p className="text-[0.9375rem] font-extrabold">How a refund is done</p>
        <ul className="text-muted mt-3 space-y-2 text-[0.75rem] font-semibold leading-relaxed">
          <li>
            • A stay lands here when the guest paid after their hold ran out and the nights had gone
            to somebody else, or when NexG cancelled a paid booking.
          </li>
          <li>
            • Paid through Paystack: press the refund button. The money goes back the way it was
            paid, and the row moves to Refunded by itself once Paystack confirms it. Do not also
            send it by M-Pesa or bank.
          </li>
          <li>
            • Needs attention in Paystack, or Failed: check the refund in the Paystack dashboard
            before doing anything else.
          </li>
          <li>
            • If the dashboard shows it processed or failed and the row did not update, record that
            under the button. Processed marks the stay refunded; failed lets you send it again.
            While Paystack may still send a refund, it cannot be recorded as sent by M-Pesa or bank.
          </li>
          <li>
            • Not paid through Paystack: reverse the payment in the M-Pesa portal using the receipt
            shown, or send the amount back by B2C to the number it came from, or by bank. Then
            record the reference here. It is kept with the stay and audited.
          </li>
        </ul>
      </Card>
    </>
  );
}
