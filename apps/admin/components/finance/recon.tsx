'use client';

import { DataTable, EmptyState, type ColumnDef } from '@nexg/ui';
import { Scale } from 'lucide-react';
import * as React from 'react';

import { ExportButton, FilterSelect, SearchBox, useShowMore } from '@/components/portal/client-kit';
import { Pill } from '@/components/portal/kit';
import { channelLabel } from '@/lib/finance';
import { day, kes, shillings } from '@/lib/portal';

/** One provider's payments on one day against the ledger's cash that day. */
export interface ReconDay {
  key: string;
  reference: string;
  day: string;
  provider: string;
  payments: number;
  expected_cents: number;
  ledger_cents: number;
  variance_cents: number;
}

function sourceLabel(provider: string) {
  return provider === 'ledger only' ? 'Ledger Only' : channelLabel(provider);
}

/**
 * Reconciliation details: what the payment provider recorded as paid each
 * day beside what the ledger booked to cash, and the gap. The ledger side
 * is per day, so when two providers share a day it is shown on each.
 */
export function ReconDetailsTable({
  rows,
  title = 'Reconciliation Details',
}: {
  rows: ReconDay[];
  title?: string;
}) {
  const [q, setQ] = React.useState('');
  const [source, setSource] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const term = q.trim().toLowerCase().replace(/,/g, '');
  const sources = [...new Set(rows.map((r) => r.provider))];
  const shown = rows.filter(
    (r) =>
      (source === 'all' || r.provider === source) &&
      (status === 'all' || (status === 'ok' ? r.variance_cents === 0 : r.variance_cents !== 0)) &&
      (!term ||
        `${r.reference} ${sourceLabel(r.provider)} ${Math.round(r.expected_cents / 100)} ${Math.round(r.variance_cents / 100)}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || source !== 'all' || status !== 'all';
  const { shown: page, more } = useShowMore(shown, 25);

  const columns: ColumnDef<ReconDay, unknown>[] = [
    {
      id: 'reference',
      accessorFn: (r) => r.reference,
      header: 'Reference',
      cell: ({ row: { original: r } }) => (
        <span className="whitespace-nowrap font-semibold tabular-nums">{r.reference}</span>
      ),
    },
    {
      id: 'day',
      accessorFn: (r) => r.day,
      header: 'Day',
      cell: ({ row: { original: r } }) => (
        <span className="whitespace-nowrap tabular-nums">{day(r.day)}</span>
      ),
    },
    {
      id: 'source',
      accessorFn: (r) => sourceLabel(r.provider),
      header: 'Source',
      cell: ({ row: { original: r } }) => (
        <Pill tone={r.provider === 'ledger only' ? 'grey' : 'gold'}>{sourceLabel(r.provider)}</Pill>
      ),
    },
    {
      id: 'payments',
      accessorFn: (r) => r.payments,
      header: 'Payments',
      cell: ({ row: { original: r } }) => (
        <span className="tabular-nums">{r.payments.toLocaleString('en-KE')}</span>
      ),
    },
    {
      id: 'expected',
      accessorFn: (r) => r.expected_cents,
      header: 'Provider (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="font-semibold tabular-nums">{shillings(r.expected_cents)}</span>
      ),
    },
    {
      id: 'ledger',
      accessorFn: (r) => r.ledger_cents,
      header: 'Ledger (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="font-semibold tabular-nums">{shillings(r.ledger_cents)}</span>
      ),
    },
    {
      id: 'variance',
      accessorFn: (r) => r.variance_cents,
      header: 'Variance (KES)',
      cell: ({ row: { original: r } }) => (
        <span
          className={`font-bold tabular-nums ${r.variance_cents === 0 ? 'text-muted' : 'text-danger'}`}
        >
          {r.variance_cents === 0
            ? '0'
            : `${r.variance_cents > 0 ? '+' : '−'}${shillings(Math.abs(r.variance_cents))}`}
        </span>
      ),
    },
    {
      id: 'status',
      accessorFn: (r) => (r.variance_cents === 0 ? 'Reconciled' : 'Variance'),
      header: 'Status',
      cell: ({ row: { original: r } }) =>
        r.variance_cents === 0 ? (
          <Pill tone="green" dot>
            Reconciled
          </Pill>
        ) : (
          <Pill tone="red" dot>
            Variance
          </Pill>
        ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">{title}</h2>
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search by reference or amount…"
            label="Search reconciliation"
            className="w-full sm:w-64"
          />
          <FilterSelect
            label="Source"
            value={source}
            onChange={setSource}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All Sources' },
              ...sources.map((s) => ({ value: s, label: sourceLabel(s) })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'ok', label: 'Reconciled' },
              { value: 'variance', label: 'Variance' },
            ]}
          />
          <ExportButton
            filename="nexg-reconciliation.csv"
            rows={() => [
              [
                'Reference',
                'Day',
                'Source',
                'Payments',
                'Provider (KES)',
                'Ledger (KES)',
                'Variance (KES)',
                'Status',
              ],
              ...shown.map((r) => [
                r.reference,
                r.day,
                sourceLabel(r.provider),
                r.payments,
                r.expected_cents / 100,
                r.ledger_cents / 100,
                r.variance_cents / 100,
                r.variance_cents === 0 ? 'Reconciled' : 'Variance',
              ]),
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Scale className="h-5 w-5" />}
          title={filtered ? 'Nothing matches' : 'Nothing to reconcile in this period'}
          description={
            filtered
              ? 'Try another search, source or status.'
              : 'Each day with paid payments or cash in the ledger appears here, the provider beside the ledger. Try a longer period.'
          }
          {...(filtered
            ? {
                action: {
                  label: 'Clear Filters',
                  onClick: () => {
                    setQ('');
                    setSource('all');
                    setStatus('all');
                  },
                },
              }
            : {})}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable caption={title} columns={columns} data={page} />
          </div>
          <ul className="divide-border border-border divide-y overflow-hidden rounded-2xl border md:hidden">
            {page.map((r) => (
              <li key={r.key} className="bg-white px-3 py-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{day(r.day)}</span>
                  {r.variance_cents === 0 ? (
                    <Pill tone="green" dot>
                      Reconciled
                    </Pill>
                  ) : (
                    <Pill tone="red" dot>
                      Variance
                    </Pill>
                  )}
                </span>
                <span className="text-muted-light block text-xs">
                  {sourceLabel(r.provider)} · {r.payments} payments
                </span>
                <span className="mt-1 grid grid-cols-3 gap-2 text-xs">
                  <span>
                    <span className="text-muted block">Provider</span>
                    <span className="font-bold tabular-nums">{kes(r.expected_cents)}</span>
                  </span>
                  <span>
                    <span className="text-muted block">Ledger</span>
                    <span className="font-bold tabular-nums">{kes(r.ledger_cents)}</span>
                  </span>
                  <span>
                    <span className="text-muted block">Variance</span>
                    <span
                      className={`font-bold tabular-nums ${r.variance_cents ? 'text-danger' : ''}`}
                    >
                      {kes(r.variance_cents)}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {more}
        </>
      )}
    </div>
  );
}
