import { Card } from '@nexg/ui';

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
}

const REASON: Record<StayRefundRow['reason'], string> = {
  late_payment: 'Paid after the dates were taken',
  cancelled: 'Cancelled by NexG',
};

function shortDate(day: string) {
  return new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Stays that owe a guest their money back. Staff send the money back in the
 * M-Pesa portal (a reversal, using the receipt shown) and record the
 * reference here; the row then moves to Refunded.
 */
export function RefundsTab({
  rows,
  filter,
  canRecord,
}: {
  rows: StayRefundRow[];
  filter: string;
  canRecord: boolean;
}) {
  const due = rows.filter((r) => !r.refunded_at);
  const refunded = rows.filter((r) => r.refunded_at);
  const visible = filter === 'refunded' ? refunded : filter === 'all' ? rows : due;
  const owed = due.reduce((sum, r) => sum + (r.paid_kes ?? 0), 0);
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
                <td className="px-4 py-3 text-[0.8125rem] font-extrabold">{kes(r.paid_kes)}</td>
                <td className="text-muted px-4 py-3 text-[0.6875rem] font-semibold">
                  <p className="text-ink font-extrabold">{r.mpesa_receipt ?? DASH}</p>
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
                    <RecordRefund stayId={r.stay_id} amount={kes(r.paid_kes)} />
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
            • Reverse the payment in the M-Pesa portal using the receipt shown, or send the amount
            back by B2C to the number it came from.
          </li>
          <li>
            • Record the M-Pesa reference of the refund here. It is kept with the stay and audited.
          </li>
        </ul>
      </Card>
    </>
  );
}
