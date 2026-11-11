'use client';

import { Check, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/** What rpc_rider_kit_status returns. */
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
    issued_at: string | null;
  } | null;
}

const kes = (amount: number) => `KES ${amount.toLocaleString('en-KE')}`;
const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-KE', { dateStyle: 'medium', timeZone: 'Africa/Nairobi' });

/**
 * The NexG rider kit: order it, choose how to get it, and follow it through
 * paid and handed over. Payment happens in person at the onboarding session,
 * where rider ops records it; the account goes live once it is paid and
 * issued.
 */
export function RiderKit({ riderId, status }: { riderId: string; status: RiderKitStatus | null }) {
  const router = useRouter();
  const order = status?.order ?? null;
  const issued = Boolean(status?.issued_at || order?.status === 'issued');
  const paid = issued || order?.status === 'paid';
  const [handOver, setHandOver] = React.useState<'collect' | 'deliver'>(
    order?.hand_over ?? 'collect',
  );
  const [address, setAddress] = React.useState(order?.delivery_address ?? '');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const price = order?.price_kes ?? status?.kit.price_kes ?? null;
  const contents = status?.kit.contents?.trim() || 'NexG branded rider kit';

  async function save() {
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().rpc('rpc_rider_kit_order', {
      p_rider_id: riderId,
      p_hand_over: handOver,
      p_delivery_address: handOver === 'deliver' ? address : undefined,
    });
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: error.message });
      return;
    }
    setMessage({ ok: true, text: order ? 'Your kit order is updated.' : 'Your kit is ordered.' });
    router.refresh();
  }

  const steps = [
    {
      label: 'Ordered',
      done: Boolean(order),
      note: order ? 'From your dashboard' : 'Choose below',
    },
    {
      label: 'Paid at onboarding',
      done: paid,
      note: paid && order?.paid_at ? when(order.paid_at) : 'In person, at your onboarding session',
    },
    {
      label: handOver === 'deliver' ? 'Delivered' : 'Collected',
      done: issued,
      note: issued && status?.issued_at ? when(status.issued_at) : 'Then your account can go live',
    },
  ];

  return (
    <div className="space-y-5">
      <section className="border-border bg-surface rounded-2xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="bg-gold-soft text-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <Package className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[0.9375rem] font-extrabold">NexG rider kit</h2>
              <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.6]">
                {contents}
              </p>
            </div>
          </div>
          <p className="text-[0.9375rem] font-extrabold">
            {price !== null ? kes(price) : 'Price confirmed at onboarding'}
          </p>
        </div>
        <p className="text-muted mt-3 text-[0.8125rem] font-semibold leading-[1.6]">
          Every rider buys the kit before their account goes live. You pay for it in person at your
          onboarding session.
        </p>

        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {steps.map((step) => (
            <li
              key={step.label}
              className={`rounded-xl border p-3 ${step.done ? 'border-success/40 bg-success-bg' : 'border-border'}`}
            >
              <p className="flex items-center gap-1.5 text-[0.8125rem] font-extrabold">
                {step.done ? <Check className="text-success h-4 w-4" aria-hidden="true" /> : null}
                {step.label}
              </p>
              <p className="text-muted mt-1 text-[0.75rem] font-semibold">{step.note}</p>
            </li>
          ))}
        </ol>
      </section>

      {!issued && (
        <section className="border-border bg-surface rounded-2xl border p-5">
          <h2 className="text-[0.9375rem] font-extrabold">How do you want to get it?</h2>
          <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Hand-over</legend>
            {(
              [
                ['collect', 'Collect at my onboarding session', 'Pick it up when you pay.'],
                ['deliver', 'Deliver it to me', 'NexG brings it to the address you give.'],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                  handOver === value ? 'border-ink' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="hand_over"
                  value={value}
                  checked={handOver === value}
                  onChange={() => setHandOver(value)}
                  className="accent-gold mt-1"
                />
                <span>
                  <span className="block text-[0.8125rem] font-extrabold">{label}</span>
                  <span className="text-muted block text-[0.75rem] font-semibold">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {handOver === 'deliver' && (
            <label className="mt-3 block">
              <span className="text-[0.8125rem] font-bold">Delivery address</span>
              <textarea
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Building, street, area and a landmark"
                className="border-border bg-surface focus:border-gold mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
              />
            </label>
          )}
          <button
            type="button"
            disabled={busy || (handOver === 'deliver' && address.trim().length < 5)}
            onClick={() => void save()}
            className="bg-gold text-ink mt-4 rounded-lg px-4 py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
          >
            {busy ? 'Saving…' : order ? 'Update my kit order' : 'Order my rider kit'}
          </button>
          {message ? (
            <p
              role={message.ok ? 'status' : 'alert'}
              className={`mt-3 rounded-lg px-3 py-2 text-[0.75rem] font-bold ${
                message.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
              }`}
            >
              {message.text}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
