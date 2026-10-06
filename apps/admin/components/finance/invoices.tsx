import * as React from 'react';

import { DASH } from '@/components/live/shared';

import { Empty, SectionTitle, Tile, kesMoney, shortDate } from './shared';

/**
 * Invoices.
 *
 * Hosts, hotels and merchants are billed by three different
 * pieces of code with three different column names, and this is
 * the one place where "who owes us, how much, and for how long"
 * is one list rather than three.
 *
 * Ordered oldest-overdue first, because that is the order the
 * work gets done in. Sorting by amount puts a large invoice
 * raised yesterday above a small one that has been ignored for
 * two months, and the second is the one that is actually going
 * bad.
 */

export interface InvoiceRow {
  party_kind: 'host' | 'hotel' | 'merchant';
  id: string;
  party_id: string;
  party_name: string | null;
  period: string;
  total_cents: number;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  overdue: boolean;
  bucket: string;
}

const KIND_LABEL: Record<InvoiceRow['party_kind'], string> = {
  host: 'Host',
  hotel: 'Hotel',
  merchant: 'Merchant',
};

const BUCKET_TONE: Record<string, string> = {
  paid: 'bg-success/10 text-success',
  'not yet due': 'bg-bg text-muted',
  'no due date set': 'bg-warn/10 text-warn',
  'overdue, under 30 days': 'bg-warn/10 text-warn',
  'overdue, 30 to 60 days': 'bg-danger/10 text-danger',
  'overdue, over 60 days': 'bg-danger text-white',
};

/* Oldest due date first among the overdue, then everything else
   by when it was raised. */
function worstFirst(a: InvoiceRow, b: InvoiceRow): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.overdue && b.overdue) {
    return new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime();
  }
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function Invoices({ rows }: { rows: InvoiceRow[] }) {
  const sorted = [...rows].sort(worstFirst);

  const outstanding = rows.filter((r) => !r.paid_at);
  const overdue = outstanding.filter((r) => r.overdue);
  const noDueDate = outstanding.filter((r) => r.due_at === null);

  const owedCents = outstanding.reduce((a, r) => a + Number(r.total_cents), 0);
  const overdueCents = overdue.reduce((a, r) => a + Number(r.total_cents), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Outstanding"
          value={kesMoney(owedCents)}
          note={`${outstanding.length} invoice${outstanding.length === 1 ? '' : 's'} unpaid`}
        />
        <Tile
          label="Overdue"
          value={kesMoney(overdueCents)}
          note={`${overdue.length} past its due date`}
          tone={overdue.length > 0 ? 'warn' : 'plain'}
        />
        <Tile
          label="Invoiced in all"
          value={kesMoney(rows.reduce((a, r) => a + Number(r.total_cents), 0))}
          note={`${rows.length} raised`}
        />
        <Tile
          label="No due date"
          value={String(noDueDate.length)}
          note="Cannot go overdue, so nobody chases them"
          tone={noDueDate.length > 0 ? 'warn' : 'plain'}
        />
      </div>

      {noDueDate.length > 0 ? (
        <p className="border-warn/40 bg-warn/5 text-warn rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold">
          {noDueDate.length} unpaid invoice{noDueDate.length === 1 ? ' has' : 's have'} no due date.
          An invoice with no due date never becomes overdue, never appears on a chase list, and is
          never written off — it simply stays.
        </p>
      ) : null}

      <section>
        <SectionTitle note="Oldest overdue first. That is the order the work gets done in.">
          Every invoice
        </SectionTitle>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Who</th>
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Due</th>
                <th className="px-4 py-2">Paid</th>
                <th className="px-4 py-2">Age</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <Empty>
                      Nothing has been invoiced. Host packages, hotel charge-to-room and merchant
                      statements all land here once they are raised.
                    </Empty>
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr
                    key={`${r.party_kind}-${r.id}`}
                    className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                      r.overdue ? 'bg-danger/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-extrabold">{r.party_name ?? 'name not recorded'}</span>
                      <span className="text-muted-light block text-[0.625rem] font-extrabold uppercase">
                        {KIND_LABEL[r.party_kind]}
                      </span>
                    </td>
                    <td className="text-muted px-4 py-2.5 text-[0.75rem]">{r.period}</td>
                    <td className="px-4 py-2.5 text-right font-extrabold tabular-nums">
                      {kesMoney(r.total_cents)}
                    </td>
                    <td className="text-muted px-4 py-2.5">{r.status}</td>
                    <td className="text-muted px-4 py-2.5">
                      {r.due_at ? shortDate(r.due_at) : <span className="text-warn">not set</span>}
                    </td>
                    <td className="text-muted px-4 py-2.5">
                      {r.paid_at ? shortDate(r.paid_at) : DASH}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                          BUCKET_TONE[r.bucket] ?? 'bg-bg text-muted'
                        }`}
                      >
                        {r.bucket}
                      </span>
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
