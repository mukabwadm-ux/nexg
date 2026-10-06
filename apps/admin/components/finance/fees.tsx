import * as React from 'react';

import { DASH } from '@/components/live/shared';

import { Empty, SectionTitle, kesMoney, money } from './shared';

/**
 * Fees and commissions.
 *
 * Two halves. What we charged, broken down by the account it
 * landed in — and what we charged each merchant against what
 * that merchant agreed to.
 *
 * The second half is the one with teeth. A commission rate is
 * agreed once and applied thousands of times by code that has
 * been changed since, and nobody finds out it drifted by reading
 * the contract.
 */

export interface FeeLineRow {
  day: string;
  city_id: string | null;
  city_name: string | null;
  account_code: string;
  account_name: string;
  amount_cents: number;
  order_count: number;
  per_order_cents: number | null;
}

export interface TakeRow {
  merchant_id: string;
  trading_name: string;
  commission_tier: string | null;
  agreed_pct: number | null;
  orders: number;
  commission_cents: number;
  revenue_cents: number;
  merchant_cents: number;
  effective_pct: number | null;
}

/**
 * Rolled up over the window.
 *
 * Order counts are summed per account and never across them:
 * one order contributes a delivery fee and a service fee and a
 * commission, so adding the three counts would triple it. There
 * is deliberately no grand total for the orders column.
 */
function rollUp(rows: FeeLineRow[]) {
  const by = new Map<string, { name: string; amount: number; orders: number }>();
  for (const r of rows) {
    const e = by.get(r.account_code) ?? { name: r.account_name, amount: 0, orders: 0 };
    e.amount += Number(r.amount_cents);
    e.orders += Number(r.order_count);
    by.set(r.account_code, e);
  }
  return [...by.entries()]
    .map(([code, e]) => ({ code, ...e }))
    .sort((a, b) => b.amount - a.amount);
}

export function Fees({
  lines,
  take,
  from,
  to,
}: {
  lines: FeeLineRow[];
  take: TakeRow[];
  from: string;
  to: string;
}) {
  const byAccount = rollUp(lines);
  const total = byAccount.reduce((a, r) => a + r.amount, 0);

  /*
   * A merchant is "drifting" when the rate actually taken is
   * more than half a point off the rate agreed. Half a point is
   * not arbitrary — it is wider than rounding on a single order
   * and narrower than any tier step in the pricing table, so it
   * catches a real divergence without flagging arithmetic.
   */
  const drifting = take.filter(
    (t) =>
      t.agreed_pct !== null &&
      t.effective_pct !== null &&
      Math.abs(Number(t.effective_pct) - Number(t.agreed_pct)) > 0.5,
  );

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle
          note={`Revenue by the account it was credited to, ${from} to ${to}. The order count is the denominator — a fee total without one cannot be read.`}
        >
          What we charged
        </SectionTitle>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Fee</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Share</th>
                <th className="px-4 py-2 text-right">Orders</th>
                <th className="px-4 py-2 text-right">Per order</th>
              </tr>
            </thead>
            <tbody>
              {byAccount.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <Empty>
                      No revenue was credited in this window. If orders were delivered in it, that
                      is a ledger problem rather than a quiet month.
                    </Empty>
                  </td>
                </tr>
              ) : (
                byAccount.map((r) => (
                  <tr
                    key={r.code}
                    className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-extrabold">{r.name}</span>
                      <span className="text-muted-light block font-mono text-[0.625rem]">
                        {r.code}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-extrabold tabular-nums">
                      {kesMoney(r.amount)}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {total > 0 ? `${((r.amount / total) * 100).toFixed(1)}%` : DASH}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">{r.orders}</td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {r.orders > 0 ? money(Math.round(r.amount / r.orders)) : DASH}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {byAccount.length > 0 ? (
              <tfoot className="border-border bg-bg border-t">
                <tr className="text-[0.8125rem] font-extrabold">
                  <td className="px-4 py-2.5">Total revenue</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{kesMoney(total)}</td>
                  <td colSpan={3} className="text-muted-light px-4 py-2.5 text-right text-[0.6875rem] font-semibold">
                    Orders are not totalled: one order appears under several fees.
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      <section>
        <SectionTitle note="What each merchant agreed to pay, against what was actually taken. These drift through tier changes and waivers.">
          Commission, agreed against taken
        </SectionTitle>

        {drifting.length > 0 ? (
          <p className="border-warn/40 bg-warn/5 text-warn mb-3 rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold">
            {drifting.length} merchant{drifting.length === 1 ? ' is' : 's are'} being charged more
            than half a point away from the rate on file. Each one is either a waiver nobody
            recorded or a rate nobody updated.
          </p>
        ) : null}

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Merchant</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2 text-right">Orders</th>
                <th className="px-4 py-2 text-right">Paid out</th>
                <th className="px-4 py-2 text-right">Commission</th>
                <th className="px-4 py-2 text-right">Agreed</th>
                <th className="px-4 py-2 text-right">Actual</th>
              </tr>
            </thead>
            <tbody>
              {take.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <Empty>
                      No commission has been charged. Nothing has been settled through the ledger
                      yet.
                    </Empty>
                  </td>
                </tr>
              ) : (
                take.map((t) => {
                  const drift =
                    t.agreed_pct !== null && t.effective_pct !== null
                      ? Number(t.effective_pct) - Number(t.agreed_pct)
                      : null;
                  const off = drift !== null && Math.abs(drift) > 0.5;
                  return (
                    <tr
                      key={t.merchant_id}
                      className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                        off ? 'bg-warn/5' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-extrabold">{t.trading_name}</td>
                      <td className="text-muted px-4 py-2.5">{t.commission_tier ?? DASH}</td>
                      <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                        {t.orders}
                      </td>
                      <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                        {kesMoney(t.merchant_cents)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-extrabold tabular-nums">
                        {kesMoney(t.commission_cents)}
                      </td>
                      <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                        {t.agreed_pct === null ? (
                          <span className="text-muted-light" title="No rate is recorded for this merchant">
                            not set
                          </span>
                        ) : (
                          `${Number(t.agreed_pct).toFixed(2)}%`
                        )}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-extrabold tabular-nums ${
                          off ? 'text-warn' : ''
                        }`}
                      >
                        {t.effective_pct === null
                          ? DASH
                          : `${Number(t.effective_pct).toFixed(2)}%`}
                        {drift !== null && off ? (
                          <span className="block text-[0.625rem] font-semibold">
                            {drift > 0 ? '+' : '−'}
                            {Math.abs(drift).toFixed(2)} pts
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
