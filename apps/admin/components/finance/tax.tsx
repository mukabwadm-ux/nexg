import * as React from 'react';

import { Empty, SectionTitle, kesMoney } from './shared';

/**
 * Tax.
 *
 * This screen is short, and it is short because the honest
 * answer is short. Two things in this system carry a tax figure:
 * featured-placement fees, which have a VAT rate on their rate
 * card, and merchant statements, which carry withholding.
 *
 * Output VAT on delivery, service and concierge revenue is
 * configured nowhere. The screen says so, in the row where that
 * revenue appears, rather than leaving the line out. A tax
 * screen that silently omits its largest revenue category is
 * worse than no tax screen: an empty space reads as zero, and a
 * zero is a number somebody will act on.
 */

export interface TaxRow {
  sort: number;
  source: string;
  basis: string;
  base_cents: number;
  tax_cents: number | null;
  configured: boolean;
  rate_source: string;
}

export interface TaxDocRow {
  id: string;
  number: string;
  kind: string;
  purpose: string;
  party_name: string | null;
  party_pin: string | null;
  issued_at: string;
  net_cents: number;
  vat_cents: number;
  gross_cents: number;
  kra_status: string;
  kra_reference: string | null;
}

export interface VatMonthRow {
  month: string;
  documents: number;
  net_cents: number;
  vat_cents: number;
  pending_kra: number;
}

export function Tax({
  rows,
  docs = [],
  months = [],
}: {
  rows: TaxRow[];
  docs?: TaxDocRow[];
  months?: VatMonthRow[];
}) {
  const gaps = rows.filter((r) => !r.configured);
  const known = rows.filter((r) => r.configured);
  const taxKnown = known.reduce((a, r) => a + Number(r.tax_cents ?? 0), 0);
  const baseNotCovered = gaps.reduce((a, r) => a + Number(r.base_cents), 0);

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle note="Output VAT on commission and fees, from the numbered tax documents.">
          VAT by month
        </SectionTitle>
        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2 text-right">Documents</th>
                <th className="px-4 py-2 text-right">Before VAT</th>
                <th className="px-4 py-2 text-right">VAT</th>
                <th className="px-4 py-2 text-right">Awaiting KRA</th>
              </tr>
            </thead>
            <tbody>
              {months.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <Empty>No tax documents yet. They are issued when an order is paid.</Empty>
                  </td>
                </tr>
              ) : (
                months.map((m) => (
                  <tr key={m.month} className="border-border border-b text-[0.8125rem] font-semibold last:border-0">
                    <td className="px-4 py-2.5 font-extrabold">{m.month}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{m.documents}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{kesMoney(m.net_cents)}</td>
                    <td className="px-4 py-2.5 text-right font-extrabold tabular-nums">{kesMoney(m.vat_cents)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{m.pending_kra}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle note="Newest first. KRA status stays pending until an e-invoicing provider is connected.">
          Tax documents
        </SectionTitle>
        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[48rem] text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-2">Number</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2">For</th>
                <th className="px-4 py-2 text-right">Before VAT</th>
                <th className="px-4 py-2 text-right">VAT</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">KRA</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <Empty>Nothing issued yet.</Empty>
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id} className="border-border border-b text-[0.8125rem] font-semibold last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[0.75rem] font-extrabold">{d.number}</td>
                    <td className="px-4 py-2.5">
                      {d.party_name ?? '—'}
                      {d.party_pin ? <span className="text-muted-light"> · {d.party_pin}</span> : null}
                    </td>
                    <td className="text-muted px-4 py-2.5">
                      {d.purpose === 'merchant_commission' ? 'Commission' : 'Guest fees'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{kesMoney(d.net_cents)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{kesMoney(d.vat_cents)}</td>
                    <td className="px-4 py-2.5 text-right font-extrabold tabular-nums">{kesMoney(d.gross_cents)}</td>
                    <td className="px-4 py-2.5 capitalize">{d.kra_status.replace(/_/g, ' ')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {gaps.length > 0 ? (
        <div className="border-warn/40 bg-warn/5 rounded-xl border p-4">
          <p className="text-warn text-[0.8125rem] font-extrabold">
            {kesMoney(baseNotCovered)} of revenue has no tax treatment configured.
          </p>
          <p className="text-muted mt-1 text-[0.75rem] font-semibold">
            Nothing is computed for it, and nothing is assumed. Setting a rate is a decision for
            whoever signs the returns, not something this screen should guess — so the line is shown
            with the figure it would apply to and no tax against it.
          </p>
        </div>
      ) : null}

      <section>
        <SectionTitle note="What the books know about tax, including what they do not.">
          Tax position
        </SectionTitle>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Basis</th>
                <th className="px-4 py-2 text-right">Amount it applies to</th>
                <th className="px-4 py-2 text-right">Tax</th>
                <th className="px-4 py-2">Rate comes from</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <Empty>Nothing in the books carries a tax figure yet.</Empty>
                  </td>
                </tr>
              ) : (
                [...rows]
                  .sort((a, b) => a.sort - b.sort)
                  .map((r) => (
                    <tr
                      key={r.sort}
                      className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                        r.configured ? '' : 'bg-warn/5'
                      }`}
                    >
                      <td className="px-4 py-2.5 font-extrabold">{r.source}</td>
                      <td className="text-muted px-4 py-2.5 text-[0.75rem]">{r.basis}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {kesMoney(r.base_cents)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-extrabold tabular-nums">
                        {r.configured ? (
                          kesMoney(r.tax_cents)
                        ) : (
                          <span className="text-warn text-[0.75rem]">no rate set</span>
                        )}
                      </td>
                      <td className="text-muted-light px-4 py-2.5 font-mono text-[0.6875rem]">
                        {r.rate_source}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
            {known.length > 0 ? (
              <tfoot className="border-border bg-bg border-t">
                <tr className="text-[0.8125rem] font-extrabold">
                  <td colSpan={3} className="px-4 py-2.5">
                    Tax accounted for
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{kesMoney(taxKnown)}</td>
                  <td className="text-muted-light px-4 py-2.5 text-[0.6875rem] font-semibold">
                    {gaps.length > 0 ? 'Excludes the unconfigured line above' : 'All lines'}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      <section className="border-border bg-surface rounded-xl border p-4">
        <h3 className="text-[0.9375rem] font-extrabold tracking-tight">Before this is filed</h3>
        <ul className="text-muted mt-2 space-y-1.5 text-[0.8125rem] font-semibold">
          <li>
            · Output VAT on commission and fees is now charged at the configured rate (16%) and
            numbered on a tax document per order. The remaining decision for whoever signs the
            returns is whether NexG is the supplier or the agent for delivery.
          </li>
          <li>
            · eTIMS: whether each order needs an invoice transmitted, or whether a monthly summary
            is accepted, is a question for the tax advisor. Nothing here transmits anything.
          </li>
          <li>
            · Withholding on merchant payouts is recorded on each statement but is not yet
            aggregated into a return.
          </li>
        </ul>
        <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
          These are listed because a screen that shows only what it can compute teaches people it
          has computed everything.
        </p>
      </section>
    </div>
  );
}
