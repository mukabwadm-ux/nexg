'use client';

import * as React from 'react';

import { setAcceptingOrders } from '@/app/merchant/actions';

/**
 * Start or pause new orders, from Home.
 *
 * Approval makes a business live with orders switched off, so a new
 * merchant's first job on Home is this button. It used to be nowhere: the
 * header's state control is read-only and the old trading panel that had
 * the switch is no longer on any page, so staff had to switch every new
 * merchant on. It calls the same audited control the admin uses
 * (`rpc_merchant_control`), recorded as the merchant's own change.
 */
export function OrdersSwitch({
  merchantId,
  accepting,
}: {
  merchantId: string;
  accepting: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  function change() {
    let reason = 'Started taking orders from Home';
    if (accepting) {
      const answer = window.prompt(
        'Pause new orders?\n\nGuests cannot place new orders until you start again. Orders already placed are not affected.\n\nWhy are you pausing? (optional)',
        '',
      );
      if (answer === null) return;
      reason = answer.trim() || 'Paused new orders from Home';
    }
    startTransition(async () => {
      setMessage(null);
      const result = await setAcceptingOrders(merchantId, !accepting, reason);
      setMessage(
        result.ok
          ? {
              ok: true,
              text: accepting
                ? 'Paused. Guests cannot order until you start again.'
                : 'You are taking orders.',
            }
          : { ok: false, text: result.message || 'That did not save. Try again.' },
      );
    });
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={change}
        disabled={pending}
        className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-[12px] font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${
          accepting
            ? 'border-border-strong text-ink hover:bg-bg border'
            : 'bg-gold text-ink hover:brightness-95'
        }`}
      >
        {pending ? 'Saving…' : accepting ? 'Pause new orders' : 'Start taking orders'}
      </button>
      {message ? (
        <span
          role="status"
          className={`text-[12px] font-bold ${message.ok ? 'text-green-800' : 'text-danger'}`}
        >
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
