'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { reviewPaystackProblem } from '@/app/finance/paystack/actions';
import {
  cell,
  Empty,
  figure,
  hostHref,
  merchantHref,
  ModePill,
  Note,
  PartyLink,
  riderHref,
  sub,
  Table,
} from '@/components/finance/paystack-parts';
import { PanelHead, Pill, Sheet } from '@/components/portal/kit';
import { money, type Opens, type ProblemEvent, type Problems } from '@/lib/finance-paystack';
import { dateTime, type Tone } from '@/lib/portal';

const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  high: { label: 'High', tone: 'red' },
  notice: { label: 'Notice', tone: 'amber' },
  info: { label: 'Info', tone: 'grey' },
};

const PARTY: Record<keyof Opens, (id: string) => string> = {
  merchant: merchantHref,
  host: hostHref,
  rider: riderHref,
};

const isParty = (type: string | null): type is keyof Opens =>
  type === 'merchant' || type === 'host' || type === 'rider';

/** A detail of the event as words: cents as money, anything else as it came. */
function detail(key: string, value: unknown): string {
  if (key.endsWith('_cents') && typeof value === 'number') return money(value);
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/**
 * Paystack problems waiting for a person. Reviewed events are hidden unless
 * asked for; only full Finance or a super admin reviews one here, and nobody
 * reviews their own action.
 */
export function PaystackProblems({
  problems,
  canAct,
  opens,
  showReviewed,
  toggleHref,
}: {
  problems: Problems;
  canAct: boolean;
  opens: Opens;
  showReviewed: boolean;
  /** Shows reviewed events, or hides them again. */
  toggleHref: string;
}) {
  const open = problems.events.filter((e) => e.review_state !== 'reviewed');
  const shown = showReviewed ? problems.events : open;
  return (
    <>
      <Sheet>
        <PanelHead
          title="Needs a Person"
          aside={problems.open_events === null ? undefined : `${problems.open_events} open`}
        >
          <Link
            href={toggleHref}
            className="text-muted hover:text-ink text-sm font-bold underline underline-offset-4"
          >
            {showReviewed ? 'Hide reviewed' : 'Show reviewed'}
          </Link>
        </PanelHead>
        {problems.open_events !== null && problems.open_events > open.length && (
          <Note>
            Showing the newest {open.length} of {problems.open_events} open.
          </Note>
        )}
        {shown.length === 0 ? (
          <Empty>No Paystack problem is open.</Empty>
        ) : (
          <ul className="mt-4 space-y-2">
            {shown.map((e) => (
              <Event key={e.event_id} event={e} canAct={canAct} opens={opens} />
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet>
        <PanelHead title="Refunds to Decide" aside="who carries the merchant's part" />
        {problems.refunds_to_decide.length === 0 ? (
          <Empty>No refund is waiting for this decision.</Empty>
        ) : (
          <>
            <Table
              caption="Refunds waiting for a decision"
              heads={[
                'Merchant',
                'Order',
                { label: 'Refund', right: true },
                { label: 'Merchant Was Paid', right: true },
                'Asked',
              ]}
            >
              {problems.refunds_to_decide.map((r) => (
                <tr key={r.refund_id}>
                  <td className={cell}>
                    <PartyLink href={opens.merchant ? merchantHref(r.merchant_id) : null}>
                      {r.name ?? 'Merchant'}
                    </PartyLink>
                  </td>
                  <td className={cell}>
                    {r.order_reference ?? '—'} <ModePill test={r.test} />
                  </td>
                  <td className={figure}>{money(r.refund_cents)}</td>
                  <td className={figure}>{money(r.share_cents)}</td>
                  <td className={cell}>{dateTime(r.requested_at)}</td>
                </tr>
              ))}
            </Table>
            <Note>
              {opens.merchant
                ? 'Decide each on the merchant’s page.'
                : 'Each is decided on the merchant’s page, which your role cannot open. Ask a super admin.'}
            </Note>
          </>
        )}
      </Sheet>

      <Sheet>
        <PanelHead title="Invoiced, Not Yet Paid" aside="refunds merchants owe NexG" />
        {problems.invoiced_recoveries.length === 0 ? (
          <Empty>No invoiced refund is unpaid.</Empty>
        ) : (
          <>
            <Table
              caption="Invoiced recoveries not yet paid"
              heads={['Merchant', 'Order', { label: 'Amount', right: true }, 'Invoiced']}
            >
              {problems.invoiced_recoveries.map((r) => (
                <tr key={r.id}>
                  <td className={cell}>
                    <PartyLink href={opens.merchant ? merchantHref(r.merchant_id) : null}>
                      {r.name ?? 'Merchant'}
                    </PartyLink>
                  </td>
                  <td className={cell}>
                    {r.order_reference ?? '—'} <ModePill test={r.test} />
                    {r.note && <span className={sub}>{r.note}</span>}
                  </td>
                  <td className={figure}>{money(r.amount_cents)}</td>
                  <td className={cell}>{dateTime(r.decided_at)}</td>
                </tr>
              ))}
            </Table>
            <Note>
              {opens.merchant
                ? 'Mark each paid on the merchant’s page when the money arrives.'
                : 'Each is marked paid on the merchant’s page, which your role cannot open. Ask a super admin when the money arrives.'}
            </Note>
          </>
        )}
      </Sheet>

      <Sheet>
        <PanelHead title="Transfers Waiting for an OTP" aside="rider payouts" />
        {problems.otp_transfers.length === 0 ? (
          <Empty>No transfer is waiting for an OTP.</Empty>
        ) : (
          <>
            <Table
              caption="Rider transfers waiting for Paystack's OTP"
              heads={['Rider', 'Reference', { label: 'Amount', right: true }, 'Started']}
            >
              {problems.otp_transfers.map((t) => (
                <tr key={t.id}>
                  <td className={cell}>
                    <PartyLink href={opens.rider && t.rider_id ? riderHref(t.rider_id) : null}>
                      {t.rider_name ?? 'Rider'}
                    </PartyLink>
                  </td>
                  <td className={cell}>
                    {t.reference} <ModePill test={t.test} />
                  </td>
                  <td className={figure}>{money(t.amount_cents)}</td>
                  <td className={cell}>{dateTime(t.created_at)}</td>
                </tr>
              ))}
            </Table>
            <Note>
              Finish or cancel these in the Paystack dashboard, and turn off the transfer OTP there.
            </Note>
          </>
        )}
      </Sheet>
    </>
  );
}

function Event({ event, canAct, opens }: { event: ProblemEvent; canAct: boolean; opens: Opens }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [failed, setFailed] = React.useState<string | null>(null);
  const reviewed = event.review_state === 'reviewed';
  const severity = SEVERITY[event.severity];
  const type = event.target_type;
  const href =
    event.target_id && isParty(type) && opens[type] ? PARTY[type](event.target_id) : null;
  const details = Object.entries(event.details ?? {});

  async function mark() {
    setBusy(true);
    setFailed(null);
    try {
      const result = await reviewPaystackProblem(event.event_id, note);
      if (result.ok) router.refresh();
      else setFailed(result.message);
    } catch {
      setFailed('The console could not be reached. Try again.');
    }
    setBusy(false);
  }

  return (
    <li className="border-border rounded-xl border p-3.5">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {severity && <Pill tone={severity.tone}>{severity.label}</Pill>}
        <span className="font-extrabold">{event.action_label}</span>
        {event.target_label &&
          (href ? (
            <PartyLink href={href}>{event.target_label}</PartyLink>
          ) : (
            <span>{event.target_label}</span>
          ))}
        {event.review_state === 'escalated' && <Pill tone="purple">Escalated</Pill>}
      </p>
      <p className="text-muted mt-1 text-xs font-semibold">
        {dateTime(event.at)}
        {event.reason ? ` · ${event.reason}` : ''}
      </p>
      {details.length > 0 && (
        <details className="mt-1 text-xs font-semibold">
          <summary className="text-muted cursor-pointer font-bold">Details</summary>
          <dl className="mt-1 space-y-0.5">
            {details.map(([key, value]) => (
              <div key={key} className="flex flex-wrap gap-x-2">
                <dt className="text-muted">{key.replace(/_cents$/, '').replace(/_/g, ' ')}</dt>
                <dd className="min-w-0 break-all">{detail(key, value)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {reviewed ? (
        <p className="text-success mt-1 text-xs font-bold">
          Reviewed by {event.reviewed_by ?? 'someone'} · {dateTime(event.reviewed_at)}
          {event.review_note ? ` · ${event.review_note}` : ''}
        </p>
      ) : !canAct ? null : event.mine ? (
        <p className="mt-1 text-xs font-bold">Somebody else has to review your own action.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            aria-label={`Note on event ${event.event_id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was done (optional)"
            className="border-border-strong min-w-[10rem] flex-1 rounded-lg border px-3 py-1.5 text-[0.75rem] font-semibold"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void mark()}
            className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
          >
            Mark reviewed
          </button>
        </div>
      )}
      {failed && (
        <p role="status" className="text-danger mt-1 text-xs font-bold">
          {failed}
        </p>
      )}
    </li>
  );
}
