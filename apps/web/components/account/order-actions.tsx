'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc: Rpc = (fn, args) => Promise.resolve((createClient().rpc as unknown as Rpc)(fn, args));

const button =
  'inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const field =
  'border-border w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-[#b8901f]';

/**
 * What a customer can do with their own order (20 Nov 2026): cancel it before paying, rate it
 * once delivered, and report a problem at any time. Each is one database call that checks the
 * order is theirs (rpc_order_cancel_mine, rpc_order_rate, rpc_my_support_ticket_create).
 */
export function OrderActions({
  orderId,
  reference,
  canCancel,
  canRate,
  rated,
}: {
  orderId: string;
  reference: string;
  canCancel: boolean;
  canRate: boolean;
  rated: number | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [said, setSaid] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [stars, setStars] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [reporting, setReporting] = React.useState(false);
  const [problem, setProblem] = React.useState('');

  const run = (
    call: () => Promise<{ data: unknown; error: { message: string } | null }>,
    okText: string,
  ) =>
    start(async () => {
      setSaid(null);
      const { data, error } = await call();
      if (error) {
        setSaid({ ok: false, text: error.message });
        return;
      }
      const note = (data as { note?: string; reference?: string } | null)?.note;
      setSaid({ ok: true, text: note ?? okText });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      {canRate && (
        <section
          id="rate"
          aria-labelledby="rate-h"
          className="border-border flex flex-col gap-3 rounded-2xl border bg-white p-5"
        >
          <h2 id="rate-h" className="text-lg font-extrabold">
            How was it?
          </h2>
          <fieldset className="flex gap-1.5">
            <legend className="sr-only">Stars, from 1 to 5</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={stars >= n}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                onClick={() => setStars(n)}
                className={`h-11 w-11 rounded-full border text-lg font-extrabold ${
                  stars >= n
                    ? 'border-[#fdd128] bg-[#fdd128] text-[#141414]'
                    : 'border-border text-muted bg-white'
                }`}
              >
                ★
              </button>
            ))}
          </fieldset>
          <label className="block">
            <span className="text-sm font-bold">Anything to add? (optional)</span>
            <textarea
              className={`${field} mt-1.5 min-h-20`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
            />
          </label>
          <button
            type="button"
            disabled={pending || stars === 0}
            onClick={() =>
              run(
                () =>
                  rpc('rpc_order_rate', {
                    p_order_id: orderId,
                    p_stars: stars,
                    p_comment: comment || null,
                  }),
                'Thank you for rating.',
              )
            }
            className={`${button} self-start bg-[#fdd128] text-[#141414]`}
          >
            Send rating
          </button>
        </section>
      )}
      {rated !== null && (
        <p className="text-muted text-sm">You rated this order {rated} out of 5. Thank you.</p>
      )}

      <section
        aria-labelledby="help-h"
        className="border-border flex flex-col gap-3 rounded-2xl border bg-white p-5"
      >
        <h2 id="help-h" className="text-lg font-extrabold">
          Need help with this order?
        </h2>
        <div className="flex flex-wrap gap-2">
          {canCancel && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm('Cancel this order? Nothing has been charged.')) return;
                run(
                  () => rpc('rpc_order_cancel_mine', { p_order_id: orderId, p_reason: null }),
                  'Cancelled.',
                );
              }}
              className={`${button} border-border border bg-white text-[#141414]`}
            >
              Cancel order
            </button>
          )}
          <button
            type="button"
            onClick={() => setReporting((v) => !v)}
            aria-expanded={reporting}
            className={`${button} bg-[#141414] text-white`}
          >
            Report a problem
          </button>
        </div>
        {reporting && (
          <div className="flex flex-col gap-2">
            <label className="block">
              <span className="text-sm font-bold">What went wrong?</span>
              <textarea
                className={`${field} mt-1.5 min-h-24`}
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder="Missing or wrong items, late, damaged, charged wrongly…"
                maxLength={2000}
              />
            </label>
            <button
              type="button"
              disabled={pending || problem.trim().length < 5}
              onClick={() =>
                run(
                  () =>
                    rpc('rpc_my_support_ticket_create', {
                      p_body: problem.trim(),
                      p_topic: 'order_problem',
                      p_order_reference: reference,
                      p_details: { source: 'web_order_page' },
                    }),
                  'Sent. Our team replies by email and SMS, usually within a working day.',
                )
              }
              className={`${button} self-start bg-[#fdd128] text-[#141414]`}
            >
              Send to NexG support
            </button>
          </div>
        )}
        {said && (
          <p
            role="status"
            className={`text-sm font-bold ${said.ok ? 'text-green-800' : 'text-[#b42318]'}`}
          >
            {said.text}
          </p>
        )}
      </section>
    </div>
  );
}
