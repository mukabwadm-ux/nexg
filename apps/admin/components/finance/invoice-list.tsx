'use client';

import { DataTable, EmptyState, type ColumnDef } from '@nexg/ui';
import { Briefcase, FileText, Home, Hotel, Store } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { ExportButton, FilterSelect, SearchBox, useShowMore } from '@/components/portal/client-kit';
import { Pill } from '@/components/portal/kit';
import {
  humanize,
  INVOICE_BUCKETS,
  INVOICE_TYPES,
  invoiceBucket,
  type InvoiceBucket,
} from '@/lib/finance';
import { day, kes, shillings } from '@/lib/portal';

export interface InvoiceListRow {
  party_kind: 'host' | 'hotel' | 'merchant' | 'client';
  id: string;
  number: string;
  party_name: string | null;
  period: string;
  total_cents: number;
  status: string;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  provider_ref: string | null;
  /** Client invoices take part payments: what is still owed. */
  balance_cents?: number | null;
}

const PARTY_ICON = { host: Home, hotel: Hotel, merchant: Store, client: Briefcase } as const;

/**
 * Host invoices, hotel statements, merchant statements and client invoices
 * in one list. Balance is the whole amount until it is paid, except for a
 * client invoice, which takes part payments and carries its own balance. A
 * client invoice opens in its panel (?invoice=).
 */
export function InvoicesTable({
  rows,
  today,
  title = 'Invoice List',
  emptyTitle = 'No invoices in this period',
}: {
  rows: InvoiceListRow[];
  today: string;
  title?: string;
  emptyTitle?: string;
}) {
  const [q, setQ] = React.useState('');
  const [type, setType] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const term = q.trim().toLowerCase().replace(/,/g, '');
  const bucketOf = (r: InvoiceListRow) => invoiceBucket(r, today);
  const buckets = [...new Set(rows.map(bucketOf))];
  const types = [...new Set(rows.map((r) => r.party_kind))];
  const shown = rows.filter(
    (r) =>
      (type === 'all' || r.party_kind === type) &&
      (status === 'all' || bucketOf(r) === status) &&
      (!term ||
        `${r.number} ${r.party_name ?? ''} ${r.period} ${Math.round(r.total_cents / 100)}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || type !== 'all' || status !== 'all';
  const { shown: page, more } = useShowMore(shown, 25);
  const balance = (r: InvoiceListRow) =>
    ['paid', 'credited', 'draft'].includes(bucketOf(r)) ? 0 : (r.balance_cents ?? r.total_cents);
  const pathname = usePathname();
  const params = useSearchParams();
  const openHref = (r: InvoiceListRow) => {
    if (r.party_kind !== 'client') return null;
    const next = new URLSearchParams(params.toString());
    next.set('invoice', r.id);
    return `${pathname}?${next.toString()}`;
  };

  const columns: ColumnDef<InvoiceListRow, unknown>[] = [
    {
      id: 'number',
      accessorFn: (r) => r.number,
      header: 'Invoice No. · Period',
      cell: ({ row: { original: r } }) => {
        const href = openHref(r);
        return (
          <span className="block whitespace-nowrap tabular-nums">
            {href ? (
              <Link
                href={href}
                scroll={false}
                className="hover:text-gold-text focus-visible:ring-gold block rounded font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2"
              >
                {r.number}
              </Link>
            ) : (
              <span className="block font-semibold">{r.number}</span>
            )}
            <span className="text-muted-light block max-w-[14rem] truncate text-xs">
              {r.period}
            </span>
          </span>
        );
      },
    },
    {
      id: 'party',
      accessorFn: (r) => r.party_name ?? '',
      header: 'Recipient',
      cell: ({ row: { original: r } }) => {
        const Icon = PARTY_ICON[r.party_kind];
        return (
          <span className="flex min-w-0 items-center gap-2">
            <Icon aria-hidden="true" className="text-muted h-4 w-4 shrink-0" strokeWidth={1.9} />
            <span className="block max-w-[13rem] truncate font-semibold">
              {r.party_name ?? 'Unnamed'}
            </span>
          </span>
        );
      },
    },
    {
      id: 'type',
      accessorFn: (r) => INVOICE_TYPES[r.party_kind]?.label ?? r.party_kind,
      header: 'Type',
      cell: ({ row: { original: r } }) => (
        <Pill tone={INVOICE_TYPES[r.party_kind]?.tone ?? 'grey'}>
          {INVOICE_TYPES[r.party_kind]?.label ?? r.party_kind}
        </Pill>
      ),
    },
    {
      id: 'issued',
      accessorFn: (r) => r.issued_at,
      header: 'Issued · Due',
      cell: ({ row: { original: r } }) => (
        <span className="block whitespace-nowrap tabular-nums">
          <span className="block">{day(r.issued_at)}</span>
          <span className="text-muted-light block text-xs">
            {r.due_at ? `Due ${day(r.due_at)}` : 'No due date'}
          </span>
        </span>
      ),
    },
    {
      id: 'amount',
      accessorFn: (r) => r.total_cents,
      header: 'Amount (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="font-semibold tabular-nums">{shillings(r.total_cents)}</span>
      ),
    },
    {
      id: 'balance',
      accessorFn: (r) => balance(r),
      header: 'Balance (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="tabular-nums">{shillings(balance(r))}</span>
      ),
    },
    {
      id: 'status',
      accessorFn: (r) => bucketOf(r),
      header: 'Status',
      cell: ({ row: { original: r } }) => {
        const b = INVOICE_BUCKETS[bucketOf(r)];
        return (
          <span className="flex flex-col items-start gap-1">
            <Pill tone={b.tone} dot>
              {r.status === 'disputed' ? 'Disputed' : b.label}
            </Pill>
            {r.paid_at && <span className="text-muted-light text-xs">Paid {day(r.paid_at)}</span>}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">
          {title}
          {rows.length > 0 && (
            <span className="text-muted-light ml-2 text-xs font-semibold">
              {shown.length.toLocaleString('en-KE')}
              {filtered ? ` of ${rows.length.toLocaleString('en-KE')}` : ''}
            </span>
          )}
        </h2>
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search by invoice no., recipient or amount…"
            label="Search invoices"
            className="w-full sm:w-64"
          />
          <FilterSelect
            label="Type"
            value={type}
            onChange={setType}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All Types' },
              ...types.map((t) => ({ value: t, label: INVOICE_TYPES[t]?.label ?? t })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All Statuses' },
              ...(Object.keys(INVOICE_BUCKETS) as InvoiceBucket[])
                .filter((b) => buckets.includes(b))
                .map((b) => ({ value: b, label: INVOICE_BUCKETS[b].label })),
            ]}
          />
          <ExportButton
            filename="nexg-invoices.csv"
            rows={() => [
              [
                'Invoice no.',
                'Recipient',
                'Type',
                'Period',
                'Issue date',
                'Due date',
                'Amount (KES)',
                'Balance (KES)',
                'Status',
                'Paid',
                'Payment reference',
              ],
              ...shown.map((r) => [
                r.number,
                r.party_name ?? '',
                INVOICE_TYPES[r.party_kind]?.label ?? r.party_kind,
                r.period,
                r.issued_at.slice(0, 10),
                r.due_at ?? '',
                r.total_cents / 100,
                balance(r) / 100,
                INVOICE_BUCKETS[bucketOf(r)].label,
                r.paid_at ? r.paid_at.slice(0, 10) : '',
                r.provider_ref ?? '',
              ]),
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title={filtered ? 'Nothing matches' : emptyTitle}
          description={
            filtered
              ? 'Try another search, type or status.'
              : 'Host invoices and hotel statements are raised monthly, merchant statements with each settlement, and client invoices with Create Invoice. Try a longer period.'
          }
          {...(filtered
            ? {
                action: {
                  label: 'Clear Filters',
                  onClick: () => {
                    setQ('');
                    setType('all');
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
            {page.map((r) => {
              const b = INVOICE_BUCKETS[bucketOf(r)];
              const href = openHref(r);
              return (
                <li key={`${r.party_kind}-${r.id}`} className="bg-white px-3 py-3">
                  {href ? (
                    <Link
                      href={href}
                      scroll={false}
                      className="focus-visible:ring-gold block truncate rounded text-sm font-bold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2"
                    >
                      {r.party_name ?? 'Unnamed'}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-bold">
                      {r.party_name ?? 'Unnamed'}
                    </span>
                  )}
                  <span className="text-muted-light block truncate text-xs">
                    {r.number} · {INVOICE_TYPES[r.party_kind]?.label} · due{' '}
                    {r.due_at ? day(r.due_at) : '—'}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">
                      {kes(r.total_cents)}
                    </span>
                    <Pill tone={b.tone} dot>
                      {b.label}
                    </Pill>
                  </span>
                </li>
              );
            })}
          </ul>
          {more}
        </>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────── KRA tax invoices and notes */

export interface TaxDoc {
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

export const KRA_STATUS: Record<
  string,
  { label: string; tone: React.ComponentProps<typeof Pill>['tone'] }
> = {
  pending: { label: 'Not Sent to KRA', tone: 'amber' },
  submitted: { label: 'Submitted', tone: 'blue' },
  accepted: { label: 'Accepted by KRA', tone: 'green' },
  rejected: { label: 'Rejected by KRA', tone: 'red' },
  not_required: { label: 'Not Required', tone: 'grey' },
};

export function TaxDocsTable({
  rows,
  title,
  noun,
}: {
  rows: TaxDoc[];
  title: string;
  noun: string;
}) {
  const [q, setQ] = React.useState('');
  const [kra, setKra] = React.useState('all');
  const term = q.trim().toLowerCase().replace(/,/g, '');
  const shown = rows.filter(
    (r) =>
      (kra === 'all' || r.kra_status === kra) &&
      (!term ||
        `${r.number} ${r.party_name ?? ''} ${r.party_pin ?? ''} ${Math.round(r.gross_cents / 100)}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || kra !== 'all';
  const { shown: page, more } = useShowMore(shown, 25);

  const columns: ColumnDef<TaxDoc, unknown>[] = [
    {
      id: 'number',
      accessorFn: (r) => r.issued_at,
      header: 'Number · Issued',
      cell: ({ row: { original: r } }) => (
        <span className="block whitespace-nowrap tabular-nums">
          <span className="block font-semibold">{r.number}</span>
          <span className="text-muted-light block text-xs">{day(r.issued_at)}</span>
        </span>
      ),
    },
    {
      id: 'party',
      accessorFn: (r) => r.party_name ?? '',
      header: 'Billed To',
      cell: ({ row: { original: r } }) => (
        <span className="block max-w-[11rem]">
          <span className="block truncate font-semibold">{r.party_name ?? '—'}</span>
          {r.party_pin && (
            <span className="text-muted-light block text-xs tabular-nums">PIN {r.party_pin}</span>
          )}
        </span>
      ),
    },
    {
      id: 'purpose',
      accessorFn: (r) => r.purpose,
      header: 'For',
      cell: ({ row: { original: r } }) => <Pill tone="gold">{humanize(r.purpose)}</Pill>,
    },
    {
      id: 'net',
      accessorFn: (r) => r.net_cents,
      header: 'Net (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="tabular-nums">{shillings(r.net_cents)}</span>
      ),
    },
    {
      id: 'vat',
      accessorFn: (r) => r.vat_cents,
      header: 'VAT (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="tabular-nums">{shillings(r.vat_cents)}</span>
      ),
    },
    {
      id: 'gross',
      accessorFn: (r) => r.gross_cents,
      header: 'Total (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="font-semibold tabular-nums">{shillings(r.gross_cents)}</span>
      ),
    },
    {
      id: 'kra',
      accessorFn: (r) => r.kra_status,
      header: 'KRA',
      cell: ({ row: { original: r } }) => {
        const k = KRA_STATUS[r.kra_status] ?? { label: r.kra_status, tone: 'grey' as const };
        return (
          <span className="flex flex-col items-start gap-1">
            <Pill tone={k.tone} dot>
              {k.label}
            </Pill>
            {r.kra_reference && (
              <span className="text-muted-light text-xs tabular-nums">{r.kra_reference}</span>
            )}
          </span>
        );
      },
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
            placeholder="Search by number, name, PIN or amount…"
            label={`Search ${noun}s`}
            className="w-full sm:w-64"
          />
          <FilterSelect
            label="KRA status"
            value={kra}
            onChange={setKra}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'Any KRA Status' },
              ...Object.entries(KRA_STATUS)
                .filter(([k]) => rows.some((r) => r.kra_status === k))
                .map(([k, v]) => ({ value: k, label: v.label })),
            ]}
          />
          <ExportButton
            filename={`nexg-${noun.replace(/\s+/g, '-')}s.csv`}
            rows={() => [
              [
                'Number',
                'Billed to',
                'KRA PIN',
                'For',
                'Issued',
                'Net (KES)',
                'VAT (KES)',
                'Total (KES)',
                'KRA status',
                'KRA reference',
              ],
              ...shown.map((r) => [
                r.number,
                r.party_name ?? '',
                r.party_pin ?? '',
                humanize(r.purpose),
                r.issued_at.slice(0, 10),
                r.net_cents / 100,
                r.vat_cents / 100,
                r.gross_cents / 100,
                KRA_STATUS[r.kra_status]?.label ?? r.kra_status,
                r.kra_reference ?? '',
              ]),
            ]}
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title={filtered ? 'Nothing matches' : `No ${noun}s in this period`}
          description={
            filtered
              ? 'Try another search or KRA status.'
              : `A ${noun} is issued for each order's commission and guest fees and for each client invoice, and sent to KRA. Try a longer period.`
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable caption={title} columns={columns} data={page} />
          </div>
          <ul className="divide-border border-border divide-y overflow-hidden rounded-2xl border md:hidden">
            {page.map((r) => (
              <li key={r.id} className="bg-white px-3 py-3">
                <span className="block truncate text-sm font-bold">{r.party_name ?? r.number}</span>
                <span className="text-muted-light block truncate text-xs">
                  {r.number} · {humanize(r.purpose)} · {day(r.issued_at)}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">
                    {kes(r.gross_cents)}
                  </span>
                  <Pill tone={(KRA_STATUS[r.kra_status] ?? { tone: 'grey' }).tone} dot>
                    {KRA_STATUS[r.kra_status]?.label ?? r.kra_status}
                  </Pill>
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
