import Link from 'next/link';
import * as React from 'react';

import {
  Empty,
  SectionTitle,
  Tile,
  delta,
  kesMoney,
  money,
  pct,
  shortDate,
  signedMoney,
  stamp,
} from '@/components/finance/shared';
import { Verify } from '@/components/finance/verify';
import { DASH, Pill } from '@/components/live/shared';

export type OverviewRow = {
  city_id: string | null;
  city_name: string | null;
  orders: number;
  gross_cents: number;
  revenue_cents: number;
  rider_cost_cents: number;
  leakage_cents: number;
  refund_cents: number;
  net_cents: number;
  cash_collected_cents: number;
  prior_gross_cents: number;
  prior_revenue_cents: number;
  prior_net_cents: number;
  take_rate_bps: number | null;
};

export type FlowRow = {
  direction: 'in' | 'out';
  bucket: string;
  label: string;
  amount_cents: number;
};

export type RevenueRow = {
  account_code: string;
  label: string;
  amount_cents: number;
  prior_amount_cents: number;
  orders: number;
};

export type DecisionRow = {
  id: string;
  severity: 'blocking' | 'urgent' | 'attention';
  title: string;
  consequence: string;
  amount_cents: number | null;
  since: string | null;
  href: string | null;
};

export type CalendarRow = {
  id: string;
  due_on: string;
  kind: string;
  label: string;
  detail: string | null;
  amount_cents: number | null;
  state: 'upcoming' | 'in_progress' | 'done' | 'overdue';
  href: string | null;
};

export type OwedRow = {
  party_type: string;
  label: string;
  owed_cents: number;
  oldest_unsettled: string | null;
  entry_count: number;
};

type Badge = { label: string; tone: string };

/* Fallbacks are named constants rather than another lookup —
   indexing a record to find the default for a missing index is
   how the default itself ends up undefined. */
const SEVERITY_DEFAULT: Badge = { label: 'Attention', tone: 'bg-bg text-muted' };
const CAL_DEFAULT: Badge = { label: 'Upcoming', tone: 'bg-bg text-muted' };

const SEVERITY: Record<string, Badge> = {
  blocking: { label: 'Stops payouts', tone: 'bg-danger text-white' },
  urgent: { label: 'Urgent', tone: 'bg-warn/15 text-warn' },
  attention: { label: 'Attention', tone: 'bg-bg text-muted' },
};

const CAL_STATE: Record<string, Badge> = {
  done: { label: 'Done', tone: 'bg-success/15 text-success' },
  in_progress: { label: 'In progress', tone: 'bg-warn/15 text-warn' },
  overdue: { label: 'Overdue', tone: 'bg-danger text-white' },
  upcoming: { label: 'Upcoming', tone: 'bg-bg text-muted' },
};

/**
 * Money → Finance → Overview.
 *
 * Ordered by what a person does with it rather than by what is
 * easiest to total. The decisions list is first, because it is
 * the only part of this screen that asks for an action; the
 * figures below it are context for those decisions. A dashboard
 * that leads with totals and buries the problems reads well and
 * changes nothing.
 */
export function Overview({
  totals,
  cities,
  flow,
  revenue,
  decisions,
  calendar,
  owed,
  from,
  to,
}: {
  totals: OverviewRow | null;
  cities: OverviewRow[];
  flow: FlowRow[];
  revenue: RevenueRow[];
  decisions: DecisionRow[];
  calendar: CalendarRow[];
  owed: OwedRow[];
  from: string;
  to: string;
}) {
  const moneyIn = flow.filter((f) => f.direction === 'in');
  const moneyOut = flow.filter((f) => f.direction === 'out');
  const inTotal = moneyIn.reduce((a, f) => a + Number(f.amount_cents), 0);
  const outTotal = moneyOut.reduce((a, f) => a + Number(f.amount_cents), 0);

  return (
    <div className="space-y-8">
      {/* ─────────────────────────────────── what needs a person */}
      <section>
        <SectionTitle note="Each of these is still true tomorrow if nobody acts on it.">
          Needs a person
        </SectionTitle>

        {decisions.length === 0 ? (
          <div className="border-border bg-surface rounded-xl border">
            <Empty>
              Nothing is waiting on a decision. The nine ledger invariants are answering zero and
              every projection is current — which is what this looking empty is supposed to mean.
            </Empty>
          </div>
        ) : (
          <ul className="space-y-2">
            {decisions.map((d) => {
              const sev = SEVERITY[d.severity] ?? SEVERITY_DEFAULT;
              const body = (
                <div className="border-border bg-surface hover:border-ink flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={sev.tone}>{sev.label}</Pill>
                      <p className="text-[0.875rem] font-extrabold tracking-tight">{d.title}</p>
                    </div>
                    <p className="text-muted mt-1 text-[0.8125rem] font-semibold">{d.consequence}</p>
                  </div>
                  <div className="text-right">
                    {d.amount_cents !== null ? (
                      <p className="text-base font-extrabold tabular-nums">
                        {kesMoney(d.amount_cents)}
                      </p>
                    ) : null}
                    {d.since ? (
                      <p className="text-muted-light text-[0.6875rem] font-semibold">
                        since {stamp(d.since)}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
              return (
                <li key={d.id}>
                  {d.href ? (
                    <Link href={d.href} className="block">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ─────────────────────────────────────────── the figures */}
      <section>
        <SectionTitle
          note="Month to date, against the same days of the month before."
          right={<Verify from={from} to={to} />}
        >
          This month
        </SectionTitle>

        {!totals ? (
          <div className="border-border bg-surface rounded-xl border">
            <Empty>
              No money has moved this month. Not a loading state — the ledger has no entries dated
              in it.
            </Empty>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Gross"
              value={kesMoney(totals.gross_cents)}
              note={`${totals.orders} orders`}
              change={delta(totals.gross_cents, totals.prior_gross_cents)}
            />
            <Tile
              label="Revenue"
              value={kesMoney(totals.revenue_cents)}
              note={`take rate ${pct(totals.take_rate_bps)}`}
              change={delta(totals.revenue_cents, totals.prior_revenue_cents)}
            />
            <Tile
              label="Contribution"
              value={kesMoney(totals.net_cents)}
              /* Named for what it is. There is no overhead in the
                 ledger, so this is not profit, and a tile that
                 implies otherwise is how a board gets misled. */
              note="not profit — no overhead here"
              change={delta(totals.net_cents, totals.prior_net_cents)}
            />
            <Tile
              label="Leakage"
              value={kesMoney(totals.leakage_cents)}
              note="compensation, goodwill, write-offs"
              tone={totals.leakage_cents > 0 ? 'warn' : 'plain'}
            />
          </div>
        )}
      </section>

      {/* ──────────────────────────────── in, out, and by line */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle note="Both columns from the same entries, so they cannot drift apart.">
            Where money moved
          </SectionTitle>
          <div className="border-border bg-surface overflow-hidden rounded-xl border">
            {flow.length === 0 ? (
              <Empty>Nothing has moved this month.</Empty>
            ) : (
              <table className="w-full text-left">
                <tbody>
                  <tr className="border-border border-b">
                    <th
                      colSpan={2}
                      className="text-muted-light px-4 py-2 text-[0.625rem] font-extrabold tracking-wide uppercase"
                    >
                      In · {kesMoney(inTotal)}
                    </th>
                  </tr>
                  {moneyIn.map((f) => (
                    <tr key={f.bucket} className="border-border border-b last:border-0">
                      <td className="px-4 py-2 text-[0.8125rem] font-semibold">{f.label}</td>
                      <td className="px-4 py-2 text-right text-[0.8125rem] font-extrabold tabular-nums">
                        {money(f.amount_cents)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-border bg-bg border-y">
                    <th
                      colSpan={2}
                      className="text-muted-light px-4 py-2 text-[0.625rem] font-extrabold tracking-wide uppercase"
                    >
                      Out · {kesMoney(outTotal)}
                    </th>
                  </tr>
                  {moneyOut.length === 0 ? (
                    <tr>
                      <td colSpan={2}>
                        <Empty>Nothing has gone out or been booked as owed this month.</Empty>
                      </td>
                    </tr>
                  ) : (
                    moneyOut.map((f) => (
                      <tr key={f.bucket} className="border-border border-b last:border-0">
                        <td className="px-4 py-2 text-[0.8125rem] font-semibold">{f.label}</td>
                        <td className="px-4 py-2 text-right text-[0.8125rem] font-extrabold tabular-nums">
                          {money(f.amount_cents)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <SectionTitle note="Against the same number of days immediately before.">
            Revenue by line
          </SectionTitle>
          <div className="border-border bg-surface overflow-hidden rounded-xl border">
            {revenue.length === 0 ? (
              <Empty>No revenue has been recognised this month.</Empty>
            ) : (
              <table className="w-full text-left">
                <thead className="border-border bg-bg border-b">
                  <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                    <th className="px-4 py-2">Line</th>
                    <th className="px-4 py-2 text-right">This month</th>
                    <th className="px-4 py-2 text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.map((r) => {
                    const d = delta(Number(r.amount_cents), Number(r.prior_amount_cents));
                    return (
                      <tr key={r.account_code} className="border-border border-b last:border-0">
                        <td className="px-4 py-2.5 text-[0.8125rem] font-semibold">
                          {r.label}
                          {r.orders > 0 ? (
                            <span className="text-muted-light ml-1.5 text-[0.6875rem]">
                              · {r.orders} orders
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[0.8125rem] font-extrabold tabular-nums">
                          {money(r.amount_cents)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {d ? (
                            <span
                              className={`text-[0.6875rem] font-extrabold ${
                                d.up ? 'text-success' : 'text-danger'
                              }`}
                            >
                              {d.text}
                            </span>
                          ) : (
                            <span className="text-muted-light text-[0.6875rem] font-semibold">
                              {DASH}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* ──────────────────────────────── cities, owed, calendar */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle note="Unattributed is money whose city we could not resolve — a wiring fault, not a city.">
            By city
          </SectionTitle>
          <div className="border-border bg-surface overflow-hidden rounded-xl border">
            {cities.length === 0 ? (
              <Empty>No city has taken money this month.</Empty>
            ) : (
              <table className="w-full text-left">
                <thead className="border-border bg-bg border-b">
                  <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                    <th className="px-4 py-2">City</th>
                    <th className="px-4 py-2 text-right">Orders</th>
                    <th className="px-4 py-2 text-right">Gross</th>
                    <th className="px-4 py-2 text-right">Take</th>
                  </tr>
                </thead>
                <tbody>
                  {cities.map((c) => (
                    <tr key={c.city_id ?? 'none'} className="border-border border-b last:border-0">
                      <td className="px-4 py-2.5 text-[0.8125rem] font-semibold">
                        {c.city_name ?? (
                          <span className="text-danger font-extrabold">Unattributed</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[0.8125rem] font-semibold tabular-nums">
                        {c.orders}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[0.8125rem] font-extrabold tabular-nums">
                        {money(c.gross_cents)}
                      </td>
                      <td className="text-muted px-4 py-2.5 text-right text-[0.8125rem] font-semibold tabular-nums">
                        {pct(c.take_rate_bps)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <SectionTitle note="Standing balance per partner, excluding anything a run has already claimed.">
            Owed to partners
          </SectionTitle>
          <div className="border-border bg-surface overflow-hidden rounded-xl border">
            {owed.length === 0 ? (
              <Empty>Nothing is owed — every posted payable has been claimed by a run.</Empty>
            ) : (
              <table className="w-full text-left">
                <thead className="border-border bg-bg border-b">
                  <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                    <th className="px-4 py-2">Partner</th>
                    <th className="px-4 py-2">Oldest</th>
                    <th className="px-4 py-2 text-right">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {owed.map((o, i) => (
                    <tr key={`${o.party_type}-${i}`} className="border-border border-b last:border-0">
                      <td className="px-4 py-2.5 text-[0.8125rem] font-semibold">
                        {o.label}
                        <span className="text-muted-light ml-1.5 text-[0.6875rem]">
                          · {o.party_type}
                        </span>
                      </td>
                      <td className="text-muted px-4 py-2.5 text-[0.8125rem] font-semibold">
                        {shortDate(o.oldest_unsettled)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right text-[0.8125rem] font-extrabold tabular-nums ${
                          Number(o.owed_cents) < 0 ? 'text-danger' : ''
                        }`}
                      >
                        {signedMoney(o.owed_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <section>
        <SectionTitle note="Read from real runs and real filing dates, not a list anybody has to remember to update.">
          What falls due
        </SectionTitle>
        <div className="border-border bg-surface overflow-hidden rounded-xl border">
          {calendar.length === 0 ? (
            <Empty>Nothing falls due in the next six weeks.</Empty>
          ) : (
            <table className="w-full text-left">
              <tbody>
                {calendar.map((c) => {
                  const st = CAL_STATE[c.state] ?? CAL_DEFAULT;
                  return (
                    <tr key={c.id} className="border-border border-b last:border-0">
                      <td className="px-4 py-2.5 text-[0.8125rem] font-extrabold whitespace-nowrap tabular-nums">
                        {shortDate(c.due_on)}
                      </td>
                      <td className="px-4 py-2.5 text-[0.8125rem] font-semibold">
                        {c.href ? (
                          <Link href={c.href} className="hover:underline">
                            {c.label}
                          </Link>
                        ) : (
                          c.label
                        )}
                        {c.detail ? (
                          <span className="text-muted-light ml-1.5 text-[0.6875rem]">
                            · {c.detail}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[0.8125rem] font-extrabold tabular-nums">
                        {c.amount_cents !== null ? money(c.amount_cents) : DASH}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Pill tone={st.tone}>{st.label}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
