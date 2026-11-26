import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { receiptDate } from '@/lib/receipts';
import { asMyStayReviews, STAY_REVIEW_CATEGORIES } from '@/lib/stay-review';
import { createClient } from '@/lib/supabase/server';

import { StayReviewForm } from './review-form';

export const metadata: Metadata = {
  title: 'Rate your stay',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }>;

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/**
 * Rate one stay: the overall rating, six optional categories and a few words. Only the guest who
 * booked it on NexG reaches the form (rpc_stay_review_mine reads their own stays only), only once
 * they have checked out, and they can change it for 14 days. The email the day after check-out
 * links here.
 */
export default async function StayReviewPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const path = `/account/stays/${params.id}/review`;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect(`/sign-in?next=${encodeURIComponent(path)}`);

  const { data } = await (supabase.rpc as unknown as Rpc)('rpc_stay_review_mine', {
    p_stay_id: params.id,
  });
  const stay = asMyStayReviews(data)[0];
  if (!stay) notFound();
  const place = [stay.unit_label, stay.property_name].filter(Boolean).join(' · ') || 'Your stay';
  const review = stay.review;
  const departed = stay.status === 'departed' || new Date(stay.check_out) <= new Date();

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-[40rem] flex-col gap-5 px-4 pb-16 pt-8 sm:px-8">
        <Link href="/account?tab=stays" className="text-sm font-bold">
          All stays
        </Link>
        <div>
          <p className="text-muted text-[0.8125rem] font-bold">
            {receiptDate(stay.check_in)} → {receiptDate(stay.check_out)}
          </p>
          <h1 className="mt-1 text-[1.75rem] font-extrabold tracking-[-0.02em]">
            {review ? 'Your rating' : 'Rate your stay'}
          </h1>
          <p className="mt-1 font-bold">{place}</p>
        </div>

        {stay.can_rate ? (
          <>
            {review && (
              <p className="text-muted text-sm">
                You can change your rating until {receiptDate(review.editable_until)}.
              </p>
            )}
            <StayReviewForm stayId={stay.stay_id} initial={review} />
          </>
        ) : review ? (
          <section className="border-border flex flex-col gap-3 rounded-2xl border bg-white p-5">
            <p className="text-lg font-extrabold">
              <span aria-hidden="true" className="text-[#F5B400]">
                {stars(review.rating)}
              </span>{' '}
              {review.rating} out of 5
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {STAY_REVIEW_CATEGORIES.filter((c) => typeof review[c.key] === 'number').map((c) => (
                <li key={c.key} className="flex justify-between gap-3 text-sm">
                  <span className="font-bold">{c.label}</span>
                  <span>{review[c.key]} / 5</span>
                </li>
              ))}
            </ul>
            {review.text && <p className="text-[0.9375rem] leading-relaxed">“{review.text}”</p>}
            {review.staff_reply && (
              <p className="bg-bg rounded-lg p-3 text-sm">
                <span className="font-bold">NexG replied:</span> {review.staff_reply}
              </p>
            )}
            <p className="text-muted text-[0.75rem]">
              Rated {receiptDate(review.answered_at)}. Reviews can be changed for 14 days.
            </p>
          </section>
        ) : (
          <p className="text-muted text-sm font-semibold">
            {departed
              ? 'This stay can no longer be rated.'
              : `You can rate this stay once you check out on ${receiptDate(stay.check_out)}.`}
          </p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
