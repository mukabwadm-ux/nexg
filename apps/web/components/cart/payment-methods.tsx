'use client';

import { Check, Landmark, Lock, type LucideIcon, Smartphone } from 'lucide-react';
import * as React from 'react';

export type Method = 'mpesa_stk' | 'bank_transfer' | 'cash_on_delivery';

export interface MethodOption {
  value: Method;
  label: string;
  /** A few words under the label: what the method takes. */
  hint: string;
  icon: LucideIcon;
  /** False when the provider behind it is not connected yet. */
  ready: boolean;
}

/**
 * The checkout's payment methods, in the order they are offered.
 *
 * Pay on delivery is no longer offered: guests pay online before the order
 * goes to the merchant. `cash_on_delivery` stays in the type so orders placed
 * that way earlier still show and settle as before.
 */
export function methodOptions({
  mpesaReady,
  bankEnabled,
}: {
  mpesaReady: boolean;
  bankEnabled: boolean;
}): MethodOption[] {
  return [
    {
      value: 'mpesa_stk',
      label: 'M-Pesa',
      hint: 'Prompt to your phone',
      icon: Smartphone,
      ready: mpesaReady,
    },
    ...(bankEnabled
      ? [
          {
            value: 'bank_transfer' as const,
            label: 'Bank',
            hint: 'Approve at your bank',
            icon: Landmark,
            ready: true,
          },
        ]
      : []),
  ];
}

interface Details {
  title: string;
  lead: string;
  steps: string[];
  points: string[];
}

function details(
  method: Method,
  { phone, total, cashFee }: { phone: string; total: string | null; cashFee: string | null },
): Details {
  switch (method) {
    case 'mpesa_stk':
      return {
        title: 'Pay with M-Pesa',
        lead:
          phone.replace(/\D/g, '').length >= 9
            ? `We send a payment prompt to ${phone.trim()}.`
            : 'We send a payment prompt to the phone number you give above.',
        steps: [
          'Place your order.',
          'A prompt appears on your phone. Enter your M-Pesa PIN to pay.',
          'The payment page updates by itself when Safaricom confirms.',
        ],
        points: [
          'Nothing leaves your M-Pesa until you enter your PIN.',
          'No prompt? You can send it again from the payment page.',
        ],
      };
    case 'bank_transfer':
      return {
        title: 'Pay from your bank account',
        lead: 'You approve the payment on your bank’s own page.',
        steps: [
          'Place your order.',
          'Approve the payment at your bank.',
          'Your order is confirmed when the bank tells us it is paid.',
        ],
        points: [
          'NexG never sees your bank sign-in.',
          'If the bank declines, you can pay another way from the payment page.',
        ],
      };
    case 'cash_on_delivery':
      return {
        title: 'Pay when it arrives',
        lead: 'Nothing is paid now. You pay the rider in cash when your order is delivered.',
        steps: [
          'Place your order.',
          'The merchant prepares it and a rider brings it to you.',
          total ? `Pay the rider ${total} in cash.` : 'Pay the rider the total in cash.',
        ],
        points: [
          ...(cashFee ? [`The total includes a cash-handling fee of ${cashFee}.`] : []),
          'Not every merchant takes pay on delivery, and some limit it to smaller orders. If this order cannot be paid this way, the summary says so.',
        ],
      };
  }
}

export function PaymentMethods({
  options,
  value,
  onChange,
  phone,
  total,
  cashFee,
}: {
  options: MethodOption[];
  value: Method;
  onChange: (method: Method) => void;
  phone: string;
  /** The order total, formatted, once it is known. */
  total: string | null;
  /** The cash-handling fee, formatted, when one applies. */
  cashFee: string | null;
}) {
  const d = details(value, { phone, total, cashFee });
  const columns =
    options.length >= 4
      ? 'sm:grid-cols-4'
      : options.length === 3
        ? 'sm:grid-cols-3'
        : 'sm:grid-cols-2';

  return (
    <section
      className="border-border bg-surface rounded-2xl border p-5"
      aria-labelledby="payment-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="payment-heading" className="text-lg font-extrabold">
          Payment
        </h2>
        <span className="text-muted flex items-center gap-1.5 text-xs font-bold">
          <Lock aria-hidden="true" className="h-3.5 w-3.5" />
          Secure checkout
        </span>
      </div>

      <div className={`mt-3 grid grid-cols-2 gap-2 ${columns}`}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              disabled={!o.ready}
              aria-pressed={selected}
              className={`focus-visible:ring-gold flex min-h-[4.25rem] flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-55 ${
                selected
                  ? 'border-gold bg-gold-soft text-ink'
                  : 'border-border text-muted enabled:hover:border-ink'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-extrabold">
                <o.icon
                  aria-hidden="true"
                  className={`h-4 w-4 ${selected ? 'text-gold-text' : ''}`}
                />
                <span className={selected ? 'text-ink' : 'text-ink/80'}>{o.label}</span>
              </span>
              <span className="text-[0.6875rem] font-semibold leading-snug">
                {o.ready ? o.hint : 'Coming soon'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-border mt-4 border-t pt-4" aria-live="polite">
        <p className="text-[0.9375rem] font-extrabold">{d.title}</p>
        <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-relaxed">{d.lead}</p>

        <ol className="mt-4 space-y-2.5">
          {d.steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-[0.8125rem] font-semibold leading-snug">
              <span
                aria-hidden="true"
                className="bg-ink flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-extrabold text-white"
              >
                {i + 1}
              </span>
              <span className="pt-px">{step}</span>
            </li>
          ))}
        </ol>

        <ul className="mt-4 space-y-1.5">
          {d.points.map((point) => (
            <li
              key={point}
              className="text-muted flex gap-2 text-[0.75rem] font-semibold leading-snug"
            >
              <Check aria-hidden="true" className="text-success mt-px h-3.5 w-3.5 shrink-0" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
