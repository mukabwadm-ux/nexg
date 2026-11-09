'use client';

import type { Database } from '@nexg/db';
import { Banknote, Landmark, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { dateTime, kes, type TxnRow } from '@/components/merchant-money/breakdown';
import { day, kesWhole } from '@/components/partner/bits';
import { ReceiptList } from '@/components/receipts/receipt-list';
import type { Receipt } from '@/lib/receipts';

import {
  DataTable,
  matchesTableRow,
  Metrics,
  Modal,
  MoneyFrame,
  MoneyTabs,
  Pair,
  type Metric,
  type TableRow,
} from './components';

export type MoneyStatement = Pick<
  Database['public']['Tables']['merchant_statement']['Row'],
  | 'id'
  | 'period_start'
  | 'period_end'
  | 'gross_kes'
  | 'commission_kes'
  | 'adjustments_kes'
  | 'penalties_kes'
  | 'tax_withheld_kes'
  | 'net_kes'
  | 'status'
  | 'paid_at'
  | 'provider_ref'
>;

type MoneyTransaction = Pick<TxnRow, 'id' | 'reference' | 'placed_at'> & {
  payment_method: string | null;
  payment_status: string | null;
  settlement: string | null;
  subtotal_cents: number | null;
  commission_cents: number | null;
  merchant_net_cents: number | null;
};

type MoneyHome = { payout_rail: string | null; earned_today_cents: number | null };
const tabs = ['Overview', 'Transactions', 'Payouts', 'Statements', 'Receipts'] as const;
type LiveTab = (typeof tabs)[number];

function statusLabel(status: string | null | undefined) {
  if (!status) return 'Not recorded';
  const readable = status.replaceAll('_', ' ');
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function periodLabel(statement: MoneyStatement) {
  return day(statement.period_start) + ' – ' + day(statement.period_end);
}

function payoutDestination(home: MoneyHome | null) {
  if (!home) return 'Payout destination unavailable';
  switch (home.payout_rail) {
    case 'mpesa_paybill':
      return 'M-Pesa PayBill';
    case 'mpesa_till':
      return 'M-Pesa Till';
    case 'bank':
    case 'bank_transfer':
      return 'Bank transfer';
    case null:
      return 'No payout destination on file';
    default:
      return 'Payout method on file';
  }
}

export function LiveMoneyWorkspace({
  home,
  statements,
  transactions,
  receipts,
}: {
  home: MoneyHome | null;
  statements: MoneyStatement[] | null;
  transactions: MoneyTransaction[] | null;
  /** Payouts and payments to NexG, each with a printable receipt. */
  receipts: Receipt[] | null;
}) {
  const [tab, setTab] = useState<LiveTab>('Overview');
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [definition, setDefinition] = useState<Metric | null>(null);

  const orderView = tab === 'Overview' || tab === 'Transactions';
  const payoutView = tab === 'Payouts';
  const payouts = (statements ?? [])
    .filter((statement) => statement.status === 'paid')
    .sort((a, b) => (b.paid_at ?? '').localeCompare(a.paid_at ?? ''));
  const financeRows = payoutView ? payouts : (statements ?? []);
  const orderRows = tab === 'Overview' ? transactions?.slice(0, 8) : transactions;
  const sourceAvailable =
    tab === 'Receipts' ? true : orderView ? transactions !== null : statements !== null;
  const title =
    tab === 'Overview' ? 'Recent transactions' : payoutView ? 'Payouts & settlements' : tab;

  const rows: TableRow[] = orderView
    ? (orderRows ?? []).map((row) => {
        const payment = statusLabel(row.payment_status);
        return {
          id: row.id,
          cells: [
            row.reference,
            dateTime(row.placed_at),
            kes(row.subtotal_cents),
            kes(row.merchant_net_cents),
            payment,
          ],
          search: [row.reference, payment, row.settlement].join(' '),
          type: 'Transaction',
          status: payment,
        };
      })
    : financeRows.map((row) => ({
        id: row.id,
        cells: [
          periodLabel(row),
          payoutView ? day(row.paid_at) : kesWhole(row.gross_kes),
          kesWhole(row.net_kes),
          statusLabel(row.status),
        ],
        search: [periodLabel(row), row.provider_ref, row.status].join(' '),
        type: 'Statement',
        status: statusLabel(row.status),
      }));
  const visible = rows.filter((row) => matchesTableRow(row, search, filter));
  const selected = visible.find((row) => row.id === selectedId) ?? visible[0];
  const order = orderView ? orderRows?.find((row) => row.id === selected?.id) : undefined;
  const statement = orderView ? undefined : financeRows.find((row) => row.id === selected?.id);
  const latestStatement = statements?.[0];
  const latestPayout = payouts.find((statement) => statement.paid_at);
  const metrics: Metric[] = [
    {
      label: 'Earned today',
      value: home?.earned_today_cents == null ? 'Unavailable' : kes(home.earned_today_cents),
      note: 'Delivered orders after commission',
      definition: 'The amount recorded on delivered orders today, after NexG commission.',
      icon: Banknote,
    },
    {
      label: 'Latest statement',
      value: latestStatement
        ? kesWhole(latestStatement.net_kes)
        : statements
          ? 'No statements yet'
          : 'Unavailable',
      note: latestStatement ? periodLabel(latestStatement) : undefined,
      definition: 'The net amount and period recorded by Finance on your latest statement.',
      icon: ReceiptText,
    },
    {
      label: 'Latest confirmed payout',
      value: latestPayout
        ? kesWhole(latestPayout.net_kes)
        : payouts.length
          ? 'Date unavailable'
          : statements
            ? 'No recent payout'
            : 'Unavailable',
      note: latestPayout ? day(latestPayout.paid_at) : undefined,
      definition: 'The most recent paid statement in the loaded statement history.',
      icon: Landmark,
    },
  ];

  function changeTab(next: LiveTab) {
    setTab(next);
    setSelectedId('');
    setSearch('');
    setFilter('All');
  }

  return (
    <>
      <MoneyFrame
        ready={sourceAvailable}
        description="Review order payments, statements and confirmed payouts from NexG Finance."
        actions={
          <Link className="mo-button" href="/merchant/support">
            Contact Finance support
          </Link>
        }
      >
        <MoneyTabs tabs={tabs} active={tab} onSelect={changeTab} />
        {tab === 'Overview' && <Metrics metrics={metrics} onInfo={setDefinition} />}
        {payoutView && (
          <p className="mo-note">
            {payoutDestination(home)}. Contact support to request a verified change to your payout
            destination.
          </p>
        )}
        {tab === 'Receipts' ? (
          <ReceiptList
            receipts={receipts}
            empty="No receipts yet. You get one, here and by email, for every payout and every payment to NexG."
          />
        ) : !sourceAvailable ? (
          <p className="mo-note mo-note-error" role="alert">
            {orderView ? 'Transactions' : 'Statements'} could not be loaded.{' '}
            <Link href="/merchant/money" className="mo-link">
              Reload Money
            </Link>
          </p>
        ) : (
          <div className="mo-main">
            <DataTable
              title={title}
              columns={
                orderView
                  ? ['Order', 'Placed', 'Basket', 'You receive', 'Payment']
                  : [
                      'Statement period',
                      payoutView ? 'Paid on' : 'Guests paid',
                      'Net amount',
                      'Status',
                    ]
              }
              rows={rows}
              selected={selected?.id ?? ''}
              onSelect={setSelectedId}
              search={search}
              onSearch={setSearch}
              filter={filter}
              onFilter={setFilter}
              filters={['All', ...new Set(rows.map((row) => row.status))]}
              showControls={tab !== 'Overview'}
              emptyMessage={
                orderView
                  ? 'No order transactions yet.'
                  : payoutView
                    ? 'No recent confirmed payouts.'
                    : 'No statements yet.'
              }
              footer={
                orderView ? (
                  <Link href="/merchant/transactions" className="mo-link">
                    View all transactions →
                  </Link>
                ) : undefined
              }
            />
            <aside className="mo-inspector" aria-label="Selected money details">
              <div className="mo-inspector-head">
                <h2>
                  {order ? order.reference : statement ? periodLabel(statement) : 'Money details'}
                </h2>
              </div>
              <div className="mo-inspector-content">
                {order ? (
                  <>
                    <Pair label="Basket" value={kes(order.subtotal_cents)} />
                    <Pair label="NexG commission" value={kes(order.commission_cents)} />
                    <Pair label="You receive" value={kes(order.merchant_net_cents)} strong />
                    <Pair label="Payment" value={statusLabel(order.payment_status)} />
                    <Pair label="Payment method" value={statusLabel(order.payment_method)} />
                    <Pair label="Settlement" value={statusLabel(order.settlement)} />
                  </>
                ) : statement ? (
                  <>
                    <Pair label="Guests paid" value={kesWhole(statement.gross_kes)} />
                    <Pair label="NexG commission" value={kesWhole(statement.commission_kes)} />
                    {statement.adjustments_kes !== 0 && (
                      <Pair label="Adjustments" value={kesWhole(statement.adjustments_kes)} />
                    )}
                    {statement.penalties_kes !== 0 && (
                      <Pair label="Penalties" value={kesWhole(statement.penalties_kes)} />
                    )}
                    {statement.tax_withheld_kes !== 0 && (
                      <Pair label="Tax withheld" value={kesWhole(statement.tax_withheld_kes)} />
                    )}
                    <Pair label="Net statement amount" value={kesWhole(statement.net_kes)} strong />
                    <Pair label="Status" value={statusLabel(statement.status)} />
                    {statement.status === 'paid' && statement.paid_at && (
                      <Pair label="Paid on" value={day(statement.paid_at)} />
                    )}
                    {statement.status === 'paid' && statement.provider_ref && (
                      <Pair label="Payment reference" value={statement.provider_ref} />
                    )}
                  </>
                ) : (
                  <p>Select a transaction or statement to see its Finance breakdown.</p>
                )}
              </div>
              {order && (
                <div className="mo-inspector-actions">
                  <Link
                    className="mo-button mo-primary"
                    href={'/merchant/transactions/' + encodeURIComponent(order.id)}
                  >
                    Open order breakdown
                  </Link>
                </div>
              )}
            </aside>
          </div>
        )}
        <footer className="mo-footer">
          <span>NexG Finance · KES</span>
          <Link href="/merchant/transactions" className="mo-link">
            Transaction history
          </Link>
        </footer>
      </MoneyFrame>
      {definition && (
        <Modal
          title={definition.label}
          description="Source and scope"
          onClose={() => setDefinition(null)}
        >
          <p>{definition.definition}</p>
        </Modal>
      )}
    </>
  );
}
