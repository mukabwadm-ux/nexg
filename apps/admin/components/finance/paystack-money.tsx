import { Banknote, Landmark, Percent, Receipt, Send, Truck, Wallet } from 'lucide-react';
import Link from 'next/link';

import {
  cell,
  Empty,
  figure,
  Note,
  Problem,
  sub,
  Table,
} from '@/components/finance/paystack-parts';
import { PanelHead, Pill, Sheet, Stat, StatGrid } from '@/components/portal/kit';
import { money, settlementTotal, type NexgBooks, type Read } from '@/lib/finance-paystack';
import type { PaystackMoney } from '@/lib/finance-paystack-server';
import { dateTime, day, type Period, type Tone } from '@/lib/portal';

const SETTLEMENT: Record<string, { label: string; tone: Tone }> = {
  success: { label: 'Paid', tone: 'green' },
  processing: { label: 'Processing', tone: 'amber' },
  pending: { label: 'Pending', tone: 'amber' },
  failed: { label: 'Failed', tone: 'red' },
};

const UNAVAILABLE = 'Unavailable';

/**
 * NexG's own money: what Paystack says it holds and has settled, then what the
 * books say NexG earned. The two are shown apart and never added together.
 */
export function PaystackOverview({
  paystack,
  books,
  period,
  settlementsHref,
}: {
  paystack: PaystackMoney;
  books: Read<NexgBooks>;
  period: Period;
  /** Settlements & Payouts, where money owed out is. */
  settlementsHref: string;
}) {
  const range = `${day(period.from)} to ${day(period.to)}`;
  return (
    <>
      <FromPaystack paystack={paystack} range={range} />
      <FromTheBooks books={books} range={range} />
      <Sheet>
        <PanelHead title="Money Owed Out" />
        <p className="mt-2 text-sm font-semibold">
          What NexG owes merchants, hosts, riders and partners is on{' '}
          <Link href={settlementsHref} className="font-bold underline underline-offset-4">
            Settlements &amp; Payouts
          </Link>
          .
        </p>
      </Sheet>
    </>
  );
}

function FromPaystack({ paystack, range }: { paystack: PaystackMoney; range: string }) {
  const { mode, balance, settlements } = paystack;
  /* A total only over the whole list, and only when every amount in it reads. */
  const total = (states: string[], field?: 'fees_cents') => {
    if (!settlements.ok) return { value: UNAVAILABLE, note: undefined };
    if (settlements.more) return { value: null, note: 'Choose a shorter period' };
    const t = settlementTotal(settlements.rows, states, field);
    return {
      value: t.cents === null ? UNAVAILABLE : money(t.cents),
      note: `${t.count} settlement${t.count === 1 ? '' : 's'} in this period`,
    };
  };
  const paid = total(['success']);
  const coming = total(['pending', 'processing']);
  const fees = total(['success'], 'fees_cents');
  return (
    <Sheet>
      <PanelHead title="From Paystack" aside={`fetched ${dateTime(paystack.fetched_at)}`}>
        {mode && (
          <Pill tone={mode === 'test' ? 'amber' : 'green'}>
            {mode === 'test' ? 'Test mode' : 'Live mode'}
          </Pill>
        )}
      </PanelHead>
      {mode === 'test' && <Note>These are Paystack test figures. No real money.</Note>}
      <div className="mt-4 space-y-3">
        {!balance.ok && <Problem>Balance unavailable. {balance.message}</Problem>}
        {!settlements.ok && <Problem>Settlements unavailable. {settlements.message}</Problem>}
        <StatGrid dense>
          <Stat
            icon={Wallet}
            value={balance.ok ? money(balance.cents) : UNAVAILABLE}
            label="Paystack Balance Now"
          />
          <Stat icon={Landmark} value={paid.value} label="Paid to NexG's Bank" note={paid.note} />
          <Stat icon={Send} value={coming.value} label="On the Way" note={coming.note} />
          <Stat icon={Percent} value={fees.value} label="Fees on Those Paid" note={fees.note} />
        </StatGrid>
      </div>
      {settlements.ok && (
        <>
          <h3 className="mt-5 text-sm font-extrabold">Settlements to NexG&apos;s bank · {range}</h3>
          {settlements.more && (
            <Note>Only the first {settlements.rows.length} are shown, so there are no totals.</Note>
          )}
          {settlements.rows.length === 0 ? (
            <Empty>Paystack lists no settlement to NexG&apos;s bank in this period.</Empty>
          ) : (
            <Table
              caption="Paystack settlements to NexG's bank"
              heads={[
                'Settlement Date',
                'Status',
                { label: 'Amount', right: true },
                { label: 'Fees', right: true },
              ]}
            >
              {settlements.rows.map((s) => (
                <tr key={s.id}>
                  <td className={cell}>{day(s.settlement_date)}</td>
                  <td className={cell}>
                    <Pill tone={SETTLEMENT[s.status]?.tone ?? 'grey'}>
                      {SETTLEMENT[s.status]?.label ?? s.status}
                    </Pill>
                  </td>
                  <td className={figure}>{money(s.amount_cents)}</td>
                  <td className={figure}>{money(s.fees_cents)}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </Sheet>
  );
}

function FromTheBooks({ books, range }: { books: Read<NexgBooks>; range: string }) {
  if (!books.ok) {
    return (
      <Sheet>
        <PanelHead title="From the Books" aside={range} />
        <div className="mt-4">
          <Problem>{books.message}</Problem>
        </div>
      </Sheet>
    );
  }
  const b = books.data;
  const sum = (key: 'earned_cents' | 'refunded_cents' | 'recovered_cents' | 'net_cents') =>
    b.revenue.reduce((s, r) => s + r[key], 0);
  return (
    <Sheet>
      <PanelHead title="From the Books" aside={`${range} · live money only`} />
      {b.revenue.length === 0 ? (
        <Empty>No earnings on the books in this period.</Empty>
      ) : (
        <Table
          caption="NexG's earnings by account"
          heads={[
            'Earnings (before VAT)',
            { label: 'Earned', right: true },
            { label: 'Refunded', right: true },
            { label: 'Recovered', right: true },
            { label: 'Net', right: true },
          ]}
        >
          {b.revenue.map((r) => (
            <tr key={r.account}>
              <td className={cell}>
                <span className="font-semibold">{r.name}</span>
                <span className={sub}>{r.account}</span>
              </td>
              <td className={figure}>{money(r.earned_cents)}</td>
              <td className={figure}>{money(r.refunded_cents)}</td>
              <td className={figure}>{money(r.recovered_cents)}</td>
              <td className={`${figure} font-bold`}>{money(r.net_cents)}</td>
            </tr>
          ))}
          <tr className="bg-bg font-extrabold">
            <td className={cell}>All earnings</td>
            <td className={figure}>{money(sum('earned_cents'))}</td>
            <td className={figure}>{money(sum('refunded_cents'))}</td>
            <td className={figure}>{money(sum('recovered_cents'))}</td>
            <td className={figure}>{money(sum('net_cents'))}</td>
          </tr>
        </Table>
      )}
      <Note>
        An order refund is taken in full from commission, so commission can look low or go below
        zero.
      </Note>

      <div className="mt-4">
        <StatGrid>
          <Stat
            icon={Receipt}
            value={money(b.vat_cents)}
            label="VAT on NexG's Fees"
            note="Not NexG's earnings"
          />
          <Stat
            icon={Percent}
            value={money(b.collection_fees_cents)}
            label="Paystack Fees on Payments"
            note={
              b.fee_unknown_count > 0
                ? `${b.fee_unknown_count} payment${b.fee_unknown_count === 1 ? '' : 's'} with no fee reported`
                : 'Not yet posted to the books'
            }
          />
          <Stat icon={Truck} value={money(b.transfer_fees_cents)} label="Paystack Transfer Fees" />
        </StatGrid>
      </div>

      <h3 className="mt-5 flex items-center gap-2 text-sm font-extrabold">
        <Banknote aria-hidden="true" className="text-muted h-4 w-4" />
        Collected, not yet on the books
      </h3>
      <Table
        caption="Paystack payments the books do not carry"
        heads={[
          'Kind',
          { label: 'Payments', right: true },
          { label: 'Collected', right: true },
          { label: 'Refunded', right: true },
        ]}
      >
        {(
          [
            ['Bookings', b.off_books.booking],
            ['Cinema', b.off_books.cinema],
          ] as const
        ).map(([label, o]) => (
          <tr key={label}>
            <td className={`${cell} font-semibold`}>{label}</td>
            <td className={figure}>{o.count.toLocaleString('en-KE')}</td>
            <td className={figure}>{money(o.collected_cents)}</td>
            <td className={figure}>{money(o.refunded_cents)}</td>
          </tr>
        ))}
      </Table>
      <Note>Not counted as earnings: not all of it is NexG&apos;s.</Note>
      <Note>
        Paystack receivable on the books, all time: {money(b.receivable_ledger_cents)}. This is not
        money Paystack holds: settlements, Paystack&apos;s collection fees and order refunds are not
        taken off it.
      </Note>
    </Sheet>
  );
}
