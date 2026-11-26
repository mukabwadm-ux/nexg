import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AccountHome } from '@/components/account/account-home';
import { PhoneConfirm } from '@/components/account/phone-confirm';
import { MyBookings } from '@/components/booking/my-bookings';
import {
  MyApplications,
  MySavedJobs,
  type MyApplication,
  type MySavedJob,
} from '@/components/careers/my-applications';
import { NotificationList } from '@/components/notifications/bell';
import { ReceiptList } from '@/components/receipts/receipt-list';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import type { MyBooking } from '@/lib/booking/customer';
import { RECEIPT_COLUMNS, receiptAmount, receiptDate, toReceipts } from '@/lib/receipts';
import { asMyStayReviews, type MyStayReview } from '@/lib/stay-review';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'orders', label: 'Orders' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'stays', label: 'Stays' },
  { key: 'applications', label: 'Job applications' },
  { key: 'saved', label: 'Saved jobs' },
  { key: 'notifications', label: 'Notifications' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const label = (value: string | null) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ') : '—';

interface StayRow {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  paid_kes: number | null;
  quote_total_kes: number | null;
  payment_reference: string | null;
  refund_due_at: string | null;
  refunded_at: string | null;
  refund_amount_kes: number | null;
}

/** Where a cancelled stay's money stands, or null when no refund is owed or made. */
function stayRefund(stay: StayRow) {
  if (stay.status !== 'cancelled') return null;
  if (stay.refunded_at) {
    const kes = stay.refund_amount_kes ?? stay.paid_kes;
    return kes != null ? `Refunded ${receiptAmount(kes * 100)}` : 'Refunded';
  }
  return stay.refund_due_at ? 'Refund due' : null;
}

/** Under a past NexG stay: "Rate your stay", or the guest's stars linking to their rating. */
function StayRating({ review }: { review: MyStayReview | null }) {
  if (!review || (!review.can_rate && !review.review)) return null;
  const href = `/account/stays/${review.stay_id}/review`;
  return review.review ? (
    <Link
      href={href}
      className="text-muted mt-1 block text-[0.75rem] font-bold"
      aria-label={`You rated this stay ${review.review.rating} out of 5`}
    >
      <span aria-hidden="true" className="text-[#F5B400]">
        {'★'.repeat(review.review.rating)}
      </span>{' '}
      Your rating
    </Link>
  ) : (
    <Link
      href={href}
      className="bg-gold mt-1.5 inline-flex min-h-9 items-center rounded-full px-3.5 text-[0.75rem] font-extrabold text-[#141414] no-underline"
    >
      Rate your stay
    </Link>
  );
}

/**
 * A customer's own account: their receipts, orders, bookings and stays. Everything here
 * is read through row-level security, so it is theirs and nobody else's.
 */
export default async function AccountPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const tab: Tab = TABS.some((t) => t.key === searchParams?.tab)
    ? (searchParams!.tab as Tab)
    : 'home';
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous)
    redirect(`/sign-in?next=${encodeURIComponent(`/account?tab=${tab}`)}`);

  const [receipts, orders, stays, bookings, applications, savedJobs, stayReviews] =
    await Promise.all([
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
            .select(
              'id, check_in, check_out, status, paid_kes, quote_total_kes, payment_reference, refund_due_at, refunded_at, refund_amount_kes',
            )
            .eq('guest_user_id', user.id)
            .order('check_in', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      tab === 'bookings'
        ? supabase.rpc('rpc_my_bookings')
        : Promise.resolve({ data: [], error: null }),
      tab === 'applications'
        ? supabase
            .from('my_job_applications_v')
            .select(
              'id, vacancy_id, status, employer_note, interview_at, created_at, cv_name, title, area, employer_name, city_name, timezone, still_open',
            )
            .order('created_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      tab === 'saved'
        ? supabase
            .from('my_saved_jobs_v')
            .select(
              'vacancy_id, title, area, salary_min, salary_max, salary_period, currency, employer_name, city_name, still_open',
            )
            .order('saved_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      /* Which past stays can be rated, and the guest's own ratings (rpc_stay_review_mine). */
      tab === 'stays'
        ? (
            supabase.rpc as unknown as (
              fn: string,
              args: Record<string, unknown>,
            ) => PromiseLike<{ data: unknown }>
          )('rpc_stay_review_mine', {})
        : Promise.resolve({ data: [] }),
    ]);
  const reviewOf = new Map(asMyStayReviews(stayReviews.data).map((r) => [r.stay_id, r]));

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[56rem] px-4 pb-16 pt-8 sm:px-8">
        <p className="text-muted text-[0.75rem] font-bold">{user.email}</p>
        <h1 className="mt-1 text-[1.75rem] font-extrabold tracking-[-0.02em]">My account</h1>
        <PhoneConfirm
          confirmed={user.phone && user.phone_confirmed_at ? user.phone : null}
          suggested={
            typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : null
          }
        />

        <nav
          className="border-border mt-6 flex gap-6 overflow-x-auto whitespace-nowrap border-b"
          aria-label="Account sections"
        >
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
          {tab === 'home' && <AccountHome />}
          {tab === 'notifications' && <NotificationList />}
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
                      <Link
                        href={`/account/orders/${order.id}`}
                        className="block text-[0.8125rem] font-extrabold"
                      >
                        {order.reference}
                      </Link>
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
                {(stays.data as StayRow[]).map((stay) => {
                  const refund = stayRefund(stay);
                  return (
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
                      <span className="text-right">
                        <span className="block text-[0.875rem] font-extrabold">
                          {stay.paid_kes != null
                            ? receiptAmount(stay.paid_kes * 100)
                            : stay.quote_total_kes != null
                              ? receiptAmount(stay.quote_total_kes * 100)
                              : '—'}
                        </span>
                        {refund && (
                          <span className="text-muted block text-[0.6875rem] font-bold">
                            {refund}
                          </span>
                        )}
                        <StayRating review={reviewOf.get(stay.id) ?? null} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            ))}

          {tab === 'applications' && (
            <MyApplications
              applications={
                applications.error ? null : ((applications.data ?? []) as MyApplication[])
              }
            />
          )}

          {tab === 'saved' && (
            <MySavedJobs jobs={savedJobs.error ? null : ((savedJobs.data ?? []) as MySavedJob[])} />
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
