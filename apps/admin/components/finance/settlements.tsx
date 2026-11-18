'use client';

import { Button, DataTable, EmptyState, useToast, type ColumnDef } from '@nexg/ui';
import { Eye, Landmark, Layers, Plus, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { buildPayoutRun } from '@/app/finance/settlements/actions';
import {
  ConfirmAction,
  ExportButton,
  FilterSelect,
  SearchBox,
  useShowMore,
} from '@/components/portal/client-kit';
import { Pill } from '@/components/portal/kit';
import { LINE_STATES, PAYEE_GROUPS, RAILS, RUN_STATES, type PayeeGroup } from '@/lib/finance';
import { dateTime, day, kes, shillings } from '@/lib/portal';

/** The batches view with one run open. */
function withRun(batchesHref: string, runId: string): string {
  return `${batchesHref}${batchesHref.includes('?') ? '&' : '?'}run=${encodeURIComponent(runId)}`;
}

/* ───────────────────────────────────────────────────── building a run */

export function BuildRunButton({ batchesHref }: { batchesHref: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <ConfirmAction
      trigger={
        <Button variant="gold" size="md" leadingIcon={<Plus className="h-4 w-4" />}>
          Create Payout
        </Button>
      }
      tone="black"
      title="Build last week's payout run?"
      body="Gathers what merchants, hosts, riders and experience partners are owed for Monday to Sunday just finished. Nothing is approved or sent: the run then needs its checks and two signatures. Building again before approval rebuilds it."
      confirmLabel="Build Run"
      onConfirm={async () => {
        const r = await buildPayoutRun();
        if (!r.ok) {
          toast({ tone: 'danger', title: 'The run was not built', description: r.message });
          return false;
        }
        toast({ tone: 'success', title: 'Payout run built', description: r.message });
        const sep = batchesHref.includes('?') ? '&' : '?';
        router.push(r.runId ? `${batchesHref}${sep}run=${r.runId}` : batchesHref);
        router.refresh();
        return true;
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────── batches */

export interface BatchRow {
  key: string;
  runId: string;
  reference: string;
  group: PayeeGroup;
  recipients: number;
  cents: number;
  rails: string[];
  runState: string;
  payDate: string;
  processedAt: string | null;
  paid: number;
  failed: number;
  held: number;
}

function RailList({ rails }: { rails: string[] }) {
  if (rails.length === 0) return <span className="text-muted-light">—</span>;
  const bank = rails.includes('bank_eft');
  const Icon = bank && rails.length === 1 ? Landmark : Smartphone;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold">
      <Icon aria-hidden="true" className="text-muted h-4 w-4 shrink-0" strokeWidth={1.9} />
      {[...new Set(rails.map((r) => RAILS[r] ?? r))].join(', ')}
    </span>
  );
}

function batchStatus(b: BatchRow): {
  label: string;
  tone: React.ComponentProps<typeof Pill>['tone'];
} {
  if (b.recipients > 0 && b.paid === b.recipients) return { label: 'Paid', tone: 'green' };
  if (b.failed > 0) return { label: `${b.failed} Failed`, tone: 'red' };
  if (b.held > 0 && ['built', 'checked'].includes(b.runState))
    return { label: `${b.held} Held`, tone: 'red' };
  return RUN_STATES[b.runState] ?? { label: b.runState, tone: 'grey' };
}

export function BatchesTable({
  rows,
  batchesHref,
  title = 'Settlement Batches',
  compact = false,
}: {
  rows: BatchRow[];
  /** The batches view; a batch opens there with its run's checks and lines. */
  batchesHref: string;
  title?: string;
  compact?: boolean;
}) {
  const runHref = (runId: string) => withRun(batchesHref, runId);
  const [q, setQ] = React.useState('');
  const [group, setGroup] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const term = q.trim().toLowerCase().replace(/,/g, '');
  const statusOf = (b: BatchRow) => batchStatus(b).label;
  const statuses = [...new Set(rows.map(statusOf))];
  const shown = rows.filter(
    (b) =>
      (group === 'all' || b.group === group) &&
      (status === 'all' || statusOf(b) === status) &&
      (!term ||
        `${b.reference} ${PAYEE_GROUPS[b.group].batch} ${Math.round(b.cents / 100)}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || group !== 'all' || status !== 'all';
  const { shown: page, more } = useShowMore(shown, compact ? 6 : 25);

  const columns: ColumnDef<BatchRow, unknown>[] = [
    {
      id: 'reference',
      accessorFn: (b) => b.processedAt ?? b.payDate,
      header: 'Batch · Weekly',
      cell: ({ row: { original: b } }) => (
        <span className="block whitespace-nowrap tabular-nums">
          <span className="block font-semibold">{b.reference}</span>
          <span className="text-muted-light block text-xs">
            {b.processedAt ? `Sent ${dateTime(b.processedAt)}` : `Pays ${day(b.payDate)}`}
          </span>
        </span>
      ),
    },
    {
      id: 'type',
      accessorFn: (b) => PAYEE_GROUPS[b.group].batch,
      header: 'Payout Type',
      cell: ({ row: { original: b } }) => (
        <Pill
          tone={
            b.group === 'merchant'
              ? 'gold'
              : b.group === 'host'
                ? 'purple'
                : b.group === 'rider'
                  ? 'amber'
                  : 'grey'
          }
        >
          {PAYEE_GROUPS[b.group].batch}
        </Pill>
      ),
    },
    {
      id: 'recipients',
      accessorFn: (b) => b.recipients,
      header: 'Recipients',
      cell: ({ row: { original: b } }) => (
        <span className="whitespace-nowrap tabular-nums">
          {b.recipients.toLocaleString('en-KE')}{' '}
          {b.group === 'merchant'
            ? 'merchant'
            : b.group === 'host'
              ? 'host'
              : b.group === 'rider'
                ? 'rider'
                : 'partner'}
          {b.recipients === 1 ? '' : 's'}
        </span>
      ),
    },
    {
      id: 'amount',
      accessorFn: (b) => b.cents,
      header: 'Total Amount (KES)',
      cell: ({ row: { original: b } }) => (
        <span className="font-semibold tabular-nums">{shillings(b.cents)}</span>
      ),
    },
    {
      id: 'method',
      accessorFn: (b) => b.rails.join(' '),
      header: 'Payout Method',
      cell: ({ row: { original: b } }) => <RailList rails={b.rails} />,
    },
    {
      id: 'status',
      accessorFn: (b) => statusOf(b),
      header: 'Status',
      cell: ({ row: { original: b } }) => {
        const s = batchStatus(b);
        return (
          <Pill tone={s.tone} dot>
            {s.label}
          </Pill>
        );
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row: { original: b } }) => (
        <span className="flex justify-end">
          <Link
            href={runHref(b.runId)}
            aria-label={`Open run ${b.reference}`}
            className="text-muted hover:bg-bg hover:text-ink focus-visible:ring-gold inline-flex h-9 w-9 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2"
          >
            <Eye className="h-[1.1rem] w-[1.1rem]" />
          </Link>
        </span>
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
            placeholder="Search batch, reference or amount…"
            label="Search batches"
            className="w-full sm:w-64"
          />
          <FilterSelect
            label="Payout type"
            value={group}
            onChange={setGroup}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All Payout Types' },
              ...(Object.keys(PAYEE_GROUPS) as PayeeGroup[])
                .filter((g) => rows.some((b) => b.group === g))
                .map((g) => ({ value: g, label: PAYEE_GROUPS[g].batch })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All Statuses' },
              ...statuses.map((s) => ({ value: s, label: s })),
            ]}
          />
          <ExportButton
            filename="nexg-settlement-batches.csv"
            rows={() => [
              [
                'Batch reference',
                'Payout type',
                'Recipients',
                'Total (KES)',
                'Method',
                'Status',
                'Pay date',
                'Processed',
              ],
              ...shown.map((b) => [
                b.reference,
                PAYEE_GROUPS[b.group].batch,
                b.recipients,
                Math.round(b.cents) / 100,
                b.rails.map((r) => RAILS[r] ?? r).join(' / '),
                statusOf(b),
                b.payDate,
                b.processedAt ? dateTime(b.processedAt) : '',
              ]),
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          title={filtered ? 'Nothing matches' : 'No payout runs in this period'}
          description={
            filtered
              ? 'Try another search, type or status.'
              : 'A run is built each week for the week just finished, then checked and signed by two people before anything is paid. Choose a longer period to see earlier runs.'
          }
          {...(filtered
            ? {
                action: {
                  label: 'Clear Filters',
                  onClick: () => {
                    setQ('');
                    setGroup('all');
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
            {page.map((b) => {
              const s = batchStatus(b);
              return (
                <li key={b.key}>
                  <Link
                    href={runHref(b.runId)}
                    className="flex items-center gap-3 bg-white px-3 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {PAYEE_GROUPS[b.group].batch}
                      </span>
                      <span className="text-muted-light block truncate text-xs">
                        {b.reference} · {b.recipients.toLocaleString('en-KE')} recipient
                        {b.recipients === 1 ? '' : 's'}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">
                          {kes(b.cents)}
                        </span>
                        <Pill tone={s.tone} dot>
                          {s.label}
                        </Pill>
                      </span>
                    </span>
                    <Eye aria-hidden="true" className="text-muted-light h-4 w-4 shrink-0" />
                  </Link>
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

/* ───────────────────────────────────────────────────── one payee type */

export interface SettlementLine {
  id: string;
  run_id: string;
  run_reference: string;
  pay_date: string;
  party_type: string;
  party_label: string;
  rail: string;
  destination_masked: string | null;
  gross_cents: number;
  commission_cents: number;
  adjustment_cents: number;
  net_cents: number;
  state: string;
  hold_reason: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  provider_ref: string | null;
}

export function LinesTable({
  rows,
  title,
  noun,
  batchesHref,
}: {
  rows: SettlementLine[];
  title: string;
  /** "merchant", "host", "rider", "partner". */
  noun: string;
  /** The batches view, where a line's run opens. */
  batchesHref: string;
}) {
  const runHref = (runId: string) => withRun(batchesHref, runId);
  const [q, setQ] = React.useState('');
  const [state, setState] = React.useState('all');
  const term = q.trim().toLowerCase().replace(/,/g, '');
  const states = [...new Set(rows.map((r) => r.state))];
  const shown = rows.filter(
    (r) =>
      (state === 'all' || r.state === state) &&
      (!term ||
        `${r.party_label} ${r.run_reference} ${r.provider_ref ?? ''} ${Math.round(r.net_cents / 100)}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || state !== 'all';
  const { shown: page, more } = useShowMore(shown, 25);

  const columns: ColumnDef<SettlementLine, unknown>[] = [
    {
      id: 'party',
      accessorFn: (r) => r.party_label,
      header: noun.charAt(0).toUpperCase() + noun.slice(1),
      cell: ({ row: { original: r } }) => (
        <span className="block max-w-[14rem] truncate font-semibold">{r.party_label}</span>
      ),
    },
    {
      id: 'run',
      accessorFn: (r) => r.pay_date,
      header: 'Run',
      cell: ({ row: { original: r } }) => (
        <Link href={runHref(r.run_id)} className="hover:text-gold-text whitespace-nowrap">
          <span className="block font-semibold tabular-nums">{r.run_reference}</span>
          <span className="text-muted-light block text-xs">Pays {day(r.pay_date)}</span>
        </Link>
      ),
    },
    {
      id: 'method',
      accessorFn: (r) => RAILS[r.rail] ?? r.rail,
      header: 'Method',
      cell: ({ row: { original: r } }) => (
        <span className="whitespace-nowrap">
          <span className="block font-semibold">{RAILS[r.rail] ?? r.rail}</span>
          {r.destination_masked && (
            <span className="text-muted-light block text-xs tabular-nums">
              {r.destination_masked}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'gross',
      accessorFn: (r) => r.gross_cents,
      header: 'Earned (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="tabular-nums">{shillings(r.gross_cents)}</span>
      ),
    },
    {
      id: 'deductions',
      accessorFn: (r) => r.commission_cents - r.adjustment_cents,
      header: 'Commission & Adj.',
      cell: ({ row: { original: r } }) => {
        const less = r.commission_cents - r.adjustment_cents;
        return (
          <span className="text-muted tabular-nums">
            {less === 0 ? '—' : `−${shillings(less)}`}
          </span>
        );
      },
    },
    {
      id: 'net',
      accessorFn: (r) => r.net_cents,
      header: 'Net (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="font-extrabold tabular-nums">{shillings(r.net_cents)}</span>
      ),
    },
    {
      id: 'state',
      accessorFn: (r) => r.state,
      header: 'Status',
      cell: ({ row: { original: r } }) => {
        const s = LINE_STATES[r.state] ?? { label: r.state, tone: 'grey' as const };
        const why = r.failure_reason ?? r.hold_reason;
        return (
          <span className="flex flex-col items-start gap-1">
            <Pill tone={s.tone} dot>
              {s.label}
            </Pill>
            {why && <span className="text-muted-light max-w-[12rem] truncate text-xs">{why}</span>}
            {r.paid_at && (
              <span className="text-muted-light text-xs">
                {dateTime(r.paid_at)}
                {r.provider_ref ? ` · ${r.provider_ref}` : ''}
              </span>
            )}
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
            placeholder={`Search ${noun}s, runs or references…`}
            label={`Search ${noun} payouts`}
            className="w-full sm:w-64"
          />
          <FilterSelect
            label="Status"
            value={state}
            onChange={setState}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All Statuses' },
              ...states.map((s) => ({ value: s, label: LINE_STATES[s]?.label ?? s })),
            ]}
          />
          <ExportButton
            filename={`nexg-${noun}-payouts.csv`}
            rows={() => [
              [
                noun,
                'Run',
                'Pay date',
                'Method',
                'Destination',
                'Earned (KES)',
                'Commission (KES)',
                'Adjustments (KES)',
                'Net (KES)',
                'Status',
                'Paid at',
                'Provider reference',
              ],
              ...shown.map((r) => [
                r.party_label,
                r.run_reference,
                r.pay_date,
                RAILS[r.rail] ?? r.rail,
                r.destination_masked ?? '',
                r.gross_cents / 100,
                r.commission_cents / 100,
                r.adjustment_cents / 100,
                r.net_cents / 100,
                LINE_STATES[r.state]?.label ?? r.state,
                r.paid_at ? dateTime(r.paid_at) : '',
                r.provider_ref ?? '',
              ]),
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          title={filtered ? 'Nothing matches' : `No ${noun} payouts in this period`}
          description={
            filtered
              ? 'Try another search or status.'
              : `Each weekly run pays every ${noun} what the ledger says they are owed. Choose a longer period to see earlier runs.`
          }
          {...(filtered
            ? {
                action: {
                  label: 'Clear Filters',
                  onClick: () => {
                    setQ('');
                    setState('all');
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
              const s = LINE_STATES[r.state] ?? { label: r.state, tone: 'grey' as const };
              return (
                <li key={r.id} className="bg-white px-3 py-3">
                  <span className="block truncate text-sm font-bold">{r.party_label}</span>
                  <span className="text-muted-light block truncate text-xs">
                    {r.run_reference} · pays {day(r.pay_date)} · {RAILS[r.rail] ?? r.rail}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">
                      {kes(r.net_cents)}
                    </span>
                    <Pill tone={s.tone} dot>
                      {s.label}
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
