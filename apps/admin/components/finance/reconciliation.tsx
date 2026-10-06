import * as React from 'react';

import { Empty, SectionTitle, kesMoney, signedMoney, shortDate, stamp } from './shared';

/**
 * Reconciliation.
 *
 * Three questions, in the order you would actually ask them.
 *
 * What is stuck? What disagrees? What arrived and did nothing?
 *
 * None of these are answerable from one source. A ledger that
 * agrees with itself proves nothing — the whole method here is
 * putting two independently-written records of the same money
 * beside each other and showing the gap.
 */

export interface ClearingRow {
  account_code: string;
  account_name: string;
  balance_cents: number;
  entry_count: number;
  oldest_at: string | null;
  under_1d_cents: number;
  d1_to_7_cents: number;
  over_7d_cents: number;
}

export interface ReconRow {
  day: string;
  provider: string;
  payment_count: number;
  provider_cents: number;
  ledger_cents: number;
  difference_cents: number;
}

export interface WebhookRow {
  id: string;
  provider: string;
  event: string;
  reference: string | null;
  received_at: string;
  signature_ok: boolean;
  handled: boolean;
  handled_note: string | null;
  payment_reference: string | null;
  amount_cents: number | null;
  payment_state: string | null;
  gap: string;
}

export function Reconciliation({
  clearing,
  recon,
  webhooks,
}: {
  clearing: ClearingRow[];
  recon: ReconRow[];
  webhooks: WebhookRow[];
}) {
  const stuck = clearing.filter((c) => c.over_7d_cents !== 0);
  const disagreeing = recon.filter((r) => r.difference_cents !== 0);

  return (
    <div className="space-y-8">
      {/* ─────────────────────────────────────── in flight */}
      <section>
        <SectionTitle note="A clearing balance is not wrong. It is only wrong once it is old.">
          Money in flight
        </SectionTitle>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Account</th>
                <th className="px-4 py-2 text-right">Balance</th>
                <th className="px-4 py-2 text-right">Entries</th>
                <th className="px-4 py-2 text-right">Under 1 day</th>
                <th className="px-4 py-2 text-right">1–7 days</th>
                <th className="px-4 py-2 text-right">Over 7 days</th>
                <th className="px-4 py-2">Oldest</th>
              </tr>
            </thead>
            <tbody>
              {clearing.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <Empty>
                      No clearing accounts are defined. That is a setup gap, not a quiet day.
                    </Empty>
                  </td>
                </tr>
              ) : (
                clearing.map((c) => (
                  <tr
                    key={c.account_code}
                    className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                      c.over_7d_cents !== 0 ? 'bg-danger/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-extrabold">{c.account_name}</span>
                      <span className="text-muted-light block font-mono text-[0.625rem]">
                        {c.account_code}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {kesMoney(c.balance_cents)}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {c.entry_count}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {signedMoney(c.under_1d_cents)}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {signedMoney(c.d1_to_7_cents)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-extrabold tabular-nums ${
                        c.over_7d_cents !== 0 ? 'text-danger' : 'text-muted-light'
                      }`}
                    >
                      {signedMoney(c.over_7d_cents)}
                    </td>
                    <td className="text-muted-light px-4 py-2.5 text-[0.75rem]">
                      {c.oldest_at ? stamp(c.oldest_at) : 'nothing open'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {stuck.length > 0 ? (
          <p className="text-danger mt-2 text-[0.75rem] font-extrabold">
            {stuck.length} account{stuck.length === 1 ? ' has' : 's have'} money that has been in
            flight for over a week. Each one is a payment or payout whose other half never arrived.
          </p>
        ) : null}
      </section>

      {/* ─────────────────────────────── provider vs ledger */}
      <section>
        <SectionTitle note="What the providers say against what the books say. Written by different code, on purpose.">
          Provider against ledger
        </SectionTitle>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Day</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2 text-right">Payments</th>
                <th className="px-4 py-2 text-right">Provider says</th>
                <th className="px-4 py-2 text-right">Ledger says</th>
                <th className="px-4 py-2 text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {recon.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <Empty>
                      No payments have settled and no cash has moved in the ledger. Nothing has been
                      collected yet — this is not a reconciliation that failed to run.
                    </Empty>
                  </td>
                </tr>
              ) : (
                recon.map((r) => (
                  <tr
                    key={`${r.day}-${r.provider}`}
                    className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                      r.difference_cents !== 0 ? 'bg-danger/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">{shortDate(r.day)}</td>
                    <td className="px-4 py-2.5 font-extrabold">{r.provider}</td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {r.payment_count}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {kesMoney(r.provider_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {kesMoney(r.ledger_cents)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-extrabold tabular-nums ${
                        r.difference_cents !== 0 ? 'text-danger' : 'text-success'
                      }`}
                    >
                      {r.difference_cents === 0 ? 'matches' : signedMoney(r.difference_cents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {disagreeing.length > 0 ? (
          <p className="text-danger mt-2 text-[0.75rem] font-extrabold">
            {disagreeing.length} day{disagreeing.length === 1 ? '' : 's'} do not reconcile. A
            positive difference is money a provider says it took that the books never recorded; a
            negative one is the reverse.
          </p>
        ) : null}
      </section>

      {/* ───────────────────────────────────── dead callbacks */}
      <section>
        <SectionTitle note="A callback that changed nothing is silent in the product. It exists only if somebody looks.">
          Callbacks that did nothing
        </SectionTitle>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Received</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">Payment</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">What is wrong</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <Empty>
                      Every callback that arrived was verified and acted on. If no provider is live
                      yet, that is also what this looks like.
                    </Empty>
                  </td>
                </tr>
              ) : (
                webhooks.map((w) => (
                  <tr
                    key={w.id}
                    className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                  >
                    <td className="px-4 py-2.5">{stamp(w.received_at)}</td>
                    <td className="px-4 py-2.5 font-extrabold">{w.provider}</td>
                    <td className="text-muted px-4 py-2.5 font-mono text-[0.75rem]">{w.event}</td>
                    <td className="text-muted px-4 py-2.5 font-mono text-[0.75rem]">
                      {w.payment_reference ?? w.reference ?? 'no payment matched'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {kesMoney(w.amount_cents)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                          w.signature_ok
                            ? 'bg-warn/10 text-warn'
                            : 'bg-danger/10 text-danger'
                        }`}
                      >
                        {w.gap}
                      </span>
                      {w.handled_note ? (
                        <span className="text-muted-light mt-0.5 block text-[0.6875rem]">
                          {w.handled_note}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
