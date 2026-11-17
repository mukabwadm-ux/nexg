'use client';

import { DataTable, DetailPanel, EmptyState, type ColumnDef } from '@nexg/ui';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Eye,
  FileText,
  Landmark,
  Smartphone,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import {
  ExportButton,
  FilterSelect,
  IconAction,
  SearchBox,
  useShowMore,
} from '@/components/portal/client-kit';
import { Pill } from '@/components/portal/kit';
import { channelLabel, STATUSES, typeOf, type Movement, type Status } from '@/lib/finance';
import { dateTime, kes, shillings } from '@/lib/portal';

const CHANNEL_ICON: Record<string, LucideIcon> = {
  mpesa: Smartphone,
  mobile_money: Smartphone,
  bank: Landmark,
  cheque: Landmark,
  card: CreditCard,
  paystack: CreditCard,
  cash: Banknote,
  wallet: Wallet,
  credit: FileText,
};

function Channel({ channel }: { channel: string }) {
  const Icon = CHANNEL_ICON[channel] ?? ArrowLeftRight;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold">
      <Icon aria-hidden="true" className="text-muted h-4 w-4 shrink-0" strokeWidth={1.9} />
      {channelLabel(channel)}
    </span>
  );
}

function Amount({ m, strong = false }: { m: Movement; strong?: boolean }) {
  const In = m.direction === 'in';
  const Icon = In ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap tabular-nums ${strong ? 'font-extrabold' : 'font-semibold'}`}
    >
      <Icon
        aria-hidden="true"
        className={`h-3.5 w-3.5 shrink-0 ${In ? 'text-success' : 'text-muted-light'}`}
        strokeWidth={2.2}
      />
      <span className="sr-only">{In ? 'Money in:' : 'Money out:'}</span>
      {strong ? kes(m.amount_cents) : shillings(m.amount_cents)}
    </span>
  );
}

/**
 * Money that moved, newest first: one table for payments, refunds,
 * payouts and office expenses, with the filters the designs show and a
 * CSV of whatever is filtered.
 */
export function MovementsTable({
  rows,
  title,
  filename,
  truncated = false,
  showType = true,
  compact = false,
  emptyTitle = 'No transactions in this period',
  emptyText = 'Payments, refunds, payouts and paid office expenses appear here as they happen. Try a longer period.',
}: {
  rows: Movement[];
  title: string;
  filename: string;
  /** The list hit its cap, so older rows in the period are not shown. */
  truncated?: boolean;
  showType?: boolean;
  compact?: boolean;
  emptyTitle?: string;
  emptyText?: string;
}) {
  const [q, setQ] = React.useState('');
  const [type, setType] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [channel, setChannel] = React.useState('all');
  const [open, setOpen] = React.useState<Movement | null>(null);

  const types = [...new Set(rows.map((r) => typeOf(r).label))].sort();
  const channels = [...new Set(rows.map((r) => r.channel))].sort();
  const statuses = [...new Set(rows.map((r) => r.status))];
  const term = q.trim().toLowerCase().replace(/,/g, '');
  const shown = rows.filter(
    (r) =>
      (type === 'all' || typeOf(r).label === type) &&
      (status === 'all' || r.status === status) &&
      (channel === 'all' || r.channel === channel) &&
      (!term ||
        `${r.reference} ${r.description} ${r.party ?? ''} ${r.provider_ref ?? ''} ${Math.round(r.amount_cents / 100)}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || type !== 'all' || status !== 'all' || channel !== 'all';
  const { shown: page, more } = useShowMore(shown, compact ? 8 : 25);

  const columns: ColumnDef<Movement, unknown>[] = [
    {
      id: 'when',
      accessorFn: (r) => r.happened_at,
      header: 'Reference · date & time',
      cell: ({ row: { original: r } }) => (
        <span className="block whitespace-nowrap tabular-nums">
          <span className="block font-semibold">{r.reference}</span>
          <span className="text-muted-light block text-xs">{dateTime(r.happened_at)}</span>
        </span>
      ),
    },
    ...(showType
      ? [
          {
            id: 'type',
            accessorFn: (r: Movement) => typeOf(r).label,
            header: 'Type',
            cell: ({ row: { original: r } }: { row: { original: Movement } }) => (
              <Pill tone={typeOf(r).tone}>{typeOf(r).label}</Pill>
            ),
          } satisfies ColumnDef<Movement, unknown>,
        ]
      : []),
    {
      id: 'description',
      accessorFn: (r) => `${r.description} ${r.party ?? ''}`,
      header: 'Description · party',
      cell: ({ row: { original: r } }) => (
        <span className="block max-w-[15rem]">
          <span className="block truncate" title={r.description}>
            {r.description}
          </span>
          <span className="text-muted-light block truncate text-xs font-semibold">
            {r.party ?? '—'}
          </span>
        </span>
      ),
    },
    {
      id: 'channel',
      accessorFn: (r) => channelLabel(r.channel),
      header: 'Channel',
      cell: ({ row: { original: r } }) => <Channel channel={r.channel} />,
    },
    {
      id: 'amount',
      accessorFn: (r) => r.amount_cents,
      header: 'Amount (KES)',
      cell: ({ row: { original: r } }) => <Amount m={r} />,
    },
    {
      id: 'status',
      accessorFn: (r) => r.status,
      header: 'Status',
      cell: ({ row: { original: r } }) => (
        <Pill tone={STATUSES[r.status].tone} dot>
          {STATUSES[r.status].label}
        </Pill>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <span className="flex justify-end">
          <IconAction label={`Details of ${r.reference}`} onClick={() => setOpen(r)}>
            <Eye />
          </IconAction>
        </span>
      ),
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
              {truncated ? ', newest only' : ''}
            </span>
          )}
        </h2>
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search by reference, name or amount…"
            label="Search transactions"
            className="w-full sm:w-64"
          />
          {showType && types.length > 1 && (
            <FilterSelect
              label="Type"
              value={type}
              onChange={setType}
              className="flex-1 sm:flex-none"
              options={[
                { value: 'all', label: 'All types' },
                ...types.map((t) => ({ value: t, label: t })),
              ]}
            />
          )}
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All statuses' },
              ...(Object.keys(STATUSES) as Status[])
                .filter((s) => statuses.includes(s))
                .map((s) => ({ value: s, label: STATUSES[s].label })),
            ]}
          />
          <FilterSelect
            label="Channel"
            value={channel}
            onChange={setChannel}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All channels' },
              ...channels.map((c) => ({ value: c, label: channelLabel(c) })),
            ]}
          />
          <ExportButton
            filename={filename}
            rows={() => [
              [
                'Reference',
                'Date & time',
                'Type',
                'Description',
                'Party',
                'Channel',
                'Direction',
                'Amount (KES)',
                'Status',
                'Provider reference',
              ],
              ...shown.map((r) => [
                r.reference,
                dateTime(r.happened_at),
                typeOf(r).label,
                r.description,
                r.party ?? '',
                channelLabel(r.channel),
                r.direction === 'in' ? 'In' : 'Out',
                Math.round(r.amount_cents) / 100,
                STATUSES[r.status].label,
                r.provider_ref ?? '',
              ]),
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight className="h-5 w-5" />}
          title={filtered ? 'Nothing matches' : emptyTitle}
          description={filtered ? 'Try another search, type, status or channel.' : emptyText}
          {...(filtered
            ? {
                action: {
                  label: 'Clear filters',
                  onClick: () => {
                    setQ('');
                    setType('all');
                    setStatus('all');
                    setChannel('all');
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
              <li key={`${r.source}-${r.id}`}>
                <button
                  type="button"
                  onClick={() => setOpen(r)}
                  className="flex w-full items-center gap-3 bg-white px-3 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{r.description}</span>
                    <span className="text-muted-light block truncate text-xs">
                      {dateTime(r.happened_at)} · {r.party ?? typeOf(r).label}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm">
                        <Amount m={r} strong />
                      </span>
                      <Pill tone={STATUSES[r.status].tone} dot>
                        {STATUSES[r.status].label}
                      </Pill>
                    </span>
                  </span>
                  <Eye aria-hidden="true" className="text-muted-light h-4 w-4 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
          {more}
        </>
      )}

      <DetailPanel
        open={open != null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.reference ?? ''}
        subtitle={open ? typeOf(open).label : undefined}
      >
        {open && (
          <>
            <dl className="divide-border divide-y text-sm">
              {(
                [
                  ['Amount', <Amount key="a" m={open} strong />],
                  [
                    'Status',
                    <Pill key="s" tone={STATUSES[open.status].tone} dot>
                      {STATUSES[open.status].label}
                    </Pill>,
                  ],
                  ['Recorded state', open.state.replace(/_/g, ' ')],
                  ['Date & time', dateTime(open.happened_at)],
                  ['Description', open.description],
                  ['Party', open.party ?? '—'],
                  ['Channel', <Channel key="c" channel={open.channel} />],
                  ['Provider reference', open.provider_ref ?? '—'],
                  ...(open.note ? [['Note', open.note] as [string, React.ReactNode]] : []),
                ] as [string, React.ReactNode][]
              ).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2.5">
                  <dt className="text-muted font-semibold">{k}</dt>
                  <dd className="text-ink min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
            {open.href && (
              <p className="pt-4">
                <Link
                  href={open.href}
                  className="text-ink hover:text-gold-text text-sm font-bold underline underline-offset-4"
                >
                  {open.source === 'payout' ? 'Open the settlement run' : 'Open in Office finance'}
                </Link>
              </p>
            )}
          </>
        )}
      </DetailPanel>
    </div>
  );
}
