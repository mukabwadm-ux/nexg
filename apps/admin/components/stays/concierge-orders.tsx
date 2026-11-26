import { ResendLinkButton } from '@/components/stays/concierge';
import { Chip } from '@/components/stays/module';
import { kesFull, shortDate } from '@/lib/stays-module';

export interface ConciergeOrderRow {
  order_id: string;
  reference: string;
  at: string;
  kes: number;
  stage: string;
  payment_status: string;
  merchant: string | null;
  items: string | null;
  link_expires_at: string;
  link_sent_at: string;
  sent_to: string[] | null;
  link_opened: boolean;
  pay_state: 'paid' | 'cancelled' | 'expired' | 'paying' | 'awaiting';
}

const PAY_STATE: Record<ConciergeOrderRow['pay_state'], { text: string; status: string }> = {
  paid: { text: 'Paid', status: 'resolved' },
  paying: { text: 'Paying now', status: 'pending' },
  awaiting: { text: 'Awaiting payment', status: 'pending' },
  expired: { text: 'Link expired', status: 'cancelled' },
  cancelled: { text: 'Cancelled, nothing owed', status: 'cancelled' },
};

/** The stay's concierge orders on its Services tab, with where each payment stands. */
export function ConciergeOrders({ rows }: { rows: ConciergeOrderRow[] }) {
  return (
    <>
      <h3 className="mt-4 text-[0.9375rem] font-extrabold">Ordered by NexG Concierge</h3>
      {rows.length === 0 ? (
        <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
          Nothing ordered for this guest from the console yet.
        </p>
      ) : (
        <ul className="mt-1">
          {rows.map((o) => {
            const state = PAY_STATE[o.pay_state] ?? PAY_STATE.awaiting;
            const open =
              o.pay_state === 'awaiting' || o.pay_state === 'paying' || o.pay_state === 'expired';
            return (
              <li
                key={o.order_id}
                className="border-border border-b py-2 text-[0.875rem] last:border-b-0"
              >
                <span className="flex justify-between gap-3">
                  <span className="font-semibold">
                    {o.merchant ?? 'Merchant'}{' '}
                    <span className="text-muted">
                      ({o.reference} · {shortDate(o.at)})
                    </span>
                  </span>
                  <span className="font-bold tabular-nums">{kesFull(o.kes)}</span>
                </span>
                {o.items && (
                  <span className="text-muted block text-[0.8125rem] font-semibold">{o.items}</span>
                )}
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <Chip status={state.status} text={state.text} />
                  {o.pay_state === 'awaiting' && (
                    <span className="text-muted text-[0.75rem] font-semibold">
                      Link sent {shortDate(o.link_sent_at)} to{' '}
                      {(o.sent_to ?? []).join(', ') || 'the guest'}
                      {o.link_opened ? ' · opened' : ''} · expires {shortDate(o.link_expires_at)}
                    </span>
                  )}
                  {open && o.stage === 'placed' && <ResendLinkButton orderId={o.order_id} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
