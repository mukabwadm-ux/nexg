'use client';

import { Card } from '@nexg/ui';
import * as React from 'react';

import { issueRiderKit, markRiderKitPaid } from '@/app/riders/actions';

export interface RiderKitStatus {
  kit: { contents: string | null; price_kes: number | null };
  issued_at: string | null;
  order: {
    hand_over: 'collect' | 'deliver';
    delivery_address: string | null;
    price_kes: number | null;
    status: 'ordered' | 'paid' | 'issued';
    paid_at: string | null;
    paid_amount_kes: number | null;
    paid_method: string | null;
    paid_reference: string | null;
  } | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  });

const input =
  'border-border bg-surface focus:border-gold w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none';

/**
 * The NexG rider kit for one rider: what they ordered, recording the
 * in-person payment at onboarding, and marking it handed over. The database
 * refuses to mark a kit issued before it is paid, and activation needs an
 * issued kit (or a written override).
 */
export function RiderKitPanel({
  riderId,
  status,
}: {
  riderId: string;
  status: RiderKitStatus | null;
}) {
  const order = status?.order ?? null;
  const issued = Boolean(status?.issued_at || order?.status === 'issued');
  const paid = issued || order?.status === 'paid';
  const [method, setMethod] = React.useState('cash');
  const [amount, setAmount] = React.useState(
    String(order?.price_kes ?? status?.kit.price_kes ?? ''),
  );
  const [reference, setReference] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true);
    setResult(null);
    setResult(await action());
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Rider kit</h2>
      <dl className="mt-3 space-y-2 text-sm">
        {[
          [
            'Order',
            order
              ? order.hand_over === 'deliver'
                ? `Deliver to: ${order.delivery_address ?? '—'}`
                : 'Collect at onboarding'
              : 'Not ordered online yet',
          ],
          [
            'Price',
            order?.price_kes != null || status?.kit.price_kes != null
              ? `KES ${(order?.price_kes ?? status?.kit.price_kes ?? 0).toLocaleString('en-KE')}`
              : 'Not set (Settings → payments.rider_kit_price_kes)',
          ],
          [
            'Paid',
            paid && order?.paid_at
              ? `${order.paid_method === 'waived' ? 'Waived' : `KES ${(order.paid_amount_kes ?? 0).toLocaleString('en-KE')} · ${order.paid_method}`}${order.paid_reference ? ` · ${order.paid_reference}` : ''} · ${when(order.paid_at)}`
              : 'Not yet',
          ],
          ['Handed over', status?.issued_at ? when(status.issued_at) : 'Not yet'],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted-light shrink-0 font-semibold">{label}</dt>
            <dd className="text-right font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {!paid && (
        <div className="border-border mt-4 space-y-2 border-t pt-4">
          <p className="text-xs font-extrabold uppercase tracking-wide">Record payment</p>
          <select
            aria-label="Payment method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            className={input}
          >
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="card">Card</option>
            <option value="waived">Waived</option>
          </select>
          {method !== 'waived' && (
            <input
              aria-label="Amount paid (KES)"
              inputMode="numeric"
              placeholder="Amount paid (KES)"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
              className={input}
            />
          )}
          <input
            aria-label="Reference"
            placeholder={
              method === 'mpesa' ? 'M-Pesa reference (required)' : 'Reference (optional)'
            }
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={80}
            className={input}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(() =>
                markRiderKitPaid(riderId, {
                  method,
                  amountKes: method === 'waived' || amount === '' ? null : Number(amount),
                  reference,
                }),
              )
            }
            className="bg-gold text-ink w-full rounded-lg px-3 py-2 text-sm font-extrabold disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Record kit payment'}
          </button>
        </div>
      )}

      {paid && !issued && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => issueRiderKit(riderId))}
          className="bg-ink mt-4 w-full rounded-lg px-3 py-2 text-sm font-extrabold text-white disabled:opacity-40"
        >
          {busy
            ? 'Saving…'
            : order?.hand_over === 'deliver'
              ? 'Mark kit delivered'
              : 'Mark kit collected'}
        </button>
      )}

      {result ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${
            result.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {result.message}
        </p>
      ) : null}
    </Card>
  );
}
