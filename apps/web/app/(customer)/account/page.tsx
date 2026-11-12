import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { MyBookings } from '@/components/booking/my-bookings';
import { ReceiptList } from '@/components/receipts/receipt-list';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import type { MyBooking } from '@/lib/booking/customer';
import { RECEIPT_COLUMNS, receiptAmount, receiptDate, toReceipts } from '@/lib/receipts';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'receipts', label: 'Receipts' },
  { key: 'orders', label: 'Orders' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'stays', label: 'Stays' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const label = (value: string | null) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ') : '—';

/**
 * A customer's own account: their receipts, orders, bookings and stays. Everything here
 * is read through row-level security, so it is theirs and nobody else's.
 */
export default async function AccountPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const tab: Tab = TABS.some((t) => t.key === searchParams?.tab)
    ? (searchParams!.tab as Tab)
    : 'receipts';
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous)
    redirect(`/sign-in?next=${encodeURIComponent(`/account?tab=${tab}`)}`);

  const [receipts, orders, stays, bookings] = await Promise.all([
    tab === 'receipts'
      ? supabase
          .from('receipt' as never)
          .select(RECEIPT_COLUMNS)
          .eq('party_type', 'guest')
          .eq('party_id', user.id)
          .order('issued_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    tab === 'orders'
      ? supabase
          .from('order')
          .select('id, reference, placed_at, total_cents, stage, payment_status')
          .order('placed_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    tab === 'stays'
      ? supabase
          .from('stay')
          .select('id, check_in, check_out, status, paid_kes, quote_total_kes, payment_reference')
          .eq('guest_user_id', user.id)
          .order('check_in', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    tab === 'bookings'
      ? supabase.rpc('rpc_my_bookings')
      : Promise.resolve({ data: [], error: null }),
  ]);

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[56rem] px-4 pb-16 pt-8 sm:px-8">
        <p className="text-muted text-[0.75rem] font-bold">{user.email}</p>
        <h1 className="mt-1 text-[1.75rem] font-extrabold tracking-[-0.02em]">Your account</h1>

        <nav className="border-border mt-6 flex gap-6 border-b" aria-label="Account sections">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/account?tab=${t.key}`}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`-mb-px border-b-2 pb-3 text-sm font-bold transition-colors ${
                tab === t.key
                  ? 'border-gold text-ink'
                  : 'text-muted hover:text-ink border-transparent'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <section className="mt-6">
          {tab === 'receipts' && (
            <ReceiptList
              receipts={receipts.error ? null : toReceipts(receipts.data)}
              empty="No receipts yet. You get one, here and by email, every time you pay or are refunded."
            />
          )}

          {tab === 'orders' &&
            (orders.error ? (
              <p role="alert" className="text-danger text-sm font-semibold">
                Your orders could not be loaded. Refresh the page to try again.
              </p>
            ) : (orders.data ?? []).length === 0 ? (
              <p className="text-muted text-sm font-semibold">
                No orders yet.{' '}
                <Link href="/discover" className="text-ink underline">
                  Find something near you
                </Link>
                .
              </p>
            ) : (
              <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-xl border">
                {(
                  orders.data as {
                    id: string;
                    reference: string;
                    placed_at: string;
                    total_cents: number;
                    stage: string;
                    payment_status: string;
                  }[]
                ).map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span>
                      <span className="block text-[0.8125rem] font-extrabold">
                        {order.reference}
                      </span>
                      <span className="text-muted block text-[0.75rem] font-semibold">
                        {receiptDate(order.placed_at)} · {label(order.stage)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[0.875rem] font-extrabold">
                        {receiptAmount(order.total_cents)}
                      </span>
                      <span className="text-muted block text-[0.6875rem] font-bold">
                        {label(order.payment_status)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'bookings' && (
            <MyBookings
              bookings={bookings.error ? null : ((bookings.data ?? []) as unknown as MyBooking[])}
            />
          )}

          {tab === 'stays' &&
            (stays.error ? (
              <p role="alert" className="text-danger text-sm font-semibold">
                Your stays could not be loaded. Refresh the page to try again.
              </p>
            ) : (stays.data ?? []).length === 0 ? (
              <p className="text-muted text-sm font-semibold">
                No stays yet.{' '}
                <Link href="/stays" className="text-ink underline">
                  Browse stays
                </Link>
                .
              </p>
            ) : (
              <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-xl border">
                {(
                  stays.data as {
                    id: string;
                    check_in: string;
                    check_out: string;
                    status: string;
                    paid_kes: number | null;
                    quote_total_kes: number | null;
                    payment_reference: string | null;
                  }[]
                ).map((stay) => (
                  <li key={stay.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span>
                      <span className="block text-[0.8125rem] font-extrabold">
                        {receiptDate(stay.check_in)} → {receiptDate(stay.check_out)}
                      </span>
                      <span className="text-muted block text-[0.75rem] font-semibold">
                        {stay.status === 'held' ? 'On hold' : label(stay.status)}
                        {stay.payment_reference ? ` · ${stay.payment_reference}` : ''}
                      </span>
                    </span>
                    <span className="block text-[0.875rem] font-extrabold">
                      {stay.paid_kes != null
                        ? receiptAmount(stay.paid_kes * 100)
                        : stay.quote_total_kes != null
                          ? receiptAmount(stay.quote_total_kes * 100)
                          : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
